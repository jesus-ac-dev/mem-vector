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
    // #117: as skills do host vivem nos plugins do ~/.claude e o
    // --setting-sources não as desliga (não são uma fonte de settings).
    // Proibir a tool Skill deixa-as inertes — o produto não herda o andaime.
    'Skill',
];

// #117 (o teste do PC novo): o runner corre na subscrição do host, mas NÃO pode
// herdar o comportamento do andaime. `--setting-sources ''` não carrega nenhuma
// fonte de settings (user/project/local) → sem CLAUDE.md, hooks nem settings do
// ~/.claude. O login não é uma fonte, por isso mantém-se. (CLAUDE_CONFIG_DIR
// próprio isolaria tudo mas perde a auth da subscrição — daí esta via.)
const HOST_ISOLATION = ['--setting-sources', ''];

export interface Generation {
    text: string;
    costUsd: number;
    model?: string; // o modelo REAL do envelope (modelUsage) — prova, não auto-relato
    tokensIn?: number | null; // input total do turno (fresco + cache)
    tokensCache?: number | null; // porção lida/criada em cache (subconjunto de tokensIn)
    tokensOut?: number | null; // tokens de output do turno
}

export interface TokenUsage {
    tokensIn: number | null; // total: fresco + cache lido + cache criado
    tokensCache: number | null; // só a porção de cache (lido + criado)
    tokensOut: number | null;
}

function numeroOuNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function somaOuNull(...partes: (number | null)[]): number | null {
    const numeros = partes.filter((n): n is number => n !== null);
    return numeros.length ? numeros.reduce((a, b) => a + b, 0) : null;
}

// Tokens do envelope do claude (#65). O CLI (--output-format json) e a Messages
// API partilham os MESMOS campos em `usage`. O `input_tokens` é só o input
// FRESCO; o cache lido/criado foi processado na mesma, por isso o tokens_in
// honesto = a soma dos três (o contexto real que o modelo viu). Devolve também
// a porção de cache à parte para o trace mostrar fresco/cache/out — um total só
// engana (parece enorme, mas o grosso é cache barato). Ausente → null.
export function tokensDoEnvelopeClaude(usage: unknown): TokenUsage {
    if (!usage || typeof usage !== 'object') {
        return { tokensIn: null, tokensCache: null, tokensOut: null };
    }
    const u = usage as Record<string, unknown>;
    const fresco = numeroOuNull(u.input_tokens);
    const cacheRead = numeroOuNull(u.cache_read_input_tokens);
    const cacheCreate = numeroOuNull(u.cache_creation_input_tokens);
    return {
        tokensIn: somaOuNull(fresco, cacheRead, cacheCreate),
        tokensCache: somaOuNull(cacheRead, cacheCreate),
        tokensOut: numeroOuNull(u.output_tokens),
    };
}

// Streaming (#66): uma linha do `--output-format stream-json --include-partial-
// messages` (JSONL). Só interessa o texto da resposta (text_delta) e o envelope
// final (result). Thinking, system, assistant-completo e ruído → ignorar.
export type EventoStream =
    | { tipo: 'texto'; texto: string }
    | { tipo: 'ferramenta'; nome: string }
    | {
          tipo: 'final';
          costUsd: number;
          model?: string;
          tokensIn: number | null;
          tokensCache: number | null;
          tokensOut: number | null;
      }
    | { tipo: 'ignorar' };

export function interpretarLinhaStream(linha: string): EventoStream {
    const t = linha.trim();
    if (!t) return { tipo: 'ignorar' };
    let d: {
        type?: string;
        event?: {
            type?: string;
            delta?: { type?: string; text?: string };
            content_block?: { type?: string; name?: string };
        };
        total_cost_usd?: number;
        modelUsage?: Record<string, unknown>;
        usage?: unknown;
    };
    try {
        d = JSON.parse(t);
    } catch {
        return { tipo: 'ignorar' };
    }
    if (d.type === 'stream_event' && d.event?.type === 'content_block_delta') {
        const delta = d.event.delta;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
            return { tipo: 'texto', texto: delta.text };
        }
        return { tipo: 'ignorar' };
    }
    // #100 fatia 2: o início de um bloco tool_use narra o passo do agente
    // ("a consultar a web", "a ler nota...") durante a geração escalada.
    if (d.type === 'stream_event' && d.event?.type === 'content_block_start') {
        const cb = d.event.content_block;
        if (cb?.type === 'tool_use' && typeof cb.name === 'string') {
            return { tipo: 'ferramenta', nome: cb.name };
        }
        return { tipo: 'ignorar' };
    }
    if (d.type === 'result') {
        const tokens = tokensDoEnvelopeClaude(d.usage);
        return {
            tipo: 'final',
            costUsd: Number(d.total_cost_usd ?? 0),
            model: Object.keys(d.modelUsage ?? {})[0],
            tokensIn: tokens.tokensIn,
            tokensCache: tokens.tokensCache,
            tokensOut: tokens.tokensOut,
        };
    }
    return { tipo: 'ignorar' };
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
        ...HOST_ISOLATION,
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

// Variante streaming (#66): a resposta vem token-a-token (text_delta). Exige
// `--verbose` (stream-json em -p) e `--include-partial-messages` (sem ela o
// texto chega num bloco só). O resto é igual ao generate normal.
export function buildClaudeStreamArgs(model?: string): string[] {
    return [
        '-p',
        '--input-format',
        'text',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        ...HOST_ISOLATION,
        '--strict-mcp-config',
        '--system-prompt',
        SYSTEM_PROMPT,
        '--exclude-dynamic-system-prompt-sections',
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
    model?: string; // modelo escolhido nas definições (#89); sem ele, o default da conta
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
        ...HOST_ISOLATION,
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
        // Modelo escolhido nas definições (#89); sem ele, o default da conta.
        ...(cfg.model ? ['--model', cfg.model] : []),
        '--disallowedTools',
        ...DISALLOWED_TOOLS,
    ];
}

// Variante streaming do agentic (#100): os MESMOS args agentic, mas em
// `stream-json` (+ `--verbose` e `--include-partial-messages`) para a resposta
// escalada sair token-a-token em vez de num bloco no fim — o indicador de fase
// deixa de ficar preso. Os eventos de tool_use/result do loop são ignorados
// pelo parser (interpretarLinhaStream); só o text_delta e o result interessam.
export function buildClaudeAgenticStreamArgs(cfg: AgenticConfig): string[] {
    return [
        '-p',
        '--input-format',
        'text',
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        ...HOST_ISOLATION,
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
        ...(cfg.model ? ['--model', cfg.model] : []),
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

// Geração em streaming (#66): chama `onTextDelta` para cada pedaço de texto à
// medida que sai, e resolve com a Generation completa (custo/modelo/tokens do
// evento final). Mesma fila/contexto-mínimo do generate normal.
export function generateStream(
    prompt: string,
    opts: { model?: string } | undefined,
    onTextDelta: (texto: string) => void,
): Promise<Generation> {
    return claudeQueue.run(() => runClaudeStream(prompt, opts?.model, onTextDelta));
}

// Streaming do agentic (#100): mesma fila/contexto, mas com as tools MCP + o env
// da sessão (herdado pelo MCP server). A resposta escalada passa a sair por
// `onTextDelta` à medida que o agente escreve, em vez de num bloco no fim.
export function generateAgenticStream(
    prompt: string,
    cfg: AgenticConfig,
    onTextDelta: (texto: string) => void,
    onFerramenta?: (nome: string) => void,
): Promise<Generation> {
    return claudeQueue.run(() =>
        runClaudeStreamCom(prompt, onTextDelta, {
            args: buildClaudeAgenticStreamArgs(cfg),
            env: cfg.env,
            timeoutMs: cfg.timeoutMs ?? claudeAgenticTimeoutMs(),
            onFerramenta,
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
                        tokensCache: tokens.tokensCache,
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

// Como runClaudeCli, mas lê o stream-json linha a linha: cada text_delta sai por
// `onTextDelta` na hora; o evento final (result) traz custo/modelo/tokens.
function runClaudeStream(
    prompt: string,
    model: string | undefined,
    onTextDelta: (texto: string) => void,
): Promise<Generation> {
    return runClaudeStreamCom(prompt, onTextDelta, { args: buildClaudeStreamArgs(model) });
}

// Miolo do streaming generalizado (#100): aceita args/env/timeout para servir
// tanto o fast path (#66, sem env) como o agentic (com tools MCP + env da sessão).
function runClaudeStreamCom(
    prompt: string,
    onTextDelta: (texto: string) => void,
    opts: {
        args: string[];
        env?: Record<string, string>;
        timeoutMs?: number;
        onFerramenta?: (nome: string) => void;
    },
): Promise<Generation> {
    return new Promise<Generation>((resolve, reject) => {
        let settled = false;
        const timeoutMs = opts.timeoutMs ?? claudeTimeoutMs();
        const child = spawn(CLAUDE_BIN, opts.args, {
            cwd: tmpdir(),
            env: opts.env ? { ...process.env, ...opts.env } : undefined,
            stdio: ['pipe', 'pipe', 'pipe'],
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

        let buffer = '';
        let stderr = '';
        let texto = '';
        let final: Extract<EventoStream, { tipo: 'final' }> | null = null;

        function processarLinha(linha: string) {
            const ev = interpretarLinhaStream(linha);
            if (ev.tipo === 'texto') {
                texto += ev.texto;
                onTextDelta(ev.texto);
            } else if (ev.tipo === 'ferramenta') {
                opts.onFerramenta?.(ev.nome);
            } else if (ev.tipo === 'final') {
                final = ev;
            }
        }

        child.stdin?.on('error', (error) => finish(() => reject(error)));
        child.stdout?.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            let nl: number;
            while ((nl = buffer.indexOf('\n')) >= 0) {
                processarLinha(buffer.slice(0, nl));
                buffer = buffer.slice(nl + 1);
            }
        });
        child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
        child.on('error', (error) => finish(() => reject(error)));
        child.on('close', (code) => {
            if (buffer.trim()) processarLinha(buffer); // última linha sem \n
            const fin = final;
            if (code !== 0) {
                finish(() =>
                    reject(new Error(`claude saiu com código ${code}: ${stderr.slice(0, 300)}`)),
                );
                return;
            }
            if (!fin) {
                finish(() => reject(new Error('stream do claude sem evento final (result)')));
                return;
            }
            finish(() =>
                resolve({
                    text: texto,
                    costUsd: fin.costUsd,
                    model: fin.model,
                    tokensIn: fin.tokensIn,
                    tokensCache: fin.tokensCache,
                    tokensOut: fin.tokensOut,
                }),
            );
        });
        child.stdin?.end(prompt);
    });
}
