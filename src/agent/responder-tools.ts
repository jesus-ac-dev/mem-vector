import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import { generateAgentic, generateAgenticStream } from '@/lib/claude';
import { lerWebConsultado } from './resultado';

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
            systemPrompt: SYSTEM_RESPOSTA,
            model,
            env: {
                MEMVECTOR_AGENT_ACCESS_TOKEN: session.access_token,
                MEMVECTOR_AGENT_REFRESH_TOKEN: session.refresh_token,
                MEMVECTOR_AGENT_RESULT_FILE: resultFile,
                ...(webKey ? { MEMVECTOR_AGENT_WEB_KEY: webKey } : {}),
            },
        };
        // #100: com callback, a resposta escalada streama token-a-token (o
        // indicador deixa de ficar preso); sem ele, mantém o bloco único.
        const g = onTextDelta
            ? await generateAgenticStream(prompt, cfg, onTextDelta)
            : await generateAgentic(prompt, cfg);
        const webSources = lerWebConsultado(resultFile).map((r) => ({
            url: r.url,
            titulo: r.titulo,
        }));
        return {
            text: g.text,
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
