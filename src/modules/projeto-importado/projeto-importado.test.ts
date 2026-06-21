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

    it('usa o resumo dado como corpo e summary quando existe', () => {
        const n = construirNotaResumo({ repo: 'o/r', resumo: 'Faz X e Y.' });
        expect(n.content_md).toContain('Faz X e Y.');
        expect(n.summary).toBe('Faz X e Y.');
    });

    it('sem resumo, deixa placeholder e um summary derivado do repo', () => {
        const n = construirNotaResumo({ repo: 'o/r' });
        expect(n.content_md).toContain('Resumo do projeto por preencher');
        expect(n.summary).toContain('o/r');
    });
});
