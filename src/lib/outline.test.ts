import { describe, expect, it } from 'vitest';
import { extrairOutline, normalizarHeadingIdTexto } from '@/lib/outline';

describe('outline', () => {
    it('gera ids de anchor estáveis a partir do texto', () => {
        expect(normalizarHeadingIdTexto('Secção com ação!')).toBe('seccao-com-acao');
        expect(normalizarHeadingIdTexto('***')).toBe('secao');
    });

    it('inclui ids únicos para headings repetidos', () => {
        expect(extrairOutline('# Título\n\n## Secção\n## Secção')).toEqual([
            { texto: 'Título', nivel: 1, linha: 1, id: 'titulo' },
            { texto: 'Secção', nivel: 2, linha: 3, id: 'seccao' },
            { texto: 'Secção', nivel: 2, linha: 4, id: 'seccao-2' },
        ]);
    });
});
