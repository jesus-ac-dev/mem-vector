import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';
const DEFAULT_CLAUDE_TIMEOUT_MS = 120_000;
const DEFAULT_CLAUDE_CONCURRENCY = 1;

// Persona apenas. A regra RAG-preferred + fallback vive no prompt (ver
// chat.prompt.ts), para a primitiva do CLI ficar reutilizável.
const SYSTEM_PROMPT =
    'És o assistente deste workspace. Respondes em português de Portugal, conciso e direto. ' +
    'Segues as instruções de cada pedido. ' +
    'O workspace regista sozinho os factos duráveis (um autor de fundo trata disso), por isso ' +
    'NÃO perguntes se deves guardar nem peças licença para registar — responde ao conteúdo com ' +
    'naturalidade. Se o utilizador quiser corrigir o que ficou guardado, ele diz.';

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

export function claudeTimeoutMs(envValue = process.env.CLAUDE_TIMEOUT_MS): number {
    const parsed = Number(envValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CLAUDE_TIMEOUT_MS;
}

export function claudeConcurrency(envValue = process.env.CLAUDE_CONCURRENCY): number {
    const parsed = Number(envValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CLAUDE_CONCURRENCY;
}

export interface AsyncSemaphore {
    run<T>(task: () => Promise<T>): Promise<T>;
}

export function createAsyncSemaphore(concurrency: number): AsyncSemaphore {
    const limit = Math.max(1, Math.floor(concurrency));
    let active = 0;
    const queue: Array<() => void> = [];

    function release() {
        active -= 1;
        const next = queue.shift();
        if (next) next();
    }

    return {
        run<T>(task: () => Promise<T>): Promise<T> {
            return new Promise<T>((resolve, reject) => {
                const start = () => {
                    active += 1;
                    task().then(resolve, reject).finally(release);
                };

                if (active < limit) start();
                else queue.push(start);
            });
        },
    };
}

export function buildClaudeArgs(): string[] {
    return [
        '-p',
        '--input-format',
        'text',
        '--output-format',
        'json',
        '--strict-mcp-config',
        '--system-prompt',
        SYSTEM_PROMPT,
        '--exclude-dynamic-system-prompt-sections',
        '--disallowedTools',
        ...DISALLOWED_TOOLS,
    ];
}

// Sessão agentic: o MESMO CLI (mesma subscrição) mas com loop de tool-use sobre
// as tools MCP do workspace — em vez de proibir tudo, permite só as nossas. O
// contrato do agente segue como system prompt; o timeout é maior porque a
// sessão faz várias chamadas (a destilação já é job assíncrono).
export interface AgenticConfig {
    mcpConfig: string; // JSON inline para --mcp-config
    allowedTools: string[]; // ex.: mcp__memvector__criar_nota
    systemPrompt: string;
    env?: Record<string, string>; // extras herdados pelo MCP server
    timeoutMs?: number;
    maxTurns?: number;
}

const DEFAULT_AGENTIC_TIMEOUT_MS = 300_000;

export function claudeAgenticTimeoutMs(envValue = process.env.CLAUDE_AGENTIC_TIMEOUT_MS): number {
    const parsed = Number(envValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_AGENTIC_TIMEOUT_MS;
}

export function buildClaudeAgenticArgs(cfg: AgenticConfig): string[] {
    return [
        '-p',
        '--input-format',
        'text',
        '--output-format',
        'json',
        '--strict-mcp-config',
        '--mcp-config',
        cfg.mcpConfig,
        '--allowedTools',
        ...cfg.allowedTools,
        '--max-turns',
        String(cfg.maxTurns ?? 15),
        '--system-prompt',
        cfg.systemPrompt,
        '--exclude-dynamic-system-prompt-sections',
        '--disallowedTools',
        ...DISALLOWED_TOOLS,
    ];
}

interface RunOptions {
    args: string[];
    env?: Record<string, string>;
    timeoutMs?: number;
}

const claudeQueue = createAsyncSemaphore(claudeConcurrency());

// Conduz o claude CLI (subscrição) num contexto mínimo: sem MCP, sem tools, cwd
// limpa e system prompt próprio. O prompt segue por stdin para evitar limites de
// argv; a fila impede processos Claude concorrentes por defeito.
export function generate(prompt: string): Promise<Generation> {
    return claudeQueue.run(() => runClaudeCli(prompt));
}

export function generateAgentic(prompt: string, cfg: AgenticConfig): Promise<Generation> {
    return claudeQueue.run(() =>
        runClaudeCli(prompt, {
            args: buildClaudeAgenticArgs(cfg),
            env: cfg.env,
            timeoutMs: cfg.timeoutMs ?? claudeAgenticTimeoutMs(),
        }),
    );
}

function runClaudeCli(prompt: string, opts?: RunOptions): Promise<Generation> {
    return new Promise<Generation>((resolve, reject) => {
        let settled = false;
        const timeoutMs = opts?.timeoutMs ?? claudeTimeoutMs();
        const child = spawn(CLAUDE_BIN, opts?.args ?? buildClaudeArgs(), {
            cwd: tmpdir(),
            // O env extra (tokens da sessão, ficheiro de resultado) é herdado
            // pelo MCP server que o CLI lança como subprocesso.
            env: opts?.env ? { ...process.env, ...opts.env } : undefined,
            stdio: ['pipe', 'pipe', 'pipe'],
            // Líder de grupo de processos: o timeout mata o grupo inteiro,
            // senão o MCP server lançado pelo CLI fica órfão a escrever com a
            // sessão do utilizador depois do job já ter falhado (audit #27).
            detached: true,
        });

        const timeout = setTimeout(() => {
            if (child.pid) {
                try {
                    process.kill(-child.pid, 'SIGTERM');
                } catch {
                    child.kill('SIGTERM');
                }
            } else {
                child.kill('SIGTERM');
            }
            finish(() => reject(new Error(`claude excedeu timeout (${timeoutMs}ms)`)));
        }, timeoutMs);

        function finish(fn: () => void) {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            fn();
        }

        let stdout = '';
        let stderr = '';
        child.stdin?.on('error', (error) => finish(() => reject(error)));
        child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
        child.on('error', (error) => finish(() => reject(error)));
        child.on('close', (code) => {
            if (code !== 0) {
                finish(() =>
                    reject(new Error(`claude saiu com código ${code}: ${stderr.slice(0, 300)}`)),
                );
                return;
            }
            try {
                const envelope = JSON.parse(stdout) as { result?: string; total_cost_usd?: number };
                finish(() =>
                    resolve({
                        text: envelope.result ?? '',
                        costUsd: Number(envelope.total_cost_usd ?? 0),
                    }),
                );
            } catch {
                finish(() =>
                    reject(new Error(`resposta do claude não é JSON: ${stdout.slice(0, 200)}`)),
                );
            }
        });
        child.stdin?.end(prompt);
    });
}
