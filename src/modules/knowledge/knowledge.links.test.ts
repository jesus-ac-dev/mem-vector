import { describe, it, expect } from 'vitest';
import {
    alvoParaHref,
    parseWikilinks,
    partesWikilink,
    reescreverWikilinks,
    slugify,
} from './knowledge.links';

describe('parseWikilinks', () => {
    it('extrai os alvos de [[link]] como slugs, sem duplicados', () => {
        expect(parseWikilinks('ver [[Embeddings E5]] e [[tdd]] e [[tdd]]')).toEqual([
            'embeddings-e5',
            'tdd',
        ]);
    });
    it('em [[alvo|texto]], extrai o alvo e ignora o alias', () => {
        expect(parseWikilinks('ver [[Embeddings E5|a nota de embeddings]]')).toEqual([
            'embeddings-e5',
        ]);
    });
    it('devolve [] quando não há links', () => {
        expect(parseWikilinks('texto sem links')).toEqual([]);
    });
});

describe('partesWikilink', () => {
    it('separa alvo e alias', () => {
        expect(partesWikilink('Embeddings E5|a nota')).toEqual({
            target: 'Embeddings E5',
            label: 'a nota',
            hasAlias: true,
        });
    });

    it('sem alias usa o alvo como label', () => {
        expect(partesWikilink('Embeddings E5')).toEqual({
            target: 'Embeddings E5',
            label: 'Embeddings E5',
            hasAlias: false,
        });
    });
});

describe('slugify', () => {
    it('baixa, troca espaços por hífen e remove acentos', () => {
        expect(slugify('Decisão de Hoje')).toBe('decisao-de-hoje');
    });
});

describe('reescreverWikilinks', () => {
    it('reaponta só os links cujo alvo slugifica para oldSlug', () => {
        const md = 'ver [[Velho Nome]] e [[outra]]';
        expect(reescreverWikilinks(md, 'velho-nome', 'Novo Nome')).toBe(
            'ver [[Novo Nome]] e [[outra]]',
        );
    });
    it('preserva alias explícito ao reapontar o alvo', () => {
        const md = 'ver [[Velho Nome|texto visível]]';
        expect(reescreverWikilinks(md, 'velho-nome', 'Novo Nome')).toBe(
            'ver [[Novo Nome|texto visível]]',
        );
    });
    it('não mexe quando nenhum link bate', () => {
        expect(reescreverWikilinks('só [[outra]]', 'velho-nome', 'Novo')).toBe('só [[outra]]');
    });
});

describe('alvoParaHref', () => {
    it('alvo com cara de data aponta para o daily desse dia', () => {
        expect(alvoParaHref('2026-06-06')).toBe('/daily/2026-06-06');
    });
    it('alvo normal aponta para a nota knowledge (por slug)', () => {
        expect(alvoParaHref('Cães do Carlos')).toBe('/knowledge/caes-do-carlos');
    });
    it('ignora espaços à volta', () => {
        expect(alvoParaHref('  2026-01-02  ')).toBe('/daily/2026-01-02');
    });
});
