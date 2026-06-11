import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
import { acrescentarAoDailyCom, getDailyCom, hojeLisboa } from '../modules/daily/daily.service';
import { formatDailyTurnoEntry, type DailyTurnoNota } from '../modules/daily/daily.capture';
import { registarEscrita } from './resultado';

// MCP server stdio do agente-autor: as mãos e os olhos da sessão agentic sobre
// o kernel (procurar/ler/criar/continuar nota, daily). Lançado pelo claude CLI
// como subprocesso; autentica com a sessão do UTILIZADOR (tokens por env), por
// isso corre sob RLS real — sem service role. As escritas reutilizam os
// serviços `...Com` (mesmo caminho do one-shot: RPCs transacionais + projeção
// de índices), e ficam registadas no ficheiro de resultado para o job.
const RESULT_FILE = process.env.MEMVECTOR_AGENT_RESULT_FILE ?? '';

// A nota escrita neste turno entra na entrada do daily (paridade com o formato
// do caminho one-shot: "Estado escrito: [[slug]]").
let notaDoTurno: DailyTurnoNota | null = null;

async function criarDb(): Promise<SupabaseClient> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const accessToken = process.env.MEMVECTOR_AGENT_ACCESS_TOKEN;
    const refreshToken = process.env.MEMVECTOR_AGENT_REFRESH_TOKEN;
    if (!url || !anon) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY no ambiente.');
    if (!accessToken || !refreshToken) {
        throw new Error('Falta MEMVECTOR_AGENT_ACCESS_TOKEN/REFRESH_TOKEN no ambiente.');
    }
    const db = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await db.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
    });
    if (error) throw new Error(`sessão do agente inválida: ${error.message}`);
    return db;
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

async function executarTool(db: SupabaseClient, name: string, args: Args): Promise<string> {
    switch (name) {
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
            return JSON.stringify(
                { id: nota.id, slug: nota.slug, title: nota.title, content_md: nota.contentMd },
                null,
                2,
            );
        }
        case 'criar_nota': {
            const r = await escreverNotaCom(
                db,
                {
                    title: texto(args, 'title'),
                    content_md: texto(args, 'content_md'),
                    links: Array.isArray(args.links) ? listaStrings(args, 'links') : [],
                    reason: texto(args, 'reason'),
                    summary: typeof args.summary === 'string' ? args.summary : undefined,
                },
                'agent',
            );
            const criada = r.diff === null;
            notaDoTurno = { slug: r.slug, title: r.title, criada };
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
                summaryDoAgente(typeof args.summary === 'string' ? args.summary : undefined),
            );
            notaDoTurno = { slug: r.slug, title: r.title, criada: false };
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
                nota: notaDoTurno,
            });
            const r = await acrescentarAoDailyCom(db, entrada);
            if (RESULT_FILE) {
                registarEscrita(RESULT_FILE, { tipo: 'daily', dia: r.dia, criado: r.criado });
            }
            return `Daily de ${r.dia} ${r.criado ? 'criado' : 'atualizado'}.`;
        }
        case 'ler_daily_hoje': {
            const daily = await getDailyCom(db, hojeLisboa());
            return daily?.contentMd ?? '(ainda não há daily hoje)';
        }
        default:
            throw new Error(`tool desconhecida: ${name}`);
    }
}

async function main(): Promise<void> {
    const db = await criarDb();
    const server = new Server(
        { name: 'memvector', version: '0.1.0' },
        { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const { name, arguments: args } = req.params;
        try {
            const resultado = await executarTool(db, name, (args ?? {}) as Args);
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
