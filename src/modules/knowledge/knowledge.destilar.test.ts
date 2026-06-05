import { describe, it, expect } from 'vitest';
import { buildDestilarPrompt, parseDestilacao } from './knowledge.destilar';

describe('parseDestilacao', () => {
    it('devolve null quando o modelo diz NADA', () => {
        expect(parseDestilacao('NADA')).toBeNull();
    });
    it('extrai o bloco JSON válido', () => {
        const raw = 'Aqui:\n```json\n{"title":"X","content_md":"c","links":[],"reason":"r"}\n```';
        expect(parseDestilacao(raw)?.title).toBe('X');
    });
    it('devolve null se o JSON for inválido (não inventa)', () => {
        expect(parseDestilacao('{ lixo')).toBeNull();
    });
});

describe('buildDestilarPrompt', () => {
    it('inclui a pergunta e a resposta e pede NADA quando não há nada durável', () => {
        const p = buildDestilarPrompt('q?', 'a.');
        expect(p).toContain('q?');
        expect(p).toContain('NADA');
    });
});
