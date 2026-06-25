import { type SupabaseClient } from '@supabase/supabase-js';
import { criarDb } from './agent-db';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import {
    atualizarNotaPorIdCom,
    candidatosParaFactoCom,
    escreverNotaCom,
    getNotaPorIdCom,
    summaryDoAgente,
} from '../modules/knowledge/knowledge.service';
import { normalizarTags, tagsDoAgente } from '../modules/knowledge/knowledge.props';
import { avaliarCriarNota } from '../modules/knowledge/knowledge.guards';
import {
    acrescentarAoDailyCom,
    getDailyCom,
    hojeLisboa,
    resolverDataDaily,
} from '../modules/daily/daily.service';
import {
    listarTarefasAbertasCom,
    criarTarefaCom,
    concluirTarefaCom,
    ligarIssueTarefaCom,
} from '../modules/tarefas/tarefas.service';
import { formatDailyTurnoEntry, type DailyTurnoNota } from '../modules/daily/daily.capture';
import { registarEscrita, registarWeb } from './resultado';
import { procurarWeb, lerUrl, LimiteWebError } from '../lib/web';
import { envolverDados, envolverDadosOuFallback } from '../lib/datamark';
import { criarIssue, lerIssues, comentarIssue, numeroDoUrl } from '../lib/github';

// MCP server stdio do agente-autor: as mãos e os olhos da sessão agentic sobre
// o kernel (procurar/ler/criar/continuar nota, daily). Lançado pelo claude CLI
// como subprocesso; autentica com a sessão do UTILIZADOR (tokens por env), por
// isso corre sob RLS real — sem service role. As escritas reutilizam os
// serviços `...Com` (mesmo caminho do one-shot: RPCs transacionais + projeção
// de índices), e ficam registadas no ficheiro de resultado para o job.
const RESULT_FILE = process.env.MEMVECTOR_AGENT_RESULT_FILE ?? '';
// #45: key Tavily opcional (cifrada nas Definições, passada por env). Sem ela, o
// procurar_web cai no DuckDuckGo sem-key (flaky → avisa para configurar a key).
const WEB_KEY = process.env.MEMVECTOR_AGENT_WEB_KEY || undefined;
// M7: token + repos ligados do GitHub (por env, como o WEB_KEY). Sem token, as
// tools de issue nem se registam — o módulo está desligado para esta sessão.
const GITHUB_TOKEN = process.env.MEMVECTOR_AGENT_GITHUB_TOKEN || undefined;
const GITHUB_REPOS = (process.env.MEMVECTOR_AGENT_GITHUB_REPOS || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
// As tools de issue só se registam com token E ao menos 1 repo ligado (defensivo
// — o chat.service já só entrega o token quando o github está ativo).
const GITHUB_ON = !!GITHUB_TOKEN && GITHUB_REPOS.length > 0;

// A nota escrita neste turno entra na entrada do daily (paridade com o formato
// do caminho one-shot: "Estado escrito: [[slug]]"). Vive num contexto por
// sessão, não em estado de módulo — se este server um dia for reutilizado por
// várias sessões, o estado não vaza entre elas (audit #27).
interface EstadoTurno {
    notasDoTurno: DailyTurnoNota[];
}

// 1 bloco → N notas: regista cada nota tocada no turno, dedup por slug (a última vence).
function registarNotaTurno(estado: EstadoTurno, nota: DailyTurnoNota): void {
    const i = estado.notasDoTurno.findIndex((n) => n.slug === nota.slug);
    if (i >= 0) estado.notasDoTurno[i] = nota;
    else estado.notasDoTurno.push(nota);
}

const TOOLS = [
    {
        name: 'procurar_notas',
        description:
            'Procura notas existentes relacionadas com um texto (busca híbrida). Devolve id, título e slug — usa ler_nota para o conteúdo.',
        inputSchema: {
            type: 'object',
            properties: { texto: { type: 'string', description: 'Texto do facto ou assunto' } },
            required: ['texto'],
        },
    },
    {
        name: 'ler_nota',
        description: 'Lê o conteúdo completo de uma nota pelo id.',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Id da nota' } },
            required: ['id'],
        },
    },
    {
        name: 'criar_nota',
        description:
            'Cria uma nota nova no workspace. Só quando o assunto ainda não existe — para assunto existente usa continuar_nota.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Rótulo curto, 3-6 palavras' },
                content_md: { type: 'string', description: 'Markdown; começa com "# <título>"' },
                links: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Slugs das notas ligadas por [[wikilink]] no corpo',
                },
                reason: { type: 'string', description: 'Porque é que este facto é durável' },
                summary: { type: 'string', description: 'Uma frase que resume a nota inteira' },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        '1 a 4 etiquetas curtas (minúsculas, sem #) que classificam o assunto; reutiliza as já em uso',
                },
            },
            required: ['title', 'content_md', 'reason'],
        },
    },
    {
        name: 'continuar_nota',
        description:
            'Continua uma nota existente: substitui o conteúdo pelo content_md COMPLETO com o facto novo integrado na prosa.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Id da nota a continuar' },
                content_md: {
                    type: 'string',
                    description: 'Conteúdo COMPLETO da nota com o facto integrado',
                },
                summary: {
                    type: 'string',
                    description: 'Uma frase que re-resume a nota inteira como fica',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        'Etiquetas a acrescentar (minúsculas, sem #); são unidas às que a nota já tem, nunca as substituem',
                },
            },
            required: ['id', 'content_md'],
        },
    },
    {
        name: 'acrescentar_daily',
        description:
            'Regista o turno no daily de hoje: 1 a 5 bullets curtos do que aconteceu. Chama no máximo uma vez, no fim.',
        inputSchema: {
            type: 'object',
            properties: {
                bullets: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 1,
                    maxItems: 5,
                    description: 'Bullets sem o prefixo "- "',
                },
            },
            required: ['bullets'],
        },
    },
    {
        name: 'ler_daily_hoje',
        description: 'Lê o conteúdo atual do daily de hoje (para não duplicar registos).',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'ler_daily',
        description:
            'Lê o daily de uma data — "hoje", "ontem" ou "AAAA-MM-DD". Usa para perguntas temporais ("o que fiz ontem?"): a recuperação por semelhança falha em datas, esta tool vai direta.',
        inputSchema: {
            type: 'object',
            properties: {
                quando: { type: 'string', description: '"hoje", "ontem" ou "AAAA-MM-DD"' },
            },
            required: ['quando'],
        },
    },
    {
        name: 'listar_tarefas_abertas',
        description:
            'Lista as tarefas em aberto do utilizador (id, título, projeto, estado). Usa antes de criar (não duplicar) e para concluir por id.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'criar_tarefa',
        description:
            'Cria uma tarefa (AÇÃO do utilizador: fazer/lembrar/acompanhar). Na dúvida cria — apagar é barato. Factos vão para notas, nunca para tarefas.',
        inputSchema: {
            type: 'object',
            properties: {
                titulo: { type: 'string', description: 'Verbo + objeto, curto' },
                projeto: {
                    type: 'string',
                    description:
                        'Nome do projeto (#47): usa um existente (vê as tarefas abertas) ou um nome novo curto — resolve/cria sempre um projeto real; vazio = "Pessoal"',
                },
                prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta'] },
                dataFim: {
                    type: 'string',
                    description:
                        'Data fim AAAA-MM-DD quando a conversa traz prazo (fim de semana = domingo)',
                },
            },
            required: ['titulo'],
        },
    },
    {
        name: 'concluir_tarefa',
        description:
            'Conclui uma tarefa em aberto quando a conversa diz que está feita. O id vem de listar_tarefas_abertas. A conclusão fica registada no daily automaticamente.',
        inputSchema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Id da tarefa' } },
            required: ['id'],
        },
    },
    {
        name: 'procurar_web',
        description:
            'Pesquisa na INTERNET e devolve os melhores resultados (título, URL, snippet). Usa para informação externa, atual, ou que não esteja no workspace. Cita os URLs na resposta.',
        inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'O que procurar' } },
            required: ['query'],
        },
    },
    {
        name: 'ler_url',
        description:
            'Lê o texto de uma página web a partir do URL (para aprofundar um resultado de procurar_web).',
        inputSchema: {
            type: 'object',
            properties: { url: { type: 'string', description: 'URL http(s) a ler' } },
            required: ['url'],
        },
    },
];

// M7: tools de issue via gh (só entram quando há token). A guarda da escrita é a
// promoção assistida — descrita aqui e reforçada no system prompt do responder.
const GITHUB_TOOLS = [
    {
        name: 'ler_issues',
        description:
            'Lista as issues abertas de um repositório LIGADO (number, title, state, url). Usa antes de criar (não duplicar) e para responder sobre o estado do trabalho.',
        inputSchema: {
            type: 'object',
            properties: {
                repo: { type: 'string', description: 'Repo "owner/nome" da lista ligada' },
            },
            required: ['repo'],
        },
    },
    {
        name: 'criar_issue',
        description:
            'Cria uma issue num repositório LIGADO — promove uma tarefa/bug durável de um projeto para o GitHub (modelo 2.2). Só depois de o utilizador confirmar (promoção assistida). O body leva enquadramento completo, não uma linha. Devolve o URL.',
        inputSchema: {
            type: 'object',
            properties: {
                repo: { type: 'string', description: 'Repo "owner/nome" da lista ligada' },
                title: { type: 'string', description: 'Título curto (verbo + objeto)' },
                body: {
                    type: 'string',
                    description: 'Corpo markdown com enquadramento completo',
                },
            },
            required: ['repo', 'title', 'body'],
        },
    },
    {
        name: 'comentar_issue',
        description:
            'Comenta numa issue existente de um repositório LIGADO (relay entre agentes, atualização de estado). Só depois de o utilizador confirmar. Devolve o URL do comentário.',
        inputSchema: {
            type: 'object',
            properties: {
                repo: { type: 'string', description: 'Repo "owner/nome" da lista ligada' },
                number: { type: 'number', description: 'Número da issue' },
                body: { type: 'string', description: 'Comentário em markdown' },
            },
            required: ['repo', 'number', 'body'],
        },
    },
    {
        name: 'promover_a_issue',
        description:
            'Promoção assistida (modelo 2.2) de uma tarefa de CÓDIGO durável: cria a ISSUE no repo ligado E um CARTÃO Backlog ligado a ela, num passo. PROPÕE primeiro e só corre depois de o utilizador confirmar. Usa isto (não criar_issue) quando a tarefa é trabalho de código a entrar no pipeline do relay — depois o utilizador arrasta o cartão para Análise e o relay corre.',
        inputSchema: {
            type: 'object',
            properties: {
                repo: { type: 'string', description: 'Repo "owner/nome" da lista ligada' },
                titulo: { type: 'string', description: 'Título curto (verbo + objeto)' },
                body: { type: 'string', description: 'Corpo da issue com enquadramento completo' },
                projeto: { type: 'string', description: 'Nome do projeto (opcional)' },
            },
            required: ['repo', 'titulo', 'body'],
        },
    },
];

type Args = Record<string, unknown>;

function texto(args: Args, campo: string): string {
    const v = args[campo];
    if (typeof v !== 'string' || !v.trim()) throw new Error(`"${campo}" em falta ou vazio`);
    return v;
}

function listaStrings(args: Args, campo: string): string[] {
    const v = args[campo];
    if (!Array.isArray(v)) throw new Error(`"${campo}" tem de ser uma lista`);
    return v.map(String);
}

// M7: o agente só toca em repos LIGADOS (defesa — não inventa um repo fora do
// connect). GITHUB_TOKEN está garantido nas cases (a tool só existe com ele).
function repoLigado(args: Args): string {
    const repo = texto(args, 'repo');
    if (!GITHUB_REPOS.includes(repo)) {
        throw new Error(
            `repo "${repo}" não está ligado. Ligados: ${GITHUB_REPOS.join(', ') || '(nenhum — liga em Definições > GitHub)'}.`,
        );
    }
    return repo;
}

async function executarTool(
    db: SupabaseClient,
    estado: EstadoTurno,
    name: string,
    args: Args,
): Promise<string> {
    switch (name) {
        // Datamark: envolvemos conteúdo livre que pode transportar instruções
        // (notas, daily, web, issues). procurar_notas/listar_tarefas devolvem só
        // metadata da DB do próprio utilizador (id/título/slug/estado) — não se envolve.
        case 'procurar_notas': {
            const notas = await candidatosParaFactoCom(db, texto(args, 'texto'));
            if (!notas.length) return 'Sem notas relacionadas.';
            return JSON.stringify(
                notas.map((n) => ({ id: n.id, title: n.title, slug: n.slug })),
                null,
                2,
            );
        }
        case 'ler_nota': {
            const nota = await getNotaPorIdCom(db, texto(args, 'id'));
            if (!nota) return 'Nota não encontrada.';
            return envolverDados(
                JSON.stringify(
                    { id: nota.id, slug: nota.slug, title: nota.title, content_md: nota.contentMd },
                    null,
                    2,
                ),
                'nota',
            );
        }
        case 'criar_nota': {
            const content = texto(args, 'content_md');
            // #121: guard sem-órfãos (recuperável) ANTES de escrever. Se a nota
            // não liga a nada e há vizinhos para ligar, devolve a sugestão ao
            // agente em vez de aceitar a ilha. Reusa o pool da busca híbrida.
            const candidatas = await candidatosParaFactoCom(
                db,
                `${texto(args, 'title')}\n${content}`,
            );
            const veredito = avaliarCriarNota(content, candidatas);
            if (!veredito.ok) return veredito.mensagem;
            const r = await escreverNotaCom(
                db,
                {
                    title: texto(args, 'title'),
                    content_md: content,
                    links: Array.isArray(args.links) ? listaStrings(args, 'links') : [],
                    reason: texto(args, 'reason'),
                    summary: typeof args.summary === 'string' ? args.summary : undefined,
                    // #95: paridade com o one-shot — o agentic também classifica.
                    tags: normalizarTags(
                        Array.isArray(args.tags) ? listaStrings(args, 'tags') : [],
                    ),
                },
                'agent',
            );
            const criada = r.diff === null;
            registarNotaTurno(estado, { slug: r.slug, title: r.title, criada });
            if (RESULT_FILE) {
                registarEscrita(RESULT_FILE, {
                    tipo: 'nota',
                    slug: r.slug,
                    title: r.title,
                    criada,
                });
            }
            return `Nota [[${r.slug}]] ${criada ? 'criada' : 'atualizada'} (id: ${r.id}).`;
        }
        case 'continuar_nota': {
            const r = await atualizarNotaPorIdCom(
                db,
                texto(args, 'id'),
                texto(args, 'content_md'),
                'agent',
                {
                    ...summaryDoAgente(typeof args.summary === 'string' ? args.summary : undefined),
                    // #95: tags acrescentadas — o RPC une com as existentes (guard).
                    ...tagsDoAgente(
                        normalizarTags(Array.isArray(args.tags) ? listaStrings(args, 'tags') : []),
                    ),
                },
            );
            registarNotaTurno(estado, { slug: r.slug, title: r.title, criada: false });
            if (RESULT_FILE) {
                registarEscrita(RESULT_FILE, {
                    tipo: 'nota',
                    slug: r.slug,
                    title: r.title,
                    criada: false,
                });
            }
            return `Nota [[${r.slug}]] continuada.`;
        }
        case 'acrescentar_daily': {
            const bullets = listaStrings(args, 'bullets').filter((b) => b.trim());
            if (!bullets.length) throw new Error('daily sem bullets');
            const entrada = formatDailyTurnoEntry({
                resumoMd: bullets.map((b) => `- ${b}`).join('\n'),
                notas: estado.notasDoTurno,
            });
            const r = await acrescentarAoDailyCom(db, entrada);
            if (RESULT_FILE) {
                registarEscrita(RESULT_FILE, { tipo: 'daily', dia: r.dia, criado: r.criado });
            }
            return `Daily de ${r.dia} ${r.criado ? 'criado' : 'atualizado'}.`;
        }
        case 'ler_daily_hoje': {
            const daily = await getDailyCom(db, hojeLisboa());
            return envolverDadosOuFallback(daily?.contentMd, 'daily', '(ainda não há daily hoje)');
        }
        case 'ler_daily': {
            const quando = texto(args, 'quando');
            const dia = resolverDataDaily(quando);
            if (!dia)
                return `Data não reconhecida: "${quando}". Usa "hoje", "ontem" ou "AAAA-MM-DD".`;
            const daily = await getDailyCom(db, dia);
            return envolverDadosOuFallback(daily?.contentMd, 'daily', `(não há daily para ${dia})`);
        }
        case 'listar_tarefas_abertas': {
            const tarefas = await listarTarefasAbertasCom(db);
            if (!tarefas.length) return 'Sem tarefas em aberto.';
            return JSON.stringify(
                tarefas.map((t) => ({
                    id: t.id,
                    titulo: t.titulo,
                    projeto: t.projeto,
                    estado: t.estado,
                })),
                null,
                2,
            );
        }
        case 'criar_tarefa': {
            const t = await criarTarefaCom(db, {
                titulo: texto(args, 'titulo'),
                projeto: typeof args.projeto === 'string' ? args.projeto : undefined,
                prioridade:
                    args.prioridade === 'baixa' || args.prioridade === 'alta'
                        ? args.prioridade
                        : 'normal',
                dataFim:
                    typeof args.dataFim === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.dataFim)
                        ? args.dataFim
                        : undefined,
                visibility: 'privado',
            });
            if (RESULT_FILE) {
                registarEscrita(RESULT_FILE, {
                    tipo: 'tarefa',
                    acao: 'criada',
                    id: t.id,
                    titulo: t.titulo,
                });
            }
            return `Tarefa criada: "${t.titulo}" (id: ${t.id}).`;
        }
        case 'concluir_tarefa': {
            const t = await concluirTarefaCom(db, texto(args, 'id'));
            if (RESULT_FILE) {
                registarEscrita(RESULT_FILE, {
                    tipo: 'tarefa',
                    acao: 'concluida',
                    id: t.id,
                    titulo: t.titulo,
                });
            }
            return `Tarefa concluída: "${t.titulo}" (registada no daily).`;
        }
        case 'procurar_web': {
            try {
                const resultados = await procurarWeb(texto(args, 'query'), { webKey: WEB_KEY });
                if (RESULT_FILE) {
                    for (const r of resultados) {
                        registarWeb(RESULT_FILE, { tipo: 'web', url: r.url, titulo: r.titulo });
                    }
                }
                return envolverDados(JSON.stringify(resultados, null, 2), 'web');
            } catch (e) {
                // Limite/bloqueio do provider sem-key: devolve uma instrução para o
                // agente AVISAR o utilizador a configurar a key (regra do Carlos).
                if (e instanceof LimiteWebError) {
                    return `LIMITE_WEB: ${e.message} Diz ao utilizador, na resposta, que a pesquisa web atingiu o limite e que pode configurar uma key Tavily (grátis) em Definições > Chat para continuar.`;
                }
                return `Erro na pesquisa web: ${e instanceof Error ? e.message : 'desconhecido'}`;
            }
        }
        case 'ler_url': {
            const url = texto(args, 'url');
            try {
                const conteudo = await lerUrl(url);
                if (RESULT_FILE) registarWeb(RESULT_FILE, { tipo: 'web', url, titulo: url });
                return envolverDadosOuFallback(conteudo, 'web', '(página sem texto)');
            } catch (e) {
                return `Erro ao ler ${url}: ${e instanceof Error ? e.message : 'desconhecido'}`;
            }
        }
        case 'ler_issues': {
            const issues = await lerIssues(GITHUB_TOKEN!, { repo: repoLigado(args) });
            if (!issues.length) return 'Sem issues abertas nesse repo.';
            return envolverDados(JSON.stringify(issues, null, 2), 'github');
        }
        case 'criar_issue': {
            const url = await criarIssue(GITHUB_TOKEN!, {
                repo: repoLigado(args),
                title: texto(args, 'title'),
                body: texto(args, 'body'),
            });
            return `Issue criada: ${url}`;
        }
        case 'comentar_issue': {
            const n = Number(args.number);
            if (!Number.isInteger(n) || n <= 0)
                throw new Error('"number" tem de ser o nº da issue');
            const url = await comentarIssue(GITHUB_TOKEN!, {
                repo: repoLigado(args),
                number: n,
                body: texto(args, 'body'),
            });
            return `Comentário publicado: ${url}`;
        }
        case 'promover_a_issue': {
            const repo = repoLigado(args);
            const titulo = texto(args, 'titulo');
            const url = await criarIssue(GITHUB_TOKEN!, {
                repo,
                title: titulo,
                body: texto(args, 'body'),
            });
            const numero = numeroDoUrl(url);
            const tarefa = await criarTarefaCom(db, {
                titulo,
                projeto: typeof args.projeto === 'string' ? args.projeto : undefined,
                prioridade: 'normal',
                visibility: 'privado',
            });
            if (numero) await ligarIssueTarefaCom(db, tarefa.id, repo, numero);
            if (RESULT_FILE) {
                registarEscrita(RESULT_FILE, {
                    tipo: 'tarefa',
                    acao: 'criada',
                    id: tarefa.id,
                    titulo,
                });
            }
            return `Promovido: issue ${url} + cartão Backlog ligado. Arrasta o cartão para Análise para o relay correr.`;
        }
        default:
            throw new Error(`tool desconhecida: ${name}`);
    }
}

async function main(): Promise<void> {
    const db = await criarDb();
    const estado: EstadoTurno = { notasDoTurno: [] };
    const server = new Server(
        { name: 'memvector', version: '0.1.0' },
        { capabilities: { tools: {} } },
    );

    // M7: as tools de issue só aparecem com token + ao menos 1 repo ligado.
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: GITHUB_ON ? [...TOOLS, ...GITHUB_TOOLS] : TOOLS,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const { name, arguments: args } = req.params;
        try {
            const resultado = await executarTool(db, estado, name, (args ?? {}) as Args);
            return { content: [{ type: 'text', text: resultado }] };
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'erro desconhecido';
            return { content: [{ type: 'text', text: `Erro: ${msg}` }], isError: true };
        }
    });

    await server.connect(new StdioServerTransport());
}

main().catch((e: unknown) => {
    console.error('mcp-tools falhou:', e);
    process.exit(1);
});
