import { describe, expect, it } from 'vitest';
import { primeiroTituloMarkdown, substituirPrimeiroTituloMarkdown } from './knowledge.title';

describe('primeiroTituloMarkdown', () => {
    it('extrai o primeiro H1 como nome do ficheiro', () => {
        expect(primeiroTituloMarkdown('# Nova nota\n\n## Secção')).toBe('Nova nota');
    });

    it('ignora headings que não são H1', () => {
        expect(primeiroTituloMarkdown('## Secção\n\n# Nome real')).toBe('Nome real');
    });

    it('aceita trailing hashes de ATX heading', () => {
        expect(primeiroTituloMarkdown('# Nome real ###')).toBe('Nome real');
    });

    it('devolve null quando não há H1', () => {
        expect(primeiroTituloMarkdown('texto\n\n## Secção')).toBeNull();
    });
});

describe('substituirPrimeiroTituloMarkdown', () => {
    it('substitui só o primeiro H1', () => {
        expect(substituirPrimeiroTituloMarkdown('# Antigo\n\n# Outro', 'Novo')).toBe(
            '# Novo\n\n# Outro',
        );
    });

    it('preserva o corpo da nota', () => {
        expect(substituirPrimeiroTituloMarkdown('# Antigo\n\nCorpo', 'Novo')).toBe(
            '# Novo\n\nCorpo',
        );
    });

    it('acrescenta H1 quando a nota não tem um', () => {
        expect(substituirPrimeiroTituloMarkdown('Corpo', 'Novo')).toBe('# Novo\n\nCorpo');
    });
});
