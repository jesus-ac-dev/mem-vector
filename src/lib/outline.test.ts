import { describe, it, expect } from 'vitest';
import { extrairOutline } from './outline';

describe('extrairOutline', () => {
    it('extrai cada heading com texto, nível e linha (1-based)', () => {
        expect(extrairOutline('# A\ntexto\n## B\n### C')).toEqual([
            { texto: 'A', nivel: 1, linha: 1 },
            { texto: 'B', nivel: 2, linha: 3 },
            { texto: 'C', nivel: 3, linha: 4 },
        ]);
    });

    it('ignora linhas que não são headings ATX (precisa de espaço a seguir aos #)', () => {
        expect(extrairOutline('#sem-espaco\nparágrafo normal')).toEqual([]);
    });

    it('sem headings devolve lista vazia', () => {
        expect(extrairOutline('só texto\nmais texto')).toEqual([]);
    });
});
