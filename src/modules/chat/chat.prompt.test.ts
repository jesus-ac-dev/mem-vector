import { describe, it, expect } from 'vitest';

import { buildPrompt, type Source } from './chat.prompt';

const src = (content: string): Source => ({ content, source: null, similarity: 0.9 });

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
