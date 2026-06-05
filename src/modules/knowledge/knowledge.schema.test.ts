import { describe, it, expect } from 'vitest';
import { EscritaKnowledgeSchema, FrontmatterSchema } from './knowledge.schema';

describe('EscritaKnowledgeSchema', () => {
    it('aceita uma escrita válida com links opcionais', () => {
        const ok = EscritaKnowledgeSchema.parse({
            title: 'Embeddings E5',
            content_md: 'corpo [[tdd]]',
            reason: 'facto durável',
        });
        expect(ok.title).toBe('Embeddings E5');
        expect(ok.links).toEqual([]);
    });
    it('rejeita title vazio', () => {
        expect(() =>
            EscritaKnowledgeSchema.parse({ title: '', content_md: 'x', reason: 'y' }),
        ).toThrow();
    });
});

describe('FrontmatterSchema', () => {
    it('exige title; tags default []', () => {
        const fm = FrontmatterSchema.parse({ title: 'X' });
        expect(fm.tags).toEqual([]);
    });
});
