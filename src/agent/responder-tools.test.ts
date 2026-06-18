import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateAgenticMock = vi.fn();
vi.mock('@/lib/claude', () => ({
    generateAgentic: (prompt: string, cfg: unknown) => generateAgenticMock(prompt, cfg),
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
    beforeEach(() => generateAgenticMock.mockReset());

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
});
