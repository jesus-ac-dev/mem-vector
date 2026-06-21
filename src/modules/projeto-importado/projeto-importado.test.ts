import { describe, expect, it } from 'vitest';

import { construirNotaResumo, nomeCurtoDoRepo } from './projeto-importado.service';

describe('nomeCurtoDoRepo', () => {
    it('tira o nome do owner/nome', () => {
        expect(nomeCurtoDoRepo('jesus-ac-dev/mem-vector')).toBe('mem-vector');
    });
    it('aguenta uma string sem barra', () => {
        expect(nomeCurtoDoRepo('mem-vector')).toBe('mem-vector');
    });
});

describe('construirNotaResumo', () => {
    it('põe o repo e o path local no header, título = nome curto', () => {
        const n = construirNotaResumo({
            repo: 'jesus-ac-dev/mem-vector',
            pathLocal: '/home/carlos/src/mem-vector',
        });
        expect(n.title).toBe('mem-vector');
        expect(n.content_md).toContain('# mem-vector');
        expect(n.content_md).toContain('`jesus-ac-dev/mem-vector`');
        expect(n.content_md).toContain('https://github.com/jesus-ac-dev/mem-vector');
        expect(n.content_md).toContain('`/home/carlos/src/mem-vector`');
    });

    it('sem path, marca "(por definir)" em vez de vazio', () => {
        const n = construirNotaResumo({ repo: 'o/r' });
        expect(n.content_md).toContain('(por definir)');
    });

    it('tags = #projeto + #<nome-curto>', () => {
        const n = construirNotaResumo({ repo: 'jesus-ac-dev/crmcredito' });
        expect(n.tags).toEqual(['projeto', 'crmcredito']);
    });

    it('usa o README como corpo; summary = 1ª linha de conteúdo (sem #/badges)', () => {
        const readme = '# crmcredito\n\n![badge](x)\n\nMediação de crédito para imobiliárias.';
        const n = construirNotaResumo({ repo: 'o/crmcredito', readme });
        expect(n.content_md).toContain('Mediação de crédito para imobiliárias.');
        expect(n.summary).toBe('Mediação de crédito para imobiliárias.');
    });

    it('sem README, deixa placeholder e um summary derivado do repo', () => {
        const n = construirNotaResumo({ repo: 'o/r' });
        expect(n.content_md).toContain('Resumo do projeto por preencher');
        expect(n.summary).toContain('o/r');
    });
});
