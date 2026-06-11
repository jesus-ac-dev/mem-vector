import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import { generateAgentic } from '@/lib/claude';
import type { NotaCandidata } from '@/modules/knowledge/knowledge.schema';
import type { Intencao } from '@/modules/chat/chat.intencao';
import type { MensagemConversa } from '@/modules/chat/chat.prompt';
import type { TurnoDestilado } from '@/modules/chat/chat.service';
import { AGENT_CONTRACT, buildPromptAgentic } from './contract';
import { lerEscritas, reduzirEscritas } from './resultado';

const TOOLS_PERMITIDAS = [
    'mcp__memvector__procurar_notas',
    'mcp__memvector__ler_nota',
    'mcp__memvector__criar_nota',
    'mcp__memvector__continuar_nota',
    'mcp__memvector__acrescentar_daily',
    'mcp__memvector__ler_daily_hoje',
];

export interface TurnoAgenticInput {
    question: string;
    answer: string;
    candidatos?: NotaCandidata[];
    intencao?: Intencao;
    historico?: MensagemConversa[];
    // Kernel do workspace (#34): junta-se ao contrato como system prompt —
    // contrato base (a casa) + personalidade do utilizador.
    kernel?: string;
}

// Caminho agentic da destilação (issue #27): em vez de pedir um JSON one-shot,
// a sessão CLI orienta-se (lê as candidatas), decide e escreve via tools MCP —
// o mesmo loop ler-antes-de-escrever do Claude Code, com a mesma subscrição.
// O resultado vem do ficheiro de registo das tools, não do texto do modelo.
export async function destilarTurnoAgenticCom(
    db: SupabaseClient,
    input: TurnoAgenticInput,
): Promise<TurnoDestilado> {
    const {
        data: { session },
    } = await db.auth.getSession();
    if (!session) throw new Error('sem sessão para a destilação agentic');

    const resultFile = join(tmpdir(), `memvector-agentic-${randomUUID()}.jsonl`);
    // O pai cria o ficheiro (wx falha se já existir, 0600): ninguém no tmpdir
    // partilhado consegue plantá-lo primeiro com registos falsos (audit #27).
    writeFileSync(resultFile, '', { flag: 'wx', mode: 0o600 });
    const raiz = process.cwd();
    const mcpConfig = JSON.stringify({
        mcpServers: {
            memvector: {
                command: join(raiz, 'node_modules', '.bin', 'tsx'),
                // O CLI lança o server com cwd fora do repo; o tsx resolve o
                // tsconfig (e os aliases @/) a partir do cwd — daí o caminho
                // explícito, senão o server morre no import e a sessão fica
                // sem tools em silêncio.
                args: [
                    '--tsconfig',
                    join(raiz, 'tsconfig.json'),
                    join(raiz, 'src', 'agent', 'mcp-tools.ts'),
                ],
            },
        },
    });

    try {
        await generateAgentic(
            buildPromptAgentic(
                input.question,
                input.answer,
                input.candidatos ?? [],
                input.intencao,
                input.historico ?? [],
            ),
            {
                mcpConfig,
                allowedTools: TOOLS_PERMITIDAS,
                systemPrompt: input.kernel
                    ? `${AGENT_CONTRACT}\n\n${input.kernel}`
                    : AGENT_CONTRACT,
                env: {
                    MEMVECTOR_AGENT_ACCESS_TOKEN: session.access_token,
                    MEMVECTOR_AGENT_REFRESH_TOKEN: session.refresh_token,
                    MEMVECTOR_AGENT_RESULT_FILE: resultFile,
                },
            },
        );

        return reduzirEscritas(lerEscritas(resultFile));
    } finally {
        await unlink(resultFile).catch(() => {
            // turno trivial: ficheiro nunca chegou a existir
        });
    }
}
