import { describe, it, expect } from 'vitest';
import { PALETA, COR_DEFAULT, COR_DAILY_DEFAULT, resolverCor } from './cores';

describe('cores', () => {
    it('a paleta tem cores com label e hex', () => {
        expect(PALETA.length).toBeGreaterThanOrEqual(8);
        for (const c of PALETA) {
            expect(c.label).toBeTruthy();
            expect(c.hex).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });
    it('resolverCor devolve o hex quando há cor', () => {
        expect(resolverCor('#3b82f6')).toBe('#3b82f6');
    });
    it('resolverCor cai no fallback quando null/vazio', () => {
        expect(resolverCor(null)).toBe(COR_DEFAULT);
        expect(resolverCor('')).toBe(COR_DEFAULT);
        expect(resolverCor(undefined, COR_DAILY_DEFAULT)).toBe(COR_DAILY_DEFAULT);
    });
});
