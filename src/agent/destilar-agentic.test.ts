import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateAgenticMock = vi.fn();
vi.mock('@/lib/claude', () => ({
    generateAgentic: (prompt: string, cfg: unknown) => generateAgenticMock(prompt, cfg),
}));

import { destilarTurnoAgenticCom } from './destilar-agentic';

function fakeDb() {
    return {
        auth: {
            getSession: async () => ({
                data: { session: { access_token: 'access-token', refresh_token: 'refresh-token' } },
            }),
        },
    };
}

describe('destilarTurnoAgenticCom (#159)', () => {
    beforeEach(() => generateAgenticMock.mockReset());

    it('passa só o access token ao MCP server do agente', async () => {
        generateAgenticMock.mockResolvedValue({
            text: 'ok',
            costUsd: 0,
        });

        await destilarTurnoAgenticCom(fakeDb() as never, {
            question: 'pergunta',
            answer: 'resposta',
        });

        const cfg = generateAgenticMock.mock.calls[0][1] as {
            env?: Record<string, string>;
        };
        expect(cfg.env?.MEMVECTOR_AGENT_ACCESS_TOKEN).toBe('access-token');
        expect(cfg.env).not.toHaveProperty('MEMVECTOR_AGENT_REFRESH_TOKEN');
    });
});
