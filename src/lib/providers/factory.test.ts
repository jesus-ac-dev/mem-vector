import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { criarProvider } from './factory';
import type { AgenteServidor } from '@/modules/definicoes/definicoes.schema';

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
