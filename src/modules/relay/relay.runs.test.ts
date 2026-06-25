import { describe, expect, it } from 'vitest';

import { runDoResultado } from './relay.runs';

describe('runDoResultado (resultado do orquestrador → campos do run-ledger)', () => {
    it('pr-aberto → estado + prUrl, sem fase', () => {
        expect(runDoResultado({ estado: 'pr-aberto', prUrl: 'http://pr/1' })).toEqual({
            estado: 'pr-aberto',
            fase: null,
            prUrl: 'http://pr/1',
        });
    });
    it('bloqueado → estado + fase (onde parou), sem prUrl', () => {
        expect(runDoResultado({ estado: 'bloqueado', cruzamento: 'testes' })).toEqual({
            estado: 'bloqueado',
            fase: 'testes',
            prUrl: null,
        });
    });
    it('pronto (verde sem PR) → só estado', () => {
        expect(runDoResultado({ estado: 'pronto' })).toEqual({
            estado: 'pronto',
            fase: null,
            prUrl: null,
        });
    });
});
