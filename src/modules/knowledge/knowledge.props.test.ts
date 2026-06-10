import { describe, it, expect } from 'vitest';
import { normalizarTags, propriedadesDoRow } from './knowledge.props';

describe('normalizarTags', () => {
    it('apara espaços e remove vazias', () => {
        expect(normalizarTags(['  rag ', '', '   ', 'chat'])).toEqual(['rag', 'chat']);
    });

    it('remove o # inicial (estilo Obsidian)', () => {
        expect(normalizarTags(['#rag', '##nested'])).toEqual(['rag', 'nested']);
    });

    it('deduplica sem distinguir maiúsculas, mantendo a primeira grafia', () => {
        expect(normalizarTags(['RAG', 'rag', 'Chat', 'chat'])).toEqual(['RAG', 'Chat']);
    });

    it('substitui espaços interiores por hífen (tag é uma palavra)', () => {
        expect(normalizarTags(['mem vector'])).toEqual(['mem-vector']);
    });
});

describe('propriedadesDoRow', () => {
    const base = {
        id: 'abc',
        frontmatter: { title: 'X', tags: ['rag'], summary: 'resumo' },
        visibility: 'privado',
        created_at: '2026-06-10T10:00:00Z',
    };

    it('extrai tags, summary, visibility e createdAt', () => {
        expect(propriedadesDoRow(base)).toEqual({
            id: 'abc',
            tags: ['rag'],
            summary: 'resumo',
            visibility: 'privado',
            createdAt: '2026-06-10T10:00:00Z',
        });
    });

    it('tolera frontmatter malformado ou em falta', () => {
        const r = propriedadesDoRow({ ...base, frontmatter: null });
        expect(r.tags).toEqual([]);
        expect(r.summary).toBeNull();

        const r2 = propriedadesDoRow({ ...base, frontmatter: { tags: 'não-é-array' } });
        expect(r2.tags).toEqual([]);
    });

    it('ignora tags não-string dentro do array', () => {
        const r = propriedadesDoRow({ ...base, frontmatter: { tags: ['ok', 7, null] } });
        expect(r.tags).toEqual(['ok']);
    });

    it('visibility desconhecida cai para privado', () => {
        expect(propriedadesDoRow({ ...base, visibility: 'whatever' }).visibility).toBe('privado');
    });
});
