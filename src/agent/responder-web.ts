import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import { generateAgentic } from '@/lib/claude';
import { lerWebConsultado } from './resultado';

// #45: resposta do chat com acesso à internet. Quando o utilizador liga "web",
// a resposta corre uma sessão agentic (loop de tools) com procurar_web/ler_url —
// o CLI da subscrição NÃO faz WebSearch/WebFetch reais em -p (provado: inventa),
// por isso a web é uma tool MCP nossa (HTTP real, com proveniência).
const TOOLS_WEB = ['mcp__memvector__procurar_web', 'mcp__memvector__ler_url'];

const SYSTEM_WEB =
    'És o assistente deste workspace. Respondes em português de Portugal, conciso e direto. ' +
    'Tens acesso à INTERNET pelas tools procurar_web e ler_url: usa-as quando a pergunta precisar ' +
    'de informação ATUAL, externa, ou que não esteja no contexto do workspace dado abaixo. Cita ' +
    'SEMPRE os URLs que consultaste (como links markdown). Se uma pesquisa devolver LIMITE_WEB, ' +
    'avisa o utilizador na resposta. Não inventes — se não encontrares, di-lo claramente. O ' +
    'workspace regista sozinho os factos duráveis, por isso não peças licença para guardar.';

export interface RespostaWeb {
    text: string;
    costUsd: number;
    model?: string;
    tokensIn?: number | null;
    tokensCache?: number | null;
    tokensOut?: number | null;
    webSources: { url: string; titulo: string }[];
}

export async function responderComWebCom(
    db: SupabaseClient,
    prompt: string,
    braveKey?: string,
): Promise<RespostaWeb> {
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
        const g = await generateAgentic(prompt, {
            mcpConfig,
            allowedTools: TOOLS_WEB,
            systemPrompt: SYSTEM_WEB,
            env: {
                MEMVECTOR_AGENT_ACCESS_TOKEN: session.access_token,
                MEMVECTOR_AGENT_REFRESH_TOKEN: session.refresh_token,
                MEMVECTOR_AGENT_RESULT_FILE: resultFile,
                ...(braveKey ? { MEMVECTOR_AGENT_BRAVE_KEY: braveKey } : {}),
            },
        });
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
