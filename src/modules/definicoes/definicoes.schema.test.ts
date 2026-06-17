import { describe, expect, it } from 'vitest';

import { DefinicoesSchema } from './definicoes.schema';

// #67: o nº de fontes do retrieval era fixo (5). Passa a ser configurável, com
// um default são e limites (não faz sentido 0 nem centenas).
describe('DefinicoesSchema matchCount (#67)', () => {
    it('usa o default 5 quando ausente', () => {
        expect(DefinicoesSchema.parse({ agentes: {} }).matchCount).toBe(5);
    });

    it('aceita um valor dentro dos limites', () => {
        expect(DefinicoesSchema.parse({ agentes: {}, matchCount: 10 }).matchCount).toBe(10);
    });

    it('rejeita fora dos limites (0 ou demasiado alto) e não-inteiros', () => {
        expect(() => DefinicoesSchema.parse({ agentes: {}, matchCount: 0 })).toThrow();
        expect(() => DefinicoesSchema.parse({ agentes: {}, matchCount: 100 })).toThrow();
        expect(() => DefinicoesSchema.parse({ agentes: {}, matchCount: 3.5 })).toThrow();
    });
});
