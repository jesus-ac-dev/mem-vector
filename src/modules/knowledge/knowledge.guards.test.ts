import { describe, expect, it } from 'vitest';
import { avaliarCriarNota } from './knowledge.guards';

describe('avaliarCriarNota — guard sem-órfãos (#121)', () => {
    it('recusa nota sem links quando há candidatas para ligar', () => {
        const r = avaliarCriarNota('# Nota\nsó texto, sem ligações nenhumas.', [
            { slug: 'hardware' },
            { slug: 'ram' },
        ]);
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.mensagem).toContain('[[hardware]]');
            expect(r.mensagem).toContain('órfã');
        }
    });

    it('aceita nota com pelo menos um wikilink, mesmo havendo candidatas', () => {
        expect(
            avaliarCriarNota('# Nota\nliga a [[hardware]] no corpo.', [{ slug: 'hardware' }]),
        ).toEqual({ ok: true });
    });

    it('não força quando não há candidatas (1.ª nota de um assunto novo)', () => {
        expect(avaliarCriarNota('# Nota isolada\nsem links e sem vizinhos.', [])).toEqual({
            ok: true,
        });
    });
});
