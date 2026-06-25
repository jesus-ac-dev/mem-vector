import { describe, expect, it } from 'vitest';

import { motivoBloqueio } from './relay.motivo';

describe('motivoBloqueio (reason-code derivado do relay_fase)', () => {
    it("relay_fase 'erro' → erro (o relay falhou, ex. provider sem tokens)", () => {
        expect(motivoBloqueio('erro').codigo).toBe('erro');
        expect(motivoBloqueio(' ERRO ').codigo).toBe('erro');
    });
    it("relay_fase 'órfão' → orfao (crash/restart a meio)", () => {
        expect(motivoBloqueio('órfão').codigo).toBe('orfao');
        expect(motivoBloqueio('orfao').codigo).toBe('orfao');
        expect(motivoBloqueio(' ÓRFÃO ').codigo).toBe('orfao');
    });
    it('uma fase real (dev/testes/…) → sem-consenso (não convergiu)', () => {
        expect(motivoBloqueio('testes').codigo).toBe('sem-consenso');
        expect(motivoBloqueio('dev').codigo).toBe('sem-consenso');
    });
    it('null/desconhecido → sem-consenso (default)', () => {
        expect(motivoBloqueio(null).codigo).toBe('sem-consenso');
    });
    it('traz uma descrição não-vazia para o humano/agente', () => {
        expect(motivoBloqueio('erro').descricao.length).toBeGreaterThan(0);
    });
});
