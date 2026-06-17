import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import { generate, generateStream, tokensDoEnvelopeClaude, type Generation } from '@/lib/claude';
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
    model?: string; // o modelo REAL que respondeu (quando o provider o reporta)
    // Tokens do turno (#65); null onde o provider não os reporta (não inventa).
    tokensIn?: number | null; // total (fresco + cache no claude)
    tokensCache?: number | null; // porção de cache; só o claude tem cache de prompt
    tokensOut?: number | null;
}

// Lê um inteiro de tokens de um campo do envelope; ausente/não-número → null.
function tokensOuNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface ProviderLLM {
    nome: Provider;
    gerar(prompt: string): Promise<RespostaLLM>;
    // Geração em streaming (#66): só o claude/cli a implementa por agora —
    // quem não a tiver, o servidor cai no `gerar` (texto num bloco só).
    gerarStream?(prompt: string, onTextDelta: (texto: string) => void): Promise<RespostaLLM>;
    testar(): Promise<{ ok: boolean; detalhe: string }>;
    // Descoberta de modelos (#60 r5, ideia do Carlos): após o teste de ligação
    // com sucesso, a lista alimenta as dropdowns — gemini/ollama dão lista
    // VIVA via API; codex/cli via `codex debug models`; claude/cli usa os
    // aliases do binário; em modo api, claude/codex listam via /v1/models.
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

// ── claude (api) — Messages API; a key prova-se AQUI, não na 1ª mensagem ──
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
// Alias oficial da API (não confundir com os aliases curtos do CLI).
const CLAUDE_API_MODELO_DEFAULT = 'claude-opus-4-8';

async function gerarClaudeApi(cfg: AgenteServidor, prompt: string): Promise<RespostaLLM> {
    if (!cfg.apiKey) throw new Error('claude api: API key em falta nas definições');
    const res = await fetch(`${ANTHROPIC_BASE}/messages`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': cfg.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
            model: cfg.modelo || CLAUDE_API_MODELO_DEFAULT,
            max_tokens: 16000,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    const corpo = await res.text();
    if (!res.ok) {
        if (res.status === 401) throw new Error('claude api: key inválida (401)');
        if (res.status === 429 || QUOTA_REGEX.test(corpo)) {
            throw new Error(`claude api: quota/limite excedido (HTTP ${res.status})`);
        }
        throw new Error(`claude api HTTP ${res.status}: ${corpo.slice(0, 300)}`);
    }
    const json = JSON.parse(corpo) as {
        content?: { type: string; text?: string }[];
        model?: string;
        usage?: unknown;
    };
    const text = (json.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim();
    if (!text) throw new Error('claude api: resposta vazia');
    // Mesmo `usage` do envelope do CLI (input_tokens + cache + output_tokens).
    const tokens = tokensDoEnvelopeClaude(json.usage);
    return {
        text,
        costUsd: null,
        model: json.model,
        tokensIn: tokens.tokensIn,
        tokensCache: tokens.tokensCache,
        tokensOut: tokens.tokensOut,
    };
}

async function listarModelosAnthropic(apiKey: string): Promise<string[]> {
    const res = await fetch(`${ANTHROPIC_BASE}/models?limit=100`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    });
    if (!res.ok) throw new Error(`claude api HTTP ${res.status} — key inválida?`);
    const json = (await res.json()) as { data?: { id?: string }[] };
    return (json.data ?? [])
        .map((m) => m.id ?? '')
        .filter(Boolean)
        .sort();
}

function providerClaudeApi(cfg: AgenteServidor): ProviderLLM {
    return {
        nome: 'claude',
        gerar: (prompt) => gerarClaudeApi(cfg, prompt),
        // Teste a sério em modo api: a listagem valida a key (401 rebenta já)
        // e a mini-geração prova o MESMO caminho do chat. Se o modelo guardado
        // não existe na API (ex.: alias do CLI), o teste cai para um opus da
        // lista REAL acabada de descobrir (a constante é só último recurso —
        // não apodrece); a escolha re-faz-se na mini-modal com a lista.
        async testar() {
            if (!cfg.apiKey) return { ok: false, detalhe: 'API key em falta' };
            let nModelos: number | null = null;
            try {
                const modelos = await listarModelosAnthropic(cfg.apiKey);
                nModelos = modelos.length;
                const modelo =
                    cfg.modelo && modelos.includes(cfg.modelo)
                        ? cfg.modelo
                        : (modelos.find((m) => m.startsWith('claude-opus')) ??
                          modelos[0] ??
                          CLAUDE_API_MODELO_DEFAULT);
                const r = await gerarClaudeApi(
                    { ...cfg, modelo },
                    'Responde apenas com a palavra: ok',
                );
                return {
                    ok: true,
                    detalhe: `key válida (${nModelos} modelos) — gerou com ${r.model ?? modelo}`,
                };
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                // Quota DEPOIS da listagem autenticada = a key está provada;
                // falta crédito, não config — não bloqueia o Guardar (r13).
                if (nModelos !== null && QUOTA_REGEX.test(msg)) {
                    return {
                        ok: true,
                        detalhe: `key válida (${nModelos} modelos) — quota excedida de momento, a geração volta quando repor`,
                    };
                }
                return { ok: false, detalhe: msg };
            }
        },
        async listarModelos() {
            if (!cfg.apiKey) return [];
            try {
                return await listarModelosAnthropic(cfg.apiKey);
            } catch {
                return [];
            }
        },
    };
}

// ── codex (api) — API da OpenAI; mesma regra: key provada no teste ──
const OPENAI_BASE = 'https://api.openai.com/v1';

async function gerarCodexApi(cfg: AgenteServidor, prompt: string): Promise<RespostaLLM> {
    if (!cfg.apiKey) throw new Error('codex api: API key em falta nas definições');
    if (!cfg.modelo) {
        throw new Error('codex api: escolhe um modelo (o Testar ligação descobre a lista real)');
    }
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
            model: cfg.modelo,
            max_completion_tokens: 16000,
            messages: [{ role: 'user', content: prompt }],
            // reasoning_effort verificado no SDK oficial (shared.ts, r10):
            // none|minimal|low|medium|high|xhigh — passa direto, sem mapear.
            ...(cfg.esforco ? { reasoning_effort: cfg.esforco } : {}),
        }),
    });
    const corpo = await res.text();
    if (!res.ok) {
        if (res.status === 401) throw new Error('codex api: key inválida (401)');
        if (res.status === 429 || QUOTA_REGEX.test(corpo)) {
            throw new Error(`codex api: quota/limite excedido (HTTP ${res.status})`);
        }
        throw new Error(`codex api HTTP ${res.status}: ${corpo.slice(0, 300)}`);
    }
    const json = JSON.parse(corpo) as {
        choices?: { message?: { content?: string } }[];
        model?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = (json.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw new Error('codex api: resposta vazia');
    return {
        text,
        costUsd: null,
        model: json.model,
        tokensIn: tokensOuNull(json.usage?.prompt_tokens),
        tokensCache: null, // OpenAI não separa cache de prompt aqui
        tokensOut: tokensOuNull(json.usage?.completion_tokens),
    };
}

async function listarModelosOpenAI(apiKey: string): Promise<string[]> {
    const res = await fetch(`${OPENAI_BASE}/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`codex api HTTP ${res.status} — key inválida?`);
    const json = (await res.json()) as { data?: { id?: string }[] };
    return (
        (json.data ?? [])
            .map((m) => m.id ?? '')
            // A listagem traz embeddings/audio/imagem — só os geradores de texto.
            .filter((id) => /^(gpt-|o\d)/.test(id))
            .sort()
    );
}

function providerCodexApi(cfg: AgenteServidor): ProviderLLM {
    return {
        nome: 'codex',
        gerar: (prompt) => gerarCodexApi(cfg, prompt),
        async testar() {
            if (!cfg.apiKey) return { ok: false, detalhe: 'API key em falta' };
            let nModelos: number | null = null;
            try {
                const modelos = await listarModelosOpenAI(cfg.apiKey);
                nModelos = modelos.length;
                const modelo =
                    cfg.modelo && modelos.includes(cfg.modelo)
                        ? cfg.modelo
                        : (modelos.find((m) => m.startsWith('gpt-5')) ?? modelos[0]);
                if (!modelo) {
                    return { ok: false, detalhe: 'key válida mas sem modelos disponíveis' };
                }
                const r = await gerarCodexApi(
                    { ...cfg, modelo },
                    'Responde apenas com a palavra: ok',
                );
                return {
                    ok: true,
                    detalhe: `key válida (${nModelos} modelos) — gerou com ${r.model ?? modelo}`,
                };
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                // Quota com a listagem já autenticada = key provada (r13).
                if (nModelos !== null && QUOTA_REGEX.test(msg)) {
                    return {
                        ok: true,
                        detalhe: `key válida (${nModelos} modelos) — quota excedida de momento, a geração volta quando repor`,
                    };
                }
                return { ok: false, detalhe: msg };
            }
        },
        async listarModelos() {
            if (!cfg.apiKey) return [];
            try {
                return await listarModelosOpenAI(cfg.apiKey);
            } catch {
                return [];
            }
        },
    };
}

// ── claude (cli) — o orquestrador vivo, via lib/claude ──
function providerClaude(cfg: AgenteServidor): ProviderLLM {
    if (cfg.modo === 'api') return providerClaudeApi(cfg);
    return {
        nome: 'claude',
        async gerar(prompt) {
            const g: Generation = await generate(prompt, { model: cfg.modelo });
            return {
                text: g.text,
                costUsd: g.costUsd,
                model: g.model,
                tokensIn: g.tokensIn ?? null,
                tokensCache: g.tokensCache ?? null,
                tokensOut: g.tokensOut ?? null,
            };
        },
        async gerarStream(prompt, onTextDelta) {
            const g = await generateStream(prompt, { model: cfg.modelo }, onTextDelta);
            return {
                text: g.text,
                costUsd: g.costUsd,
                model: g.model,
                tokensIn: g.tokensIn ?? null,
                tokensCache: g.tokensCache ?? null,
                tokensOut: g.tokensOut ?? null,
            };
        },
        // Teste a sério (#60 r8, lição do Carlos: "isto vai para outros
        // computadores"): mini-geração pelo MESMO caminho do chat — auth,
        // flags e modelo rebentam AQUI, não na primeira mensagem. O detalhe
        // mostra o modelo REAL (modelUsage), porque o auto-relato mente.
        async testar() {
            const versao = await testarVersao('claude');
            if (!versao.ok) return versao;
            try {
                const g = await generate('Responde apenas com a palavra: ok', {
                    model: cfg.modelo,
                });
                return {
                    ok: true,
                    detalhe: `${versao.detalhe} — gerou com ${g.model ?? 'modelo default'}`,
                };
            } catch (e) {
                return { ok: false, detalhe: e instanceof Error ? e.message : String(e) };
            }
        },
        // Verificado (r6): o claude CLI não expõe listagem de modelos — os
        // aliases são o contrato documentado do --model; a lista real vive no
        // modo api (providerClaudeApi, /v1/models).
        listarModelos: async () => ['opus', 'sonnet', 'haiku'],
    };
}

// ── codex (cli) — padrão do skills-compare: exec efémero, quota dita alto ──
function providerCodex(cfg: AgenteServidor): ProviderLLM {
    if (cfg.modo === 'api') return providerCodexApi(cfg);
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
                    // O exec corre num tempdir (não é repo git): sem isto o
                    // codex recusa com "Not inside a trusted directory".
                    '--skip-git-repo-check',
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
                // O modelo REAL vem do cabeçalho do exec ("model: gpt-5.5"),
                // provado por execução real (r11) — não do auto-relato.
                const model = stdout.match(/^model:\s*(.+)$/m)?.[1]?.trim();
                // O exec do codex não expõe contagem de tokens fiável (#65).
                return {
                    text,
                    costUsd: null,
                    model,
                    tokensIn: null,
                    tokensCache: null,
                    tokensOut: null,
                };
            } finally {
                await rm(tempDir, { recursive: true, force: true });
            }
        },
        // Teste a sério (#60 r8): mini-exec pelo MESMO caminho do gerar —
        // trusted dir/auth/quota rebentam aqui, não na primeira mensagem.
        async testar() {
            const versao = await testarVersao('codex');
            if (!versao.ok) return versao;
            try {
                const r = await this.gerar('Responde apenas com a palavra: ok');
                return {
                    ok: true,
                    detalhe: `${versao.detalhe} — exec real respondeu${cfg.modelo ? ` (${cfg.modelo})` : ''} «${r.text.slice(0, 30)}»`,
                };
            } catch (e) {
                return { ok: false, detalhe: e instanceof Error ? e.message : String(e) };
            }
        },
        // Descoberta REAL (r6, solução do Carlos): `codex debug models` lista
        // os slugs + níveis de esforço suportados.
        async listarModelos() {
            try {
                const { code, stdout } = await execComando(
                    'codex',
                    ['debug', 'models'],
                    undefined,
                    30_000,
                );
                if (code !== 0) return [];
                const json = JSON.parse(stdout) as {
                    models?: { slug?: string; visibility?: string }[];
                };
                return (json.models ?? [])
                    .filter((m) => m.slug && m.visibility !== 'hidden')
                    .map((m) => m.slug!)
                    .sort();
            } catch {
                return [];
            }
        },
    };
}

// ── gemini (cli) — binário oficial @google/gemini-cli (r10): headless por
// `-p` + `--output-format json` ({response, stats, error?}), modelo por
// `--model`; auth é do próprio binário (login Google ou GEMINI_API_KEY do
// ambiente), fora da nossa gestão de keys — como claude/codex em cli ──
const GEMINI_CLI_MODELOS = [
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
];

function providerGeminiCli(cfg: AgenteServidor): ProviderLLM {
    return {
        nome: 'gemini',
        async gerar(prompt) {
            const args = ['-p', prompt, '--output-format', 'json'];
            if (cfg.modelo) args.push('--model', cfg.modelo);
            const { code, stdout, stderr } = await execComando('gemini', args);
            if (code !== 0) {
                const erro = `${stdout}\n${stderr}`.trim().slice(-500);
                if (QUOTA_REGEX.test(erro)) {
                    throw new Error(`gemini cli: quota/limite excedido — ${erro.slice(0, 200)}`);
                }
                throw new Error(`gemini cli falhou (exit ${code}): ${erro.slice(0, 300)}`);
            }
            // O binário pode escrever avisos antes do JSON — parse do 1.º '{'.
            const inicio = stdout.indexOf('{');
            if (inicio < 0) throw new Error('gemini cli: saída sem JSON');
            const json = JSON.parse(stdout.slice(inicio)) as {
                response?: string;
                stats?: { models?: Record<string, unknown> };
                error?: { message?: string };
            };
            if (json.error) throw new Error(`gemini cli: ${json.error.message ?? 'erro'}`);
            const text = (json.response ?? '').trim();
            if (!text) throw new Error('gemini cli: resposta vazia');
            // O modelo REAL vem das stats (mapa por modelo), como o envelope do claude.
            // Tokens: a shape das stats não está verificada (#65) — null, não inventa.
            return {
                text,
                costUsd: null,
                model: Object.keys(json.stats?.models ?? {})[0],
                tokensIn: null,
                tokensCache: null,
                tokensOut: null,
            };
        },
        // Teste a sério: versão + mini-geração pelo MESMO caminho do chat
        // (login Google/quota rebentam aqui, não na 1.ª mensagem).
        async testar() {
            const versao = await testarVersao('gemini');
            if (!versao.ok) return versao;
            try {
                const r = await this.gerar('Responde apenas com a palavra: ok');
                return {
                    ok: true,
                    detalhe: `${versao.detalhe} — gerou${r.model ? ` com ${r.model}` : ''} «${r.text.slice(0, 30)}»`,
                };
            } catch (e) {
                return { ok: false, detalhe: e instanceof Error ? e.message : String(e) };
            }
        },
        // Verificado (r10, docs/cli/cli-reference.md do gemini-cli): o binário
        // não expõe listagem — os nomes documentados do --model são o contrato,
        // como os aliases do claude CLI. A lista VIVA vem do modo api.
        listarModelos: async () => GEMINI_CLI_MODELOS,
    };
}

// ── gemini (api) — REST generateContent; 429/quota dita alto ──
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function providerGemini(cfg: AgenteServidor): ProviderLLM {
    if (cfg.modo === 'cli') return providerGeminiCli(cfg);
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
                // "Output only. The model version used" (referência REST, r11).
                modelVersion?: string;
                usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
            };
            const text = (json.candidates?.[0]?.content?.parts ?? [])
                .map((p) => p.text ?? '')
                .join('')
                .trim();
            if (!text) throw new Error('gemini: resposta vazia');
            return {
                text,
                costUsd: null,
                model: json.modelVersion,
                tokensIn: tokensOuNull(json.usageMetadata?.promptTokenCount),
                tokensCache: null,
                tokensOut: tokensOuNull(json.usageMetadata?.candidatesTokenCount),
            };
        },
        // Teste a sério (r9, regra do r8 estendida às APIs): a listagem valida
        // a key e a mini-geração prova o MESMO caminho do chat.
        async testar() {
            if (!cfg.apiKey) return { ok: false, detalhe: 'API key em falta' };
            let listagemOk = false;
            try {
                const res = await fetch(`${GEMINI_BASE}/models?pageSize=1`, {
                    headers: { 'x-goog-api-key': cfg.apiKey },
                });
                if (!res.ok) {
                    return { ok: false, detalhe: `HTTP ${res.status} — key inválida?` };
                }
                listagemOk = true;
                const r = await this.gerar('Responde apenas com a palavra: ok');
                return {
                    ok: true,
                    detalhe: `key válida — gerou com ${r.model ?? modelo} «${r.text.slice(0, 30)}»`,
                };
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                // Quota com a listagem já autenticada = key provada (r13).
                if (listagemOk && QUOTA_REGEX.test(msg)) {
                    return {
                        ok: true,
                        detalhe:
                            'key válida — quota excedida de momento, a geração volta quando repor',
                    };
                }
                return { ok: false, detalhe: msg };
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
            // O /api/generate ecoa o modelo que correu + contagens de eval
            // (docs/api.md, r11): prompt_eval_count = input, eval_count = output.
            const json = (await res.json()) as {
                response?: string;
                model?: string;
                prompt_eval_count?: number;
                eval_count?: number;
            };
            const text = (json.response ?? '').trim();
            if (!text) throw new Error('ollama: resposta vazia');
            return {
                text,
                costUsd: null,
                model: json.model,
                tokensIn: tokensOuNull(json.prompt_eval_count),
                tokensCache: null,
                tokensOut: tokensOuNull(json.eval_count),
            };
        },
        async testar() {
            try {
                const res = await fetch(`${OLLAMA_BASE}/api/tags`);
                if (!res.ok) return { ok: false, detalhe: `HTTP ${res.status}` };
                const json = (await res.json()) as { models?: { name: string }[] };
                const tem = (json.models ?? []).some((m) => m.name.startsWith(modelo));
                // Modelo em falta = o chat IA falhar — o teste não pode passar (r9).
                if (!tem) {
                    return {
                        ok: false,
                        detalhe: `daemon ligado, mas o modelo "${modelo}" não está puxado (ollama pull ${modelo})`,
                    };
                }
                return { ok: true, detalhe: `ligado (${modelo} disponível)` };
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

/** O provider do chat segundo as definições — sem fallback: sem provider ativo
 *  lança erro (o user configura em Definições > Agentes, #40 caminho a).
 *  Devolve também o modelo PEDIDO (r12): a legenda compara-o com o real da
 *  metadata — é a garantia por resposta de que a escolha foi honrada. */
export async function providerDoChatCom(db: SupabaseClient): Promise<{
    instancia: ProviderLLM;
    modeloPedido?: string;
    matchCount: number;
    webHabilitada: boolean;
    webKey?: string;
}> {
    const defs = await lerDefinicoesServidorCom(db);
    const escolhido = defs.chatProvider;
    const cfg = defs.agentes[escolhido];
    // #67/#45: nº de fontes + toggle web + key de pesquisa web vêm da mesma leitura de definições.
    if (cfg?.ativo) {
        return {
            instancia: criarProvider(escolhido, cfg),
            modeloPedido: cfg.modelo,
            matchCount: defs.matchCount,
            webHabilitada: defs.webHabilitada,
            webKey: defs.webKey,
        };
    }
    // Sem defaults (#40, caminho a): sem provider ativo não se cai na conta da
    // máquina — pede-se ao utilizador que configure as suas ligações.
    throw new Error('Configura um provider em Definições > Agentes antes de conversar.');
}
