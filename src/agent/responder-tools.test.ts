import { appendFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateAgenticMock = vi.fn();
const generateAgenticStreamMock = vi.fn();
vi.mock('@/lib/claude', () => ({
    generateAgentic: (prompt: string, cfg: unknown) => generateAgenticMock(prompt, cfg),
    generateAgenticStream: (prompt: string, cfg: unknown, onTextDelta: (texto: string) => void) =>
        generateAgenticStreamMock(prompt, cfg, onTextDelta),
}));

const dispararRelayMock = vi.fn();
vi.mock('@/modules/relay/relay.actions', () => ({
    dispararRelay: (repo: string, issue: number) => dispararRelayMock(repo, issue),
}));

import { responderComToolsCom } from './responder-tools';

function fakeDb() {
    return {
        auth: {
            getSession: async () => ({
                data: { session: { access_token: 'a', refresh_token: 'r' } },
            }),
        },
    };
}

describe('responderComToolsCom (#89)', () => {
    beforeEach(() => {
        generateAgenticMock.mockReset();
        generateAgenticStreamMock.mockReset();
        dispararRelayMock.mockReset();
    });

    it('passa o modelo escolhido ao agente escalado (cfg.model)', async () => {
        // O bug: a escolha de modelo (sonnet) não chegava ao caminho agentic →
        // o CLI corria no default (opus) e o trace marcava divergência.
        generateAgenticMock.mockResolvedValue({
            text: 'ok',
            costUsd: 0,
            model: 'claude-sonnet-4-6',
        });

        await responderComToolsCom(fakeDb() as never, 'pergunta', undefined, 'sonnet');

        const cfg = generateAgenticMock.mock.calls[0][1] as { model?: string };
        expect(cfg.model).toBe('sonnet');
    });

    it('passa só o access token ao MCP server do agente', async () => {
        generateAgenticMock.mockResolvedValue({
            text: 'ok',
            costUsd: 0,
        });

        await responderComToolsCom(fakeDb() as never, 'pergunta');

        const cfg = generateAgenticMock.mock.calls[0][1] as {
            env?: Record<string, string>;
        };
        expect(cfg.env?.MEMVECTOR_AGENT_ACCESS_TOKEN).toBe('a');
        expect(cfg.env).not.toHaveProperty('MEMVECTOR_AGENT_REFRESH_TOKEN');
    });

    it('dispara relays pedidos no result-file após a resposta agentic', async () => {
        generateAgenticMock.mockImplementation(async (_prompt: string, cfg: unknown) => {
            const resultFile = (cfg as { env: Record<string, string> }).env
                .MEMVECTOR_AGENT_RESULT_FILE;
            appendFileSync(
                resultFile,
                `${JSON.stringify({ tipo: 'relay', repo: 'jesus-ac-dev/mem-vector', issue: 164 })}\n`,
                'utf8',
            );
            return { text: 'vou disparar', costUsd: 0 };
        });
        dispararRelayMock.mockResolvedValue({ ok: true, detalhe: 'ok' });

        await responderComToolsCom(
            fakeDb() as never,
            'pergunta',
            undefined,
            undefined,
            undefined,
            undefined,
            { token: 'gh', repos: ['jesus-ac-dev/mem-vector'] },
        );

        expect(dispararRelayMock).toHaveBeenCalledWith('jesus-ac-dev/mem-vector', 164);
    });

    it('não esconde falha esperada do dispararRelay no caminho streaming', async () => {
        generateAgenticStreamMock.mockImplementation(
            async (_prompt: string, cfg: unknown, onTextDelta: (texto: string) => void) => {
                const resultFile = (cfg as { env: Record<string, string> }).env
                    .MEMVECTOR_AGENT_RESULT_FILE;
                appendFileSync(
                    resultFile,
                    `${JSON.stringify({ tipo: 'relay', repo: 'jesus-ac-dev/mem-vector', issue: 164 })}\n`,
                    'utf8',
                );
                onTextDelta('vou disparar');
                return { text: 'vou disparar', costUsd: 0 };
            },
        );
        dispararRelayMock.mockResolvedValue({
            ok: false,
            detalhe: 'Sem providers ativos (Definições > Agentes).',
        });
        const deltas: string[] = [];

        const r = await responderComToolsCom(
            fakeDb() as never,
            'pergunta',
            undefined,
            undefined,
            (d) => deltas.push(d),
            undefined,
            { token: 'gh', repos: ['jesus-ac-dev/mem-vector'] },
        );

        expect(r.text).toContain(
            'Relay não disparado para jesus-ac-dev/mem-vector #164: Sem providers ativos',
        );
        expect(deltas.join('')).toContain(
            'Relay não disparado para jesus-ac-dev/mem-vector #164: Sem providers ativos',
        );
    });
});
