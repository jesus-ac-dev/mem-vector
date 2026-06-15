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
    model?: string; // o modelo REAL do envelope (modelUsage) — prova, não auto-relato
    tokensIn?: number | null; // tokens de input do turno (contexto que o modelo viu)
    tokensOut?: number | null; // tokens de output do turno
}

export interface TokenUsage {
    tokensIn: number | null;
    tokensOut: number | null;
}

function numeroOuNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Tokens do envelope do claude (#65). O CLI (--output-format json) e a Messages
// API partilham os MESMOS campos em `usage`. O `input_tokens` é só o input
// FRESCO; o cache lido/criado foi processado na mesma, por isso o tokens_in
// honesto = a soma dos três (o contexto real que o modelo viu). `output_tokens`
// é direto. Campos ausentes → null (não inventa).
export function tokensDoEnvelopeClaude(usage: unknown): TokenUsage {
    if (!usage || typeof usage !== 'object') return { tokensIn: null, tokensOut: null };
    const u = usage as Record<string, unknown>;
    const partes = [
        numeroOuNull(u.input_tokens),
        numeroOuNull(u.cache_read_input_tokens),
        numeroOuNull(u.cache_creation_input_tokens),
    ].filter((n): n is number => n !== null);
    return {
        tokensIn: partes.length ? partes.reduce((a, b) => a + b, 0) : null,
        tokensOut: numeroOuNull(u.output_tokens),
    };
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

export function buildClaudeArgs(model?: string): string[] {
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
        // Modelo escolhido nas definições (#60); sem ele, o default da conta.
        ...(model ? ['--model', model] : []),
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
export function generate(prompt: string, opts?: { model?: string }): Promise<Generation> {
    return claudeQueue.run(() => runClaudeCli(prompt, { args: buildClaudeArgs(opts?.model) }));
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
                const envelope = JSON.parse(stdout) as {
                    result?: string;
                    total_cost_usd?: number;
                    modelUsage?: Record<string, unknown>;
                    usage?: unknown;
                };
                // O modelo REAL vem do envelope (#60 r8): o auto-relato dos
                // modelos é mentiroso — isto é a prova de qual respondeu.
                const modelo = Object.keys(envelope.modelUsage ?? {})[0];
                const tokens = tokensDoEnvelopeClaude(envelope.usage);
                finish(() =>
                    resolve({
                        text: envelope.result ?? '',
                        costUsd: Number(envelope.total_cost_usd ?? 0),
                        model: modelo,
                        tokensIn: tokens.tokensIn,
                        tokensOut: tokens.tokensOut,
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
