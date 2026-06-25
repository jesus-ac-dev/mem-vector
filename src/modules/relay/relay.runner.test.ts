import { describe, it, expect } from 'vitest';

import { correrCruzamento, parseVeredito } from './relay.runner';

describe('parseVeredito (adversarial: só passa com APROVADO)', () => {
    it('APROVADO → ok', () => {
        expect(parseVeredito('APROVADO')).toEqual({ ok: true });
        expect(parseVeredito('  APROVADO.')).toEqual({ ok: true });
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

    it('APROVADO com ressalva continua rejeitado', () => {
        expect(parseVeredito('APROVADO, mas falta rever X')).toEqual({
            ok: false,
            feedback: 'APROVADO, mas falta rever X',
        });
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

    it('nunca passa (outputs diferentes): esgota maxRondas e devolve NÃO validado (kill switch)', async () => {
        let n = 0;
        const r = await correrCruzamento({
            maxRondas: 2,
            produzir: async () => `mau${++n}`,
            validar: async () => ({ ok: false, feedback: 'continua mau' }),
        });
        expect(r.rondas).toBe(2);
        expect(r.validado).toBe(false);
        expect(r.historico).toHaveLength(2);
        expect(r.stall).toBeFalsy();
    });

    it('stall: repete o output apesar do feedback → pára cedo (poupa rondas)', async () => {
        let chamadas = 0;
        const r = await correrCruzamento({
            maxRondas: 5,
            produzir: async () => {
                chamadas++;
                return 'mesmo output';
            },
            validar: async () => ({ ok: false, feedback: 'melhora' }),
        });
        expect(r.validado).toBe(false);
        expect(r.stall).toBe(true);
        expect(r.rondas).toBe(2); // parou na 2ª (o repeat), não gastou as 5
        expect(chamadas).toBe(2); // poupou 3 produções
    });
});
