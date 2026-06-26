import { describe, expect, it, vi } from 'vitest';

import { montarEstadoRelayAgente, montarEstadoRelayAgenteComTrace } from './relay-estado-trace';

const estadoBloqueado = {
    relayEstado: 'bloqueado',
    relayFase: 'erro',
    repoGithub: 'o/r',
    issueGithub: 141,
};

describe('montarEstadoRelayAgente', () => {
    it('estado não bloqueado segue sem motivo nem trace', () => {
        const estado = { relayEstado: 'processando', relayFase: 'dev' };
        expect(montarEstadoRelayAgente(estado)).toBe(estado);
    });

    it('estado bloqueado inclui motivo e trace real dos comentários', () => {
        expect(
            montarEstadoRelayAgente(estadoBloqueado, [
                { autor: 'github-actions', corpo: 'Erro real: usage limit até 15:30' },
            ]),
        ).toMatchObject({
            relayEstado: 'bloqueado',
            motivo: { codigo: 'erro' },
            trace: [{ corpo: expect.stringContaining('usage limit') }],
        });
    });
});

describe('montarEstadoRelayAgenteComTrace', () => {
    it('só lê trace quando está bloqueado', async () => {
        const lerTrace = vi.fn();
        await expect(
            montarEstadoRelayAgenteComTrace(
                { relayEstado: 'processando', relayFase: 'dev' },
                lerTrace,
            ),
        ).resolves.toEqual({ relayEstado: 'processando', relayFase: 'dev' });
        expect(lerTrace).not.toHaveBeenCalled();
    });

    it('best-effort: se o GitHub falhar mantém estado+motivo e avisa', async () => {
        await expect(
            montarEstadoRelayAgenteComTrace(estadoBloqueado, async () => {
                throw new Error('gh saiu com 1');
            }),
        ).resolves.toMatchObject({
            relayEstado: 'bloqueado',
            motivo: { codigo: 'erro' },
            traceAviso: expect.stringContaining('gh saiu com 1'),
        });
    });
});
