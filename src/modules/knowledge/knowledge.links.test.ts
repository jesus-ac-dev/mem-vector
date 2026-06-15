import { describe, it, expect } from 'vitest';
import {
    alvoParaHref,
    parseWikilinkTargets,
    parseWikilinks,
    partesWikilink,
    reescreverWikilinkPaths,
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
    it('em alvo com caminho, extrai o slug do último segmento', () => {
        expect(parseWikilinks('ver [[Pasta/Teste|Teste]]')).toEqual(['teste']);
    });
    it('mantém slugs únicos mesmo quando há alvo com path', () => {
        expect(parseWikilinks('ver [[Teste]] e [[Pasta/Teste|Teste]]')).toEqual(['teste']);
    });
    it('devolve [] quando não há links', () => {
        expect(parseWikilinks('texto sem links')).toEqual([]);
    });
});

describe('parseWikilinkTargets', () => {
    it('preserva o path quando o alvo inclui pasta', () => {
        expect(parseWikilinkTargets('ver [[Pasta/Teste|Teste]]')).toEqual([
            { target: 'Pasta/Teste', slug: 'teste', path: 'Pasta/Teste' },
        ]);
    });

    it('deduplica por slug e path, não só por slug', () => {
        expect(parseWikilinkTargets('[[Teste]] [[Pasta/Teste|Teste]]')).toEqual([
            { target: 'Teste', slug: 'teste', path: null },
            { target: 'Pasta/Teste', slug: 'teste', path: 'Pasta/Teste' },
        ]);
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
    it('remove alias redundante quando seguia o título antigo', () => {
        const md = 'ver [[Velho Nome|Velho Nome]]';
        expect(reescreverWikilinks(md, 'velho-nome', 'Novo Nome')).toBe('ver [[Novo Nome]]');
    });
    it('preserva o caminho ao renomear target com pasta', () => {
        const md = 'ver [[Pasta/Velho Nome|Velho Nome]]';
        expect(reescreverWikilinks(md, 'velho-nome', 'Novo Nome')).toBe(
            'ver [[Pasta/Novo Nome|Novo Nome]]',
        );
    });
    it('em links com path, atualiza alias redundante para manter leitura curta', () => {
        const md = 'ver [[teste/Renamed|Renamed]]';
        expect(reescreverWikilinks(md, 'renamed', 'despos')).toBe('ver [[teste/despos|despos]]');
    });
    it('quando recebe path antigo, não reescreve homónimos noutras pastas', () => {
        const md = 'ver [[A/Velho Nome|Velho Nome]] e [[B/Velho Nome|Velho Nome]]';
        expect(
            reescreverWikilinks(md, 'velho-nome', 'Novo Nome', {
                oldTargetPath: 'A/Velho Nome',
            }),
        ).toBe('ver [[A/Novo Nome|Novo Nome]] e [[B/Velho Nome|Velho Nome]]');
    });
    it('não mexe quando nenhum link bate', () => {
        expect(reescreverWikilinks('só [[outra]]', 'velho-nome', 'Novo')).toBe('só [[outra]]');
    });
});

describe('reescreverWikilinkPaths', () => {
    it('reescreve o prefixo da pasta e preserva alias', () => {
        const md = 'ver [[Antiga/Nova nota|Nova nota]]';
        expect(reescreverWikilinkPaths(md, 'Antiga', 'Nova')).toBe(
            'ver [[Nova/Nova nota|Nova nota]]',
        );
    });

    it('reescreve também paths de subpastas', () => {
        const md = 'ver [[Antiga/Sub/Nova nota]]';
        expect(reescreverWikilinkPaths(md, 'Antiga', 'Nova')).toBe('ver [[Nova/Sub/Nova nota]]');
    });

    it('não mexe em pastas com nome parecido', () => {
        const md = 'ver [[Antiga Extra/Nova nota]]';
        expect(reescreverWikilinkPaths(md, 'Antiga', 'Nova')).toBe(md);
    });
});

describe('alvoParaHref', () => {
    it('alvo com cara de data aponta para o daily desse dia', () => {
        expect(alvoParaHref('2026-06-06')).toBe('/daily/2026-06-06');
    });
    it('alvo normal aponta para a nota knowledge (por slug)', () => {
        expect(alvoParaHref('Cães do Carlos')).toBe('/knowledge/caes-do-carlos');
    });
    it('alvo com caminho preserva o path para resolver colisões de pasta', () => {
        expect(alvoParaHref('Pasta/Teste')).toBe('/knowledge/teste?path=Pasta%2FTeste');
    });
    it('ignora espaços à volta', () => {
        expect(alvoParaHref('  2026-01-02  ')).toBe('/daily/2026-01-02');
    });
    it('alvo conversa:<id> aponta para a vista da conversa', () => {
        expect(alvoParaHref('conversa:11111111-2222-3333-4444-555555555555')).toBe(
            '/chat/11111111-2222-3333-4444-555555555555',
        );
    });
});

describe('parseWikilinkTargets — namespace conversa', () => {
    it('ignora [[conversa:<id>]] (não é nota knowledge, não gera edge)', () => {
        const md = 'recap [[conversa:abc-123]] e [[Embeddings E5]]';
        expect(parseWikilinkTargets(md).map((t) => t.slug)).toEqual(['embeddings-e5']);
        expect(parseWikilinks(md)).toEqual(['embeddings-e5']);
    });
});
