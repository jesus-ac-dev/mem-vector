import { describe, it, expect } from 'vitest';

import { buildPrompt, relevantSources, type Source } from './chat.prompt';

const src = (content: string): Source => ({ content, source: null, similarity: 0.9 });
const withSim = (similarity: number): Source => ({ content: 'x', source: null, similarity });

describe('buildPrompt', () => {
    it('inclui o conteúdo de cada fonte recuperada, numerado', () => {
        const prompt = buildPrompt('pergunta?', [src('alfa'), src('beta')]);
        expect(prompt).toContain('alfa');
        expect(prompt).toContain('beta');
        expect(prompt).toContain('[1]');
        expect(prompt).toContain('[2]');
    });

    it('marca a ausência de contexto quando não há fontes', () => {
        const prompt = buildPrompt('pergunta?', []);
        expect(prompt).toContain('(sem contexto)');
    });

    it('inclui a pergunta do utilizador', () => {
        const prompt = buildPrompt('o que decidimos sobre auth?', [src('x')]);
        expect(prompt).toContain('o que decidimos sobre auth?');
    });

    it('deixa de prender a resposta só ao contexto (já não é RAG-only)', () => {
        const prompt = buildPrompt('o que é Lisboa?', []);
        expect(prompt).not.toMatch(/só o contexto/i);
        expect(prompt).not.toMatch(/usando só/i);
    });

    it('carrega a regra dos 2 níveis: workspace-only vs conhecimento geral', () => {
        const prompt = buildPrompt('pergunta?', [src('x')]);
        expect(prompt).toMatch(/workspace/i);
        expect(prompt).toMatch(/conhecimento geral/i);
    });
});

describe('relevantSources', () => {
    it('mantém fontes no threshold ou acima', () => {
        const kept = relevantSources([withSim(0.9), withSim(0.78)], 0.78);
        expect(kept).toHaveLength(2);
    });

    it('remove fontes abaixo do threshold', () => {
        const kept = relevantSources([withSim(0.9), withSim(0.7)], 0.78);
        expect(kept.map((s) => s.similarity)).toEqual([0.9]);
    });

    it('lista vazia continua vazia', () => {
        expect(relevantSources([], 0.78)).toEqual([]);
    });

    it('preserva a ordem das fontes mantidas', () => {
        const kept = relevantSources([withSim(0.9), withSim(0.85), withSim(0.82)], 0.8);
        expect(kept.map((s) => s.similarity)).toEqual([0.9, 0.85, 0.82]);
    });

    // Rede de segurança calibrada com a medição real (e5-small, janela ~0.03):
    // o default corta o lixo de fundo (irrelevante medido ~0.76) e mantém o
    // relevante medido (~0.83), com margem para não perder contexto bom.
    it('default conservador: corta o irrelevante medido, mantém o relevante medido', () => {
        const kept = relevantSources([withSim(0.834), withSim(0.763)]);
        expect(kept.map((s) => s.similarity)).toEqual([0.834]);
    });

    // Híbrido: o FTS apanha termos exatos (slug, erro, ID) que o embedding dilui.
    // Uma fonte com match lexical conta como do workspace mesmo com cosseno baixo.
    it('mantém fonte abaixo do threshold quando o FTS bateu no termo (lexical)', () => {
        const lexical: Source = { content: 'x', source: null, similarity: 0.5, lexical: true };
        const kept = relevantSources([lexical], 0.78);
        expect(kept).toEqual([lexical]);
    });

    it('corta fonte abaixo do threshold sem match lexical', () => {
        const denso: Source = { content: 'x', source: null, similarity: 0.5, lexical: false };
        expect(relevantSources([denso], 0.78)).toEqual([]);
    });
});
