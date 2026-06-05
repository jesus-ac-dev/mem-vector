import { describe, it, expect } from 'vitest';
import { parseWikilinks, slugify } from './knowledge.links';

describe('parseWikilinks', () => {
    it('extrai os alvos de [[link]] como slugs, sem duplicados', () => {
        expect(parseWikilinks('ver [[Embeddings E5]] e [[tdd]] e [[tdd]]')).toEqual([
            'embeddings-e5',
            'tdd',
        ]);
    });
    it('devolve [] quando não há links', () => {
        expect(parseWikilinks('texto sem links')).toEqual([]);
    });
});

describe('slugify', () => {
    it('baixa, troca espaços por hífen e remove acentos', () => {
        expect(slugify('Decisão de Hoje')).toBe('decisao-de-hoje');
    });
});
