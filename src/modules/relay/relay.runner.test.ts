import { describe, it, expect } from 'vitest';

import { correrCruzamento, parseVeredito } from './relay.runner';

describe('parseVeredito (adversarial: só passa com APROVADO)', () => {
    it('APROVADO → ok', () => {
        expect(parseVeredito('APROVADO')).toEqual({ ok: true });
        expect(parseVeredito('  APROVADO, está sólido')).toEqual({ ok: true });
    });

    it('REJEITADO → não ok, com a objeção como feedback', () => {
        expect(parseVeredito('REJEITADO: falta tratar o null em X')).toEqual({
            ok: false,
            feedback: 'falta tratar o null em X',
        });
    });

    it('texto ambíguo sem APROVADO → não ok (default-to-refuted)', () => {
        expect(parseVeredito('isto não me parece bem...').ok).toBe(false);
    });
});

describe('correrCruzamento (round-loop do circuito)', () => {
    it("sem validador ('none'): 1 ronda, validado", async () => {
        const r = await correrCruzamento({
            maxRondas: 3,
            produzir: async () => 'feito',
            validar: null,
        });
        expect(r).toMatchObject({ output: 'feito', rondas: 1, validado: true });
    });

    it('valida ok à 1ª: termina numa ronda', async () => {
        const r = await correrCruzamento({
            maxRondas: 3,
            produzir: async () => 'v1',
            validar: async () => ({ ok: true }),
        });
        expect(r.rondas).toBe(1);
        expect(r.validado).toBe(true);
    });

    it('validador derruba → feedback volta ao produzir → passa à 2ª', async () => {
        const feedbacks: (string | null)[] = [];
        let n = 0;
        const r = await correrCruzamento({
            maxRondas: 3,
            produzir: async (fb) => {
                feedbacks.push(fb);
                return `v${++n}`;
            },
            validar: async (out) =>
                out === 'v2' ? { ok: true } : { ok: false, feedback: 'falta X' },
        });
        expect(r.rondas).toBe(2);
        expect(r.validado).toBe(true);
        expect(feedbacks).toEqual([null, 'falta X']); // a 2ª ronda recebeu a objeção
    });

    it('nunca passa: esgota maxRondas e devolve NÃO validado (kill switch)', async () => {
        const r = await correrCruzamento({
            maxRondas: 2,
            produzir: async () => 'mau',
            validar: async () => ({ ok: false, feedback: 'continua mau' }),
        });
        expect(r.rondas).toBe(2);
        expect(r.validado).toBe(false);
        expect(r.historico).toHaveLength(2);
    });
});
