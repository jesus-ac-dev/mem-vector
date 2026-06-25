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

    it('com github ligado, instrui o agente a propor o relay proativamente', async () => {
        generateAgenticMock.mockResolvedValue({ text: 'ok', costUsd: 0 });
        await responderComToolsCom(
            fakeDb() as never,
            'pergunta',
            undefined,
            undefined,
            undefined,
            undefined,
            { token: 'gh', repos: ['a/b'] },
        );
        const cfg = generateAgenticMock.mock.calls[0][1] as { systemPrompt?: string };
        expect(cfg.systemPrompt).toContain('RELAY PROATIVO');
        expect(cfg.systemPrompt).toContain('levanta a proposta de relay');
        expect(cfg.systemPrompt).toContain('sem issue ainda, propõe promover_a_issue');
        expect(cfg.systemPrompt).toContain('com issue já criada, propõe disparar_relay');
        expect(cfg.systemPrompt).toContain('NÃO proponhas');
        expect(cfg.systemPrompt).toContain('nunca disparas sem o OK do utilizador');
    });

    it('com github ligado, instrui o agente a tratar o kill-switch (retoma)', async () => {
        generateAgenticMock.mockResolvedValue({ text: 'ok', costUsd: 0 });
        await responderComToolsCom(
            fakeDb() as never,
            'pergunta',
            undefined,
            undefined,
            undefined,
            undefined,
            { token: 'gh', repos: ['a/b'] },
        );
        const cfg = generateAgenticMock.mock.calls[0][1] as { systemPrompt?: string };
        expect(cfg.systemPrompt).toContain('KILL-SWITCH');
        expect(cfg.systemPrompt).toContain('ler_estado_relay');
        expect(cfg.systemPrompt).toContain('ler_issues');
        expect(cfg.systemPrompt).toContain('RETOMAR sem reiniciar');
        expect(cfg.systemPrompt).toContain('Não decides a escalada sozinho');
    });

    it('sem github, o prompt não fala de relay proativo', async () => {
        generateAgenticMock.mockResolvedValue({ text: 'ok', costUsd: 0 });
        await responderComToolsCom(fakeDb() as never, 'pergunta');
        const cfg = generateAgenticMock.mock.calls[0][1] as { systemPrompt?: string };
        expect(cfg.systemPrompt).not.toContain('RELAY PROATIVO');
        expect(cfg.systemPrompt).not.toContain('KILL-SWITCH');
    });

    it('com token mas sem repos, não promete tools GitHub que o MCP não expõe', async () => {
        generateAgenticMock.mockResolvedValue({ text: 'ok', costUsd: 0 });
        await responderComToolsCom(
            fakeDb() as never,
            'pergunta',
            undefined,
            undefined,
            undefined,
            undefined,
            { token: 'gh', repos: [] },
        );
        const cfg = generateAgenticMock.mock.calls[0][1] as {
            env?: Record<string, string>;
            systemPrompt?: string;
        };
        expect(cfg.systemPrompt).not.toContain('GITHUB (modelo 2.2)');
        expect(cfg.env).not.toHaveProperty('MEMVECTOR_AGENT_GITHUB_TOKEN');
    });
});
