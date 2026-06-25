import { describe, expect, it } from 'vitest';

import { recallAtK, janelaSeparacao, type ResultadoQuery } from './evals-recall';

function r(notaEsperada: string | null, rank: number | null): ResultadoQuery {
    return { query: 'q', notaEsperada, rank, simEsperada: null, topSim: null, mantida: false };
}

describe('recallAtK', () => {
    it('conta só as relevantes cobertas até k', () => {
        const res = [r('a', 1), r('b', 3), r('c', null), r(null, null)];
        expect(recallAtK(res, 5)).toBeCloseTo(2 / 3); // a,b cobertas; c não; null ignorada
    });
    it('k limita o rank', () => {
        expect(recallAtK([r('a', 1), r('b', 4)], 3)).toBe(0.5); // só a(1) <= 3
    });
    it('sem relevantes → 0', () => {
        expect(recallAtK([r(null, null)], 5)).toBe(0);
    });
});

describe('janelaSeparacao', () => {
    it('separação limpa → janela positiva, corte no meio', () => {
        const j = janelaSeparacao([0.85, 0.83, 0.88], [0.8, 0.76]);
        expect(j.minRel).toBe(0.83);
        expect(j.maxIrr).toBe(0.8);
        expect(j.janela).toBeCloseTo(0.03);
        expect(j.corteSugerido).toBeCloseTo(0.815);
    });
    it('sobreposição → janela negativa', () => {
        expect(janelaSeparacao([0.79], [0.82]).janela).toBeLessThan(0);
    });
    it('recusa arrays vazios para não devolver Infinity/NaN', () => {
        expect(() => janelaSeparacao([], [0.8])).toThrow(RangeError);
        expect(() => janelaSeparacao([0.8], [])).toThrow(RangeError);
    });
});
