import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';

const SYSTEM_PROMPT =
    'És o assistente do MythosEngine. Respondes em português de Portugal, conciso e direto. ' +
    'Usas só o contexto fornecido; se não chegar, dizes isso claramente.';

const DISALLOWED_TOOLS = [
    'Bash',
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'WebFetch',
    'WebSearch',
    'Task',
    'TodoWrite',
    'NotebookEdit',
];

export interface Generation {
    text: string;
    costUsd: number;
}

// Conduz o claude CLI (subscrição) num contexto mínimo: sem MCP, sem tools, cwd
// limpa e system prompt próprio. Ver custo medido em chat-rag-ping-pong-spec.
export function generate(prompt: string): Promise<Generation> {
    return new Promise<Generation>((resolve, reject) => {
        const child = spawn(
            CLAUDE_BIN,
            [
                '-p',
                prompt,
                '--output-format',
                'json',
                '--strict-mcp-config',
                '--system-prompt',
                SYSTEM_PROMPT,
                '--exclude-dynamic-system-prompt-sections',
                '--disallowedTools',
                ...DISALLOWED_TOOLS,
            ],
            { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] },
        );

        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`claude saiu com código ${code}: ${stderr.slice(0, 300)}`));
                return;
            }
            try {
                const envelope = JSON.parse(stdout) as { result?: string; total_cost_usd?: number };
                resolve({
                    text: envelope.result ?? '',
                    costUsd: Number(envelope.total_cost_usd ?? 0),
                });
            } catch {
                reject(new Error(`resposta do claude não é JSON: ${stdout.slice(0, 200)}`));
            }
        });
    });
}
