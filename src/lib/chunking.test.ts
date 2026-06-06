import { describe, it, expect } from 'vitest';
import { chunkMarkdown } from './chunking';

describe('chunkMarkdown', () => {
    it('sem headings devolve um único chunk com o conteúdo todo', () => {
        expect(chunkMarkdown('linha um\nlinha dois')).toEqual([
            { heading: null, content: 'linha um\nlinha dois', startLine: 1, endLine: 2 },
        ]);
    });

    it('parte por headings, capturando heading, conteúdo e intervalo de linhas', () => {
        const md = '# Título\nintro\n\n## Secção A\ncorpo a\n\n## Secção B\ncorpo b';
        expect(chunkMarkdown(md)).toEqual([
            { heading: 'Título', content: '# Título\nintro', startLine: 1, endLine: 2 },
            { heading: 'Secção A', content: '## Secção A\ncorpo a', startLine: 4, endLine: 5 },
            { heading: 'Secção B', content: '## Secção B\ncorpo b', startLine: 7, endLine: 8 },
        ]);
    });

    it('o conteúdo antes do primeiro heading é o seu próprio chunk (preâmbulo)', () => {
        const md = 'preâmbulo\n\n# Título\ncorpo';
        expect(chunkMarkdown(md)).toEqual([
            { heading: null, content: 'preâmbulo', startLine: 1, endLine: 1 },
            { heading: 'Título', content: '# Título\ncorpo', startLine: 3, endLine: 4 },
        ]);
    });

    it('secção acima do limite cai para split por parágrafos, mantendo o heading e as linhas', () => {
        const md = '## G\naaaa\n\nbbbb\n\ncccc';
        expect(chunkMarkdown(md, { maxChars: 9 })).toEqual([
            { heading: 'G', content: '## G\naaaa', startLine: 1, endLine: 2 },
            { heading: 'G', content: 'bbbb', startLine: 4, endLine: 4 },
            { heading: 'G', content: 'cccc', startLine: 6, endLine: 6 },
        ]);
    });

    it('parágrafos cabem juntos quando somados ficam dentro do limite', () => {
        const md = '## G\naaaa\n\nbbbb\n\ncccc';
        expect(chunkMarkdown(md, { maxChars: 12 })).toEqual([
            { heading: 'G', content: '## G\naaaa', startLine: 1, endLine: 2 },
            { heading: 'G', content: 'bbbb\n\ncccc', startLine: 4, endLine: 6 },
        ]);
    });

    it('string vazia ou só-em-branco devolve nenhum chunk', () => {
        expect(chunkMarkdown('')).toEqual([]);
        expect(chunkMarkdown('   \n\n  ')).toEqual([]);
    });
});
