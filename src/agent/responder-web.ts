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

// Discrição de tools (#45 r3, feedback do Carlos: "não deveria estar sempre a ir
// à web"): o workspace é a fonte primária; a web é o ÚLTIMO recurso, só para
// factos do mundo que o workspace não pode conter. Sem isto, o agente ia à net
// até para "como correm os devs" (pergunta do próprio workspace).
const SYSTEM_WEB =
    'És o assistente deste workspace. Respondes em português de Portugal, conciso e direto. ' +
    'REGRA DE TOOLS — primeiro o workspace, a web só em último recurso:\n' +
    '1. Responde SEMPRE primeiro com o contexto do workspace dado abaixo. Para perguntas sobre ' +
    'o trabalho do utilizador (notas, projetos, dailies, tarefas, decisões, "como vão os devs", ' +
    '"o que ficou decidido") NUNCA vás à internet — a resposta está no workspace.\n' +
    '2. Usa procurar_web/ler_url SÓ quando a pergunta precisa de um facto do MUNDO, atual ou ' +
    'externo, que o workspace não pode ter: notícias, resultados/horários de desporto, preços, ' +
    'cotações, versões de software, meteorologia, factos públicos. Na dúvida, se o contexto ' +
    'responde, não pesquises.\n' +
    'Quando usares a web, cita SEMPRE os URLs (links markdown). Se uma pesquisa devolver ' +
    'LIMITE_WEB, avisa o utilizador na resposta. Não inventes — se não encontrares, di-lo. O ' +
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
    webKey?: string,
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
                ...(webKey ? { MEMVECTOR_AGENT_WEB_KEY: webKey } : {}),
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
