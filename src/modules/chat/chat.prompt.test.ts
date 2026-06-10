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

    it('proíbe respostas que mandem usar Obsidian ou comandos externos para daily/nota', () => {
        const prompt = buildPrompt('cria uma daily note sff', []);
        expect(prompt).toMatch(/Nunca proponhas comandos do Obsidian/i);
        expect(prompt).toMatch(/agente-autor/i);
    });

    // Guard das fontes (#19): nunca afirmar que uma nota contém o que não está lá.
    it('carrega o guard das fontes: citar o trecho literal, não parafrasear a fonte', () => {
        const prompt = buildPrompt('pergunta?', [src('x')]);
        expect(prompt).toMatch(/trecho literal/i);
        expect(prompt).toMatch(/nunca .*cont[ée]m o que/i);
    });

    // Declarativa sem marcas de pergunta = facto a registar (#19, decisão 2026-06-10).
    it('declarativa: instrui a tratar como facto e responder "Registado: …"', () => {
        const prompt = buildPrompt('o carlos gosta da sofia', [], {
            tipo: 'declarativa',
            incerta: false,
        });
        expect(prompt).toContain('Afirmação do utilizador: o carlos gosta da sofia');
        expect(prompt).not.toContain('Pergunta: o carlos gosta da sofia');
        expect(prompt).toMatch(/Registado: /);
        expect(prompt).toMatch(/facto a registar/i);
        expect(prompt).toMatch(/sauda|trivial/i);
    });

    it('declarativa incerta: instrui a registar e sinalizar a assunção', () => {
        const prompt = buildPrompt('a sofia talvez goste de gatos', [], {
            tipo: 'declarativa',
            incerta: true,
        });
        expect(prompt).toMatch(/assumi que é facto/i);
    });

    it('declarativa certa: não pede sinalização de assunção', () => {
        const prompt = buildPrompt('o carlos gosta da sofia', [], {
            tipo: 'declarativa',
            incerta: false,
        });
        expect(prompt).not.toMatch(/assumi que é facto/i);
    });

    // Janela de conversa (#19, 2.º smoke): "Eles têm dois filhos juntos" sem o
    // fio da conversa não tem sujeito — o prompt tem de levar o histórico.
    it('inclui a conversa recente quando há histórico', () => {
        const prompt = buildPrompt(
            'eles têm dois filhos juntos',
            [],
            { tipo: 'declarativa', incerta: false },
            [
                { role: 'user', content: 'o carlos gosta da sofia' },
                { role: 'assistant', content: 'Registado: o Carlos gosta da Sofia.' },
            ],
        );
        expect(prompt).toMatch(/conversa recente/i);
        expect(prompt).toContain('o carlos gosta da sofia');
        expect(prompt).toContain('Registado: o Carlos gosta da Sofia.');
    });

    it('sem histórico não inclui o bloco de conversa recente', () => {
        const prompt = buildPrompt('pergunta?', [src('x')]);
        expect(prompt).not.toMatch(/conversa recente/i);
    });

    it('declarativa: manda resolver pronomes num facto autocontido', () => {
        const prompt = buildPrompt('eles têm dois filhos', [], {
            tipo: 'declarativa',
            incerta: false,
        });
        expect(prompt).toMatch(/pronomes/i);
        expect(prompt).toMatch(/autocontido/i);
    });

    it('pergunta explícita mantém o prompt de query', () => {
        const prompt = buildPrompt('o que decidimos sobre auth?', [src('x')], {
            tipo: 'pergunta',
            incerta: false,
        });
        expect(prompt).toContain('Pergunta: o que decidimos sobre auth?');
        expect(prompt).not.toMatch(/Registado: /);
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
