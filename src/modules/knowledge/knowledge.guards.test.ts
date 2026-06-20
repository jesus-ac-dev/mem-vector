import { describe, expect, it } from 'vitest';
import { avaliarCriarNota, adicionarRelacionado } from './knowledge.guards';

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

describe('adicionarRelacionado — auto-link aditivo do one-shot (#121)', () => {
    it('acrescenta uma referência ao vizinho quando a nota não liga a nada', () => {
        const r = adicionarRelacionado('# Nota\nsó texto.', { slug: 'hardware' });
        expect(r).toContain('**Relacionado:** [[hardware]]');
        expect(r).toContain('# Nota');
    });

    it('não mexe quando a nota já tem um wikilink', () => {
        const original = '# Nota\nliga a [[hardware]] no corpo.';
        expect(adicionarRelacionado(original, { slug: 'ram' })).toBe(original);
    });
});
