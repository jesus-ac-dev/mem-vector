import { describe, expect, it } from 'vitest';

import { AGENT_CONTRACT, buildPromptAgentic } from './contract';

describe('AGENT_CONTRACT', () => {
    it('carrega as regras do agente-autor (ler antes de escrever, update-bias, estilo)', () => {
        expect(AGENT_CONTRACT).toContain('ler_nota ANTES de decidir');
        expect(AGENT_CONTRACT).toContain('CONTINUA a nota dona do assunto');
        expect(AGENT_CONTRACT).toContain('carimbos de proveniência');
        expect(AGENT_CONTRACT).toContain('não escreves NADA');
        expect(AGENT_CONTRACT).toContain('FONTES YOUTUBE / TRANSCRIPTS');
        expect(AGENT_CONTRACT).toContain('nunca "Notas sobre <vídeo>"');
    });
});

describe('buildPromptAgentic', () => {
    it('inclui a troca e nada mais quando não há contexto', () => {
        const p = buildPromptAgentic('olá', 'Olá!');
        expect(p).toContain('Pergunta: olá');
        expect(p).toContain('Resposta: Olá!');
        expect(p).not.toContain('NOTAS CANDIDATAS');
        expect(p).not.toContain('DECLAROU UM FACTO');
        expect(p).not.toContain('Conversa recente');
    });

    it('lista candidatas só por referência (id/título/slug), sem conteúdo', () => {
        const p = buildPromptAgentic('a Sofia tem 2 filhos', 'Registado.', [
            {
                id: 'abc-1',
                slug: 'carlos-e-sofia',
                title: 'Carlos e Sofia',
                contentMd: '# segredo',
            },
        ]);
        expect(p).toContain('id: abc-1');
        expect(p).toContain('slug: carlos-e-sofia');
        // O conteúdo fica para a tool ler_nota: ler antes de escrever.
        expect(p).not.toContain('# segredo');
    });

    it('mostra tags das candidatas para o contrato reconhecer transcripts YouTube', () => {
        const p = buildPromptAgentic('analisa este vídeo', 'pontos principais', [
            {
                id: 'video-1',
                slug: 'finally-agent-loops-clearly-explained',
                title: 'Finally Agent Loops Clearly Explained',
                contentMd: '# segredo',
                tags: ['youtube', 'transcript'],
            },
        ]);
        expect(p).toContain('tags: youtube, transcript');
        expect(p).not.toContain('# segredo');
    });

    it('marca intenção declarativa e injeta a conversa recente', () => {
        const p = buildPromptAgentic(
            'eles têm dois filhos',
            'Registado.',
            [],
            { tipo: 'declarativa', incerta: false },
            [{ role: 'user', content: 'O Carlos gosta da Sofia' }],
        );
        expect(p).toContain('DECLAROU UM FACTO');
        expect(p).toContain('Utilizador: O Carlos gosta da Sofia');
    });
});
