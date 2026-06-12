import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import { generate, type Generation } from '@/lib/claude';
import { lerDefinicoesServidorCom } from '@/modules/definicoes/definicoes.service';
import type { AgenteServidor, Provider } from '@/modules/definicoes/definicoes.schema';

// FactoryProvider (#60 r3, desenho do Carlos — referência viva em
// ~/src/agent-skills-compare/src/analysis/providers): um registo de
// providers/orquestradores; o chat responde com o escolhido em chatProvider.
// claude-cli é o caminho de sempre (lib/claude); codex-cli e gemini-api
// seguem os padrões provados no skills-compare (quota detectada e dita alto);
// ollama fala com o daemon local.

export interface RespostaLLM {
    text: string;
    costUsd: number | null;
}

export interface ProviderLLM {
    nome: Provider;
    gerar(prompt: string): Promise<RespostaLLM>;
    testar(): Promise<{ ok: boolean; detalhe: string }>;
    // Descoberta de modelos (#60 r5, ideia do Carlos): após o teste de ligação
    // com sucesso, a lista alimenta as dropdowns — gemini/ollama dão lista
    // VIVA via API; claude usa os aliases do CLI; codex é curado (o CLI não
    // expõe listagem).
    listarModelos(): Promise<string[]>;
}

// Padrão do skills-compare: quota/limite tem de dizer alto, não mascarar.
const QUOTA_REGEX =
    /429|rate.?limit|usage.?limit|weekly.?limit|too many|hit your limit|limit reached|quota|insufficient.?quota|out of credits|billing/i;

function execComando(
    bin: string,
    args: string[],
    stdin?: string,
    timeoutMs = 120_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, args, { env: { ...process.env } });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`${bin} excedeu ${timeoutMs / 1000}s`));
        }, timeoutMs);
        child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
        child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
        child.on('error', (err: NodeJS.ErrnoException) => {
            clearTimeout(timer);
            reject(new Error(err.code === 'ENOENT' ? `\`${bin}\` não está no PATH` : err.message));
        });
        child.on('exit', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
        if (stdin !== undefined) {
            child.stdin.write(stdin);
        }
        child.stdin.end();
    });
}

async function testarVersao(bin: string): Promise<{ ok: boolean; detalhe: string }> {
    try {
        const { code, stdout, stderr } = await execComando(bin, ['--version'], undefined, 15_000);
        if (code === 0) return { ok: true, detalhe: stdout.trim().split('\n')[0] || 'ok' };
        return { ok: false, detalhe: (stderr || stdout).trim().slice(0, 200) || `exit ${code}` };
    } catch (e) {
        return { ok: false, detalhe: e instanceof Error ? e.message : String(e) };
    }
}

// ── claude (cli) — o orquestrador vivo, via lib/claude ──
function providerClaude(cfg: AgenteServidor): ProviderLLM {
    return {
        nome: 'claude',
        async gerar(prompt) {
            const g: Generation = await generate(prompt, { model: cfg.modelo });
            return { text: g.text, costUsd: g.costUsd };
        },
        testar: () => testarVersao('claude'),
        listarModelos: async () => ['opus', 'sonnet', 'haiku'],
    };
}

// ── codex (cli) — padrão do skills-compare: exec efémero, quota dita alto ──
function providerCodex(cfg: AgenteServidor): ProviderLLM {
    return {
        nome: 'codex',
        async gerar(prompt) {
            const tempDir = await mkdtemp(join(tmpdir(), 'memvector-codex-'));
            const outputPath = join(tempDir, 'last-message.txt');
            try {
                const args = ['--ask-for-approval', 'never'];
                if (cfg.esforco) {
                    args.push('--config', `model_reasoning_effort="${cfg.esforco}"`);
                }
                args.push(
                    'exec',
                    '--ignore-user-config',
                    '--sandbox',
                    'read-only',
                    '--ephemeral',
                    '--color',
                    'never',
                    '-C',
                    tempDir,
                );
                if (cfg.modelo) args.push('--model', cfg.modelo);
                args.push('--output-last-message', outputPath, '-');

                const { code, stdout, stderr } = await execComando('codex', args, prompt);
                if (code !== 0) {
                    const erro = `${stdout}\n${stderr}`.trim().slice(-500);
                    if (QUOTA_REGEX.test(erro)) {
                        throw new Error(`codex: quota/limite excedido — ${erro.slice(0, 200)}`);
                    }
                    throw new Error(`codex falhou (exit ${code}): ${erro.slice(0, 300)}`);
                }
                const text = (await readFile(outputPath, 'utf8')).trim();
                return { text, costUsd: null };
            } finally {
                await rm(tempDir, { recursive: true, force: true });
            }
        },
        testar: () => testarVersao('codex'),
        listarModelos: async () => ['gpt-5.1-codex', 'gpt-5.1-codex-mini'],
    };
}

// ── gemini (api) — REST generateContent; 429/quota dita alto ──
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function providerGemini(cfg: AgenteServidor): ProviderLLM {
    const modelo = cfg.modelo || 'gemini-2.5-flash';
    return {
        nome: 'gemini',
        async gerar(prompt) {
            if (!cfg.apiKey) throw new Error('gemini: API key em falta nas definições');
            const res = await fetch(`${GEMINI_BASE}/models/${modelo}:generateContent`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            });
            const corpo = await res.text();
            if (!res.ok) {
                if (res.status === 429 || QUOTA_REGEX.test(corpo)) {
                    throw new Error(`gemini: quota/limite excedido (HTTP ${res.status})`);
                }
                throw new Error(`gemini HTTP ${res.status}: ${corpo.slice(0, 300)}`);
            }
            const json = JSON.parse(corpo) as {
                candidates?: { content?: { parts?: { text?: string }[] } }[];
            };
            const text = (json.candidates?.[0]?.content?.parts ?? [])
                .map((p) => p.text ?? '')
                .join('')
                .trim();
            if (!text) throw new Error('gemini: resposta vazia');
            return { text, costUsd: null };
        },
        async testar() {
            if (!cfg.apiKey) return { ok: false, detalhe: 'API key em falta' };
            try {
                const res = await fetch(`${GEMINI_BASE}/models?pageSize=1`, {
                    headers: { 'x-goog-api-key': cfg.apiKey },
                });
                if (res.ok) return { ok: true, detalhe: `ligado (${modelo})` };
                return { ok: false, detalhe: `HTTP ${res.status} — key inválida?` };
            } catch (e) {
                return { ok: false, detalhe: e instanceof Error ? e.message : String(e) };
            }
        },
        async listarModelos() {
            if (!cfg.apiKey) return [];
            const res = await fetch(`${GEMINI_BASE}/models?pageSize=100`, {
                headers: { 'x-goog-api-key': cfg.apiKey },
            });
            if (!res.ok) return [];
            const json = (await res.json()) as {
                models?: { name?: string; supportedGenerationMethods?: string[] }[];
            };
            return (json.models ?? [])
                .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
                .map((m) => (m.name ?? '').replace(/^models\//, ''))
                .filter((n) => n.startsWith('gemini'))
                .sort();
        },
    };
}

// ── ollama (local) — daemon em localhost ──
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

function providerOllama(cfg: AgenteServidor): ProviderLLM {
    const modelo = cfg.modelo || 'llama3.2';
    return {
        nome: 'ollama',
        async gerar(prompt) {
            const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ model: modelo, prompt, stream: false }),
            });
            if (!res.ok) {
                throw new Error(`ollama HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
            }
            const json = (await res.json()) as { response?: string };
            const text = (json.response ?? '').trim();
            if (!text) throw new Error('ollama: resposta vazia');
            return { text, costUsd: null };
        },
        async testar() {
            try {
                const res = await fetch(`${OLLAMA_BASE}/api/tags`);
                if (!res.ok) return { ok: false, detalhe: `HTTP ${res.status}` };
                const json = (await res.json()) as { models?: { name: string }[] };
                const tem = (json.models ?? []).some((m) => m.name.startsWith(modelo));
                return {
                    ok: true,
                    detalhe: tem
                        ? `ligado (${modelo} disponível)`
                        : `ligado, mas o modelo "${modelo}" não está puxado`,
                };
            } catch {
                return { ok: false, detalhe: `daemon não responde em ${OLLAMA_BASE}` };
            }
        },
        async listarModelos() {
            try {
                const res = await fetch(`${OLLAMA_BASE}/api/tags`);
                if (!res.ok) return [];
                const json = (await res.json()) as { models?: { name: string }[] };
                return (json.models ?? []).map((m) => m.name).sort();
            } catch {
                return [];
            }
        },
    };
}

const REGISTO: Record<Provider, (cfg: AgenteServidor) => ProviderLLM> = {
    claude: providerClaude,
    codex: providerCodex,
    gemini: providerGemini,
    ollama: providerOllama,
};

export function criarProvider(nome: Provider, cfg: AgenteServidor): ProviderLLM {
    return REGISTO[nome](cfg);
}

/** O provider do chat segundo as definições; claude/cli como rede de segurança. */
export async function providerDoChatCom(db: SupabaseClient): Promise<ProviderLLM> {
    const defs = await lerDefinicoesServidorCom(db);
    const escolhido = defs.chatProvider;
    const cfg = defs.agentes[escolhido];
    if (cfg?.ativo) return criarProvider(escolhido, cfg);
    return criarProvider('claude', defs.agentes.claude ?? { ativo: true, modo: 'cli' });
}
