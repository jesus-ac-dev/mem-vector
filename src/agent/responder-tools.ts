import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import { generateAgentic, generateAgenticStream } from '@/lib/claude';
import { lerWebConsultado, lerRelaysPedidos } from './resultado';
import { dispararRelay } from '@/modules/relay/relay.actions';

// #85 fatia 2: o agente escalado (two-phase) responde com TOOLS — leitura do
// workspace (notas/daily-por-data/tarefas) E web. O CLI não faz WebSearch/WebFetch
// reais em -p (inventa), por isso a web é uma tool MCP nossa; e o RAG por
// semelhança falha em queries de data/nome, por isso a leitura direta do workspace
// é tool também. Só se chega aqui quando o caminho rápido emitiu [[ESCALAR]].
const TOOLS_RESPOSTA = [
    'mcp__memvector__procurar_notas',
    'mcp__memvector__ler_nota',
    'mcp__memvector__ler_daily_hoje',
    'mcp__memvector__ler_daily',
    'mcp__memvector__listar_tarefas_abertas',
    'mcp__memvector__procurar_web',
    'mcp__memvector__ler_url',
    // M7: tools de issue (só registadas pelo server quando há token — o
    // whitelist sempre presente é inócuo se o server não as expõe).
    'mcp__memvector__ler_issues',
    'mcp__memvector__criar_issue',
    'mcp__memvector__comentar_issue',
    'mcp__memvector__promover_a_issue',
    'mcp__memvector__disparar_relay',
    'mcp__memvector__ler_estado_relay',
];

const SYSTEM_RESPOSTA =
    'És o assistente deste workspace. Respondes em português de Portugal, conciso e direto. ' +
    'Chegaste aqui porque a pergunta precisa de ir BUSCAR algo. Usa as tools certas:\n' +
    '1. WORKSPACE — perguntas sobre o trabalho do utilizador. Para uma DATA ("o que fiz ontem", ' +
    '"3ª feira") usa ler_daily ("hoje"/"ontem"/"AAAA-MM-DD") — NÃO confies só no contexto, que é ' +
    'recuperado por semelhança e falha em datas. Para uma NOTA/assunto usa procurar_notas + ler_nota. ' +
    'Para tarefas usa listar_tarefas_abertas.\n' +
    '2. WEB — só para factos do MUNDO (notícias, desporto, preços, versões, meteorologia). Cita ' +
    'SEMPRE os URLs (links markdown). Se devolver LIMITE_WEB, avisa o utilizador.\n' +
    'Não inventes — se a tool não devolver nada, di-lo claramente (ex.: "não há daily de 17/06"). ' +
    'O workspace regista sozinho os factos duráveis, não peças licença para guardar.';

// M7 (modelo 2.2 + promoção assistida): anexa-se ao system prompt SÓ quando o
// módulo GitHub está ligado (token presente). A guarda da escrita é a confirmação
// — o agente nunca cria/comenta de surpresa.
const CONVENCAO_GITHUB =
    '\n\nGITHUB (modelo 2.2): tens tools de issues nos repos LIGADOS — ler_issues, criar_issue, ' +
    'comentar_issue, promover_a_issue. Uma tarefa ou bug DURÁVEL de um projeto ligado pertence a ' +
    'uma ISSUE no repo desse projeto, não a uma nota. Se for trabalho de CÓDIGO (entra no pipeline ' +
    'do relay), usa promover_a_issue — cria a issue E o cartão Backlog ligado, e o utilizador ' +
    'arrasta-o para Análise para o relay correr. PROMOÇÃO ASSISTIDA: nunca crias/promoves/comentas ' +
    'de surpresa — PROPÕE ("queres que promova «X» a issue em owner/nome?") e só ages quando o ' +
    'utilizador CONFIRMA; se ele já pediu claramente, age direto. O repo é um dos LIGADOS (não ' +
    'inventes outro); antes de criar, usa ler_issues para não duplicar. O body leva enquadramento ' +
    'completo (contexto, o que fazer, critério de pronto), não uma linha. Cita o URL na resposta.' +
    '\n\nRELAY: para pôr os agentes a trabalhar uma issue (análise→dev→testes→docs→auditoria), usa ' +
    'disparar_relay — mesma confirmação assistida (PROPÕE / só ages quando o utilizador confirma ou ' +
    'pede claramente "vamos fazer a #N"). Corre em background: acompanha com ler_estado_relay e ' +
    'relata fase/estado/PR. O MERGE é decisão do utilizador — nunca mergeas.' +
    '\n\nRELAY PROATIVO: se detetares trabalho de CÓDIGO durável e BEM-DEFINIDO (claro o quê + ' +
    'critério de pronto) que o utilizador descreveu mas ainda não encaminhou, levanta tu o relay — ' +
    'sem issue ainda, propõe promover_a_issue; com issue já criada, propõe disparar_relay. Para ' +
    'trabalho vago/meio-cozido, perguntas ou não-código, NÃO proponhas — pergunta antes o que falta. ' +
    'Continua a CONFIRMAR sempre; nunca disparas sem o OK do utilizador.';

export interface RespostaTools {
    text: string;
    costUsd: number;
    model?: string;
    tokensIn?: number | null;
    tokensCache?: number | null;
    tokensOut?: number | null;
    webSources: { url: string; titulo: string }[];
}

export async function responderComToolsCom(
    db: SupabaseClient,
    prompt: string,
    webKey?: string,
    model?: string,
    onTextDelta?: (texto: string) => void,
    onFerramenta?: (nome: string) => void,
    gh?: { token?: string; repos: string[] },
): Promise<RespostaTools> {
    const {
        data: { session },
    } = await db.auth.getSession();
    if (!session) throw new Error('sem sessão para a resposta com web');

    const resultFile = join(tmpdir(), `memvector-web-${randomUUID()}.jsonl`);
    // O pai cria o ficheiro (wx, 0600): ninguém o pode plantar com URLs falsos.
    writeFileSync(resultFile, '', { flag: 'wx', mode: 0o600 });
    const raiz = process.cwd();
    const mcpConfig = JSON.stringify({
        mcpServers: {
            memvector: {
                command: join(raiz, 'node_modules', '.bin', 'tsx'),
                args: [
                    '--tsconfig',
                    join(raiz, 'tsconfig.json'),
                    join(raiz, 'src', 'agent', 'mcp-tools.ts'),
                ],
            },
        },
    });

    try {
        const cfg = {
            mcpConfig,
            allowedTools: TOOLS_RESPOSTA,
            // M7: a convenção GitHub só entra com o módulo ligado (token presente) —
            // senão o agente nem sabe das tools de issue.
            systemPrompt: gh?.token ? `${SYSTEM_RESPOSTA}${CONVENCAO_GITHUB}` : SYSTEM_RESPOSTA,
            model,
            env: {
                // #159: só o access token — passar o refresh token deixava o agente
                // rotá-lo e derrubar a sessão do browser do utilizador.
                MEMVECTOR_AGENT_ACCESS_TOKEN: session.access_token,
                MEMVECTOR_AGENT_RESULT_FILE: resultFile,
                ...(webKey ? { MEMVECTOR_AGENT_WEB_KEY: webKey } : {}),
                ...(gh?.token
                    ? {
                          MEMVECTOR_AGENT_GITHUB_TOKEN: gh.token,
                          MEMVECTOR_AGENT_GITHUB_REPOS: (gh.repos ?? []).join(','),
                      }
                    : {}),
            },
        };
        // #100: com callback, a resposta escalada streama token-a-token (o
        // indicador deixa de ficar preso); sem ele, mantém o bloco único.
        const g = onTextDelta
            ? await generateAgenticStream(prompt, cfg, onTextDelta, onFerramenta)
            : await generateAgentic(prompt, cfg);
        const webSources = lerWebConsultado(resultFile).map((r) => ({
            url: r.url,
            titulo: r.titulo,
        }));
        // M7-A: o agente registou pedidos de relay no result-file (não pode correr
        // o orquestrador no subprocesso MCP). Aqui (contexto Next) disparamo-los.
        const avisosRelay: string[] = [];
        for (const p of lerRelaysPedidos(resultFile)) {
            try {
                const r = await dispararRelay(p.repo, p.issue);
                if (!r.ok)
                    avisosRelay.push(
                        `Relay não disparado para ${p.repo} #${p.issue}: ${r.detalhe}`,
                    );
            } catch (e: unknown) {
                const detalhe = e instanceof Error ? e.message : String(e);
                console.error('[relay] disparo pedido pelo agente falhou:', e);
                avisosRelay.push(`Relay não disparado para ${p.repo} #${p.issue}: ${detalhe}`);
            }
        }
        const avisoRelay = avisosRelay.length ? `\n\n${avisosRelay.join('\n')}` : '';
        if (avisoRelay) onTextDelta?.(avisoRelay);
        return {
            text: `${g.text}${avisoRelay}`,
            costUsd: g.costUsd,
            model: g.model,
            tokensIn: g.tokensIn,
            tokensCache: g.tokensCache,
            tokensOut: g.tokensOut,
            webSources,
        };
    } finally {
        await unlink(resultFile).catch(() => {
            // sem escrita de resultado (ex.: erro cedo) — ficheiro pode não existir
        });
    }
}
