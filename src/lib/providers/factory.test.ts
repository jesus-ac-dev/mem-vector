import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCodexCliArgs, criarProvider } from './factory';
import { confirmacaoModelo, type AgenteServidor } from '@/modules/definicoes/definicoes.schema';

// #60 r9: o modo api tem de ser REAL — uma key ao calhas não pode passar no
// Testar ligação (o repro do Carlos: api + pass inventada + sucesso falso).

const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

function resposta(status: number, corpo: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(corpo),
        json: async () => corpo,
    };
}

const cfgApi = (extra: Partial<AgenteServidor> = {}): AgenteServidor => ({
    ativo: true,
    modo: 'api',
    apiKey: 'sk-teste',
    ...extra,
});

describe('claude em modo api (#60 r9)', () => {
    it('gerar chama a Messages API com a key e devolve o modelo real', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, {
                content: [{ type: 'text', text: 'olá' }],
                model: 'claude-opus-4-8',
            }),
        );
        const p = criarProvider('claude', cfgApi({ modelo: 'claude-opus-4-8' }));
        const r = await p.gerar('diz olá');
        expect(r.text).toBe('olá');
        expect(r.model).toBe('claude-opus-4-8');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.anthropic.com/v1/messages');
        expect(init.headers['x-api-key']).toBe('sk-teste');
        expect(init.headers['anthropic-version']).toBeTruthy();
    });

    it('testar com key inválida FALHA (a listagem dá 401)', async () => {
        fetchMock.mockResolvedValue(resposta(401, { error: { type: 'authentication_error' } }));
        const p = criarProvider('claude', cfgApi({ apiKey: 'pass-ao-calhas' }));
        const r = await p.testar();
        expect(r.ok).toBe(false);
        expect(r.detalhe).toMatch(/401|inválida/);
    });

    it('testar sem key falha sem ir à rede', async () => {
        const p = criarProvider('claude', cfgApi({ apiKey: undefined }));
        const r = await p.testar();
        expect(r.ok).toBe(false);
        expect(r.detalhe).toMatch(/key em falta/i);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('testar com alias do CLI guardado usa o default da API (fica resolvido)', async () => {
        fetchMock
            .mockResolvedValueOnce(
                resposta(200, { data: [{ id: 'claude-opus-4-8' }, { id: 'claude-haiku-4-5' }] }),
            )
            .mockResolvedValueOnce(
                resposta(200, {
                    content: [{ type: 'text', text: 'ok' }],
                    model: 'claude-opus-4-8',
                }),
            );
        // 'haiku' é alias do CLI — não existe na API; o teste não pode rebentar nisso.
        const p = criarProvider('claude', cfgApi({ modelo: 'haiku' }));
        const r = await p.testar();
        expect(r.ok).toBe(true);
        const corpoGeracao = JSON.parse(fetchMock.mock.calls[1][1].body);
        expect(corpoGeracao.model).toBe('claude-opus-4-8');
    });

    it('quota DEPOIS da listagem autenticada = key provada, teste passa (r13)', async () => {
        fetchMock
            .mockResolvedValueOnce(resposta(200, { data: [{ id: 'claude-opus-4-8' }] }))
            .mockResolvedValueOnce(resposta(429, { error: { type: 'rate_limit_error' } }));
        const p = criarProvider('claude', cfgApi());
        const r = await p.testar();
        expect(r.ok).toBe(true);
        expect(r.detalhe).toMatch(/quota excedida/);
    });

    it('listarModelos descobre a lista real via /v1/models', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, { data: [{ id: 'claude-sonnet-4-6' }, { id: 'claude-opus-4-8' }] }),
        );
        const p = criarProvider('claude', cfgApi());
        expect(await p.listarModelos()).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6']);
        expect(fetchMock.mock.calls[0][0]).toContain('https://api.anthropic.com/v1/models');
    });
});

describe('codex em modo api (#60 r9)', () => {
    it('gerar chama a API da OpenAI com Bearer', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, {
                choices: [{ message: { content: 'olá' } }],
                model: 'gpt-5.5',
            }),
        );
        const p = criarProvider('codex', cfgApi({ modelo: 'gpt-5.5' }));
        const r = await p.gerar('diz olá');
        expect(r.text).toBe('olá');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.openai.com/v1/chat/completions');
        expect(init.headers.authorization).toBe('Bearer sk-teste');
    });

    it('gerar passa o esforço xhigh DIRETO — existe na API (SDK shared.ts, r10)', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, { choices: [{ message: { content: 'ok' } }] }),
        );
        const p = criarProvider('codex', cfgApi({ modelo: 'gpt-5.5', esforco: 'xhigh' }));
        await p.gerar('x');
        const corpo = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(corpo.reasoning_effort).toBe('xhigh');
        expect(corpo.max_completion_tokens).toBe(16000);
    });

    it('gerar sem modelo pede a escolha em vez de inventar', async () => {
        const p = criarProvider('codex', cfgApi());
        await expect(p.gerar('x')).rejects.toThrow(/escolhe um modelo/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('testar com key inválida FALHA', async () => {
        fetchMock.mockResolvedValue(resposta(401, { error: { message: 'bad key' } }));
        const p = criarProvider('codex', cfgApi({ apiKey: 'pass-ao-calhas' }));
        const r = await p.testar();
        expect(r.ok).toBe(false);
    });

    it('listarModelos filtra o ruído (embeddings/audio) e ordena', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, {
                data: [
                    { id: 'gpt-5.5' },
                    { id: 'text-embedding-3-small' },
                    { id: 'whisper-1' },
                    { id: 'gpt-5.4-mini' },
                    { id: 'o4-mini' },
                ],
            }),
        );
        const p = criarProvider('codex', cfgApi());
        expect(await p.listarModelos()).toEqual(['gpt-5.4-mini', 'gpt-5.5', 'o4-mini']);
    });
});

describe('codex em modo cli', () => {
    it('gera num tempdir sem herdar config/regras pessoais do ~/.codex', () => {
        const args = buildCodexCliArgs(
            { ativo: true, modo: 'cli', modelo: 'gpt-5.5', esforco: 'high' },
            '/tmp/memvector-codex-abc',
            '/tmp/memvector-codex-abc/last-message.txt',
        );

        expect(args).toContain('--ignore-user-config');
        expect(args).toContain('--ignore-rules');
        expect(args).toContain('--ephemeral');
        expect(args).toContain('--skip-git-repo-check');
        expect(args).toContain('--sandbox');
        expect(args).toContain('read-only');
        expect(args).toContain('-C');
        expect(args).toContain('/tmp/memvector-codex-abc');
        expect(args).toContain('--model');
        expect(args).toContain('gpt-5.5');
        expect(args).toContain('model_reasoning_effort="high"');
    });
});

describe('confirmacaoModelo — garantia por resposta (r12)', () => {
    it('pedido contido no real (sufixos de versão) = confirmado', () => {
        expect(confirmacaoModelo('haiku', 'claude-haiku-4-5')).toBe('confirmado');
        expect(confirmacaoModelo('gemini-2.5-flash', 'gemini-2.5-flash-002')).toBe('confirmado');
        expect(confirmacaoModelo('llama3.2', 'llama3.2:latest')).toBe('confirmado');
    });

    it('real de outra família = divergente (o medo do Carlos: pedir haiku, vir opus)', () => {
        expect(confirmacaoModelo('haiku', 'claude-opus-4-8')).toBe('divergente');
        expect(confirmacaoModelo('gpt-5.4-mini', 'gpt-5.5')).toBe('divergente');
    });

    it('variante com nome a seguir ao pedido = divergente, não confirmação (audit r12)', () => {
        expect(confirmacaoModelo('gpt-5.5', 'gpt-5.5-mini')).toBe('divergente');
        expect(confirmacaoModelo('gemini-2.5-flash', 'gemini-2.5-flash-lite-preview')).toBe(
            'divergente',
        );
    });

    it('sem real = nao-reportado; sem pedido = confirmado (default do provider)', () => {
        expect(confirmacaoModelo('haiku', undefined)).toBe('nao-reportado');
        expect(confirmacaoModelo(undefined, 'claude-opus-4-8')).toBe('confirmado');
    });
});

describe('modelo REAL reportado por todos os providers (r11)', () => {
    it('gemini api devolve o modelVersion da resposta', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, {
                candidates: [{ content: { parts: [{ text: 'olá' }] } }],
                modelVersion: 'gemini-2.5-flash-002',
            }),
        );
        const p = criarProvider('gemini', cfgApi());
        const r = await p.gerar('x');
        expect(r.model).toBe('gemini-2.5-flash-002');
    });

    it('ollama devolve o model ecoado pelo daemon', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, { response: 'olá', model: 'llama3.2:latest' }),
        );
        const p = criarProvider('ollama', { ativo: true, modo: 'cli' });
        const r = await p.gerar('x');
        expect(r.model).toBe('llama3.2:latest');
    });

    it('codex api devolve o model da resposta', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, {
                choices: [{ message: { content: 'olá' } }],
                model: 'gpt-5.5-2026-04-01',
            }),
        );
        const p = criarProvider('codex', cfgApi({ modelo: 'gpt-5.5' }));
        const r = await p.gerar('x');
        expect(r.model).toBe('gpt-5.5-2026-04-01');
    });
});

describe('tokens in/out por turno (#65)', () => {
    it('claude api soma input+cache no tokens_in e devolve output (mesmo envelope do CLI)', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, {
                content: [{ type: 'text', text: 'olá' }],
                model: 'claude-opus-4-8',
                usage: {
                    input_tokens: 10,
                    cache_read_input_tokens: 200,
                    cache_creation_input_tokens: 0,
                    output_tokens: 42,
                },
            }),
        );
        const r = await criarProvider('claude', cfgApi({ modelo: 'claude-opus-4-8' })).gerar('x');
        expect(r.tokensIn).toBe(210); // 10 fresco + 200 cache
        expect(r.tokensCache).toBe(200);
        expect(r.tokensOut).toBe(42);
    });

    it('codex api lê prompt_tokens/completion_tokens', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, {
                choices: [{ message: { content: 'olá' } }],
                model: 'gpt-5.5',
                usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 },
            }),
        );
        const r = await criarProvider('codex', cfgApi({ modelo: 'gpt-5.5' })).gerar('x');
        expect(r.tokensIn).toBe(30);
        expect(r.tokensCache).toBeNull(); // OpenAI não tem o conceito de cache aqui
        expect(r.tokensOut).toBe(12);
    });

    it('gemini api lê usageMetadata (prompt/candidates)', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, {
                candidates: [{ content: { parts: [{ text: 'olá' }] } }],
                modelVersion: 'gemini-2.5-flash-002',
                usageMetadata: {
                    promptTokenCount: 25,
                    candidatesTokenCount: 8,
                    totalTokenCount: 33,
                },
            }),
        );
        const r = await criarProvider('gemini', cfgApi()).gerar('x');
        expect(r.tokensIn).toBe(25);
        expect(r.tokensOut).toBe(8);
    });

    it('ollama lê prompt_eval_count/eval_count do daemon', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, {
                response: 'olá',
                model: 'llama3.2',
                prompt_eval_count: 15,
                eval_count: 7,
            }),
        );
        const r = await criarProvider('ollama', { ativo: true, modo: 'cli' }).gerar('x');
        expect(r.tokensIn).toBe(15);
        expect(r.tokensOut).toBe(7);
    });

    it('provider que não reporta tokens devolve null (não inventa)', async () => {
        fetchMock.mockResolvedValueOnce(
            resposta(200, { candidates: [{ content: { parts: [{ text: 'olá' }] } }] }),
        );
        const r = await criarProvider('gemini', cfgApi()).gerar('x');
        expect(r.tokensIn).toBeNull();
        expect(r.tokensOut).toBeNull();
    });
});

describe('gemini e ollama — o teste deixa as coisas resolvidas (r8/r9)', () => {
    it('gemini testar faz mini-geração real depois de validar a key', async () => {
        fetchMock
            .mockResolvedValueOnce(resposta(200, { models: [{ name: 'models/gemini-2.5-flash' }] }))
            .mockResolvedValueOnce(
                resposta(200, {
                    candidates: [{ content: { parts: [{ text: 'ok' }] } }],
                }),
            );
        const p = criarProvider('gemini', cfgApi());
        const r = await p.testar();
        expect(r.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toContain(':generateContent');
    });

    it('gemini testar com key inválida FALHA', async () => {
        fetchMock.mockResolvedValue(resposta(400, { error: { message: 'API key not valid' } }));
        const p = criarProvider('gemini', cfgApi({ apiKey: 'pass-ao-calhas' }));
        const r = await p.testar();
        expect(r.ok).toBe(false);
    });

    it('gemini com quota esgotada mas key provada pela listagem PASSA (caso do Carlos, r13)', async () => {
        fetchMock
            .mockResolvedValueOnce(resposta(200, { models: [{ name: 'models/gemini-2.5-flash' }] }))
            .mockResolvedValueOnce(
                resposta(429, { error: { message: 'Resource has been exhausted (quota)' } }),
            );
        const p = criarProvider('gemini', cfgApi());
        const r = await p.testar();
        expect(r.ok).toBe(true);
        expect(r.detalhe).toMatch(/quota excedida/);
    });

    it('gemini em modo CLI usa o binário, não a REST — lista é o contrato do --model (r10)', async () => {
        const p = criarProvider('gemini', { ativo: true, modo: 'cli' });
        const modelos = await p.listarModelos();
        expect(modelos).toContain('gemini-2.5-flash');
        expect(modelos).toContain('gemini-3-pro-preview');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ollama testar FALHA quando o modelo escolhido não está puxado', async () => {
        fetchMock.mockResolvedValueOnce(resposta(200, { models: [{ name: 'llama3.2:latest' }] }));
        const p = criarProvider('ollama', { ativo: true, modo: 'cli', modelo: 'mistral' });
        const r = await p.testar();
        expect(r.ok).toBe(false);
        expect(r.detalhe).toMatch(/não está puxado/);
    });
});
