import { describe, expect, it } from 'vitest';

import { blocoKernel, blocoKernelRelay, MYTHOS_BASE_SEED, notasKernelParaRelay } from './kernel';
import { buildPrompt } from '@/modules/chat/chat.prompt';
import { buildTurnoPrompt } from '@/modules/chat/chat.turno';

describe('blocoKernel', () => {
    it('sem notas devolve vazio (workspace sem Kernel = zero mudança)', () => {
        expect(blocoKernel([])).toBe('');
    });

    it('formata as notas com título e cabeçalho de respeito', () => {
        const b = blocoKernel([
            { title: 'Sobre mim', contentMd: 'Sou o Carlos, CTO.' },
            { title: 'Regras do agente', contentMd: 'Trata-me por tu.' },
        ]);
        expect(b).toContain('KERNEL DO WORKSPACE');
        expect(b).toContain('--- Sobre mim ---\nSou o Carlos, CTO.');
        expect(b).toContain('--- Regras do agente ---\nTrata-me por tu.');
    });

    it('corta nota acima do cap sem perder as seguintes', () => {
        const b = blocoKernel([
            { title: 'Gorda', contentMd: 'x'.repeat(9000) },
            { title: 'Magra', contentMd: 'ok' },
        ]);
        expect(b).toContain('[cortado: nota maior que o cap do Kernel]');
        expect(b).toContain('--- Magra ---');
    });

    it('corta o total quando o Kernel excede o cap global', () => {
        const notas = Array.from({ length: 6 }, (_, i) => ({
            title: `N${i}`,
            contentMd: 'y'.repeat(3500),
        }));
        const b = blocoKernel(notas);
        expect(b).toContain('[cortado: Kernel maior que o cap total]');
        expect(b.length).toBeLessThan(14000);
    });
});

describe('Kernel para relay', () => {
    it('seleciona notas focadas em método/regras e evita glossário irrelevante quando há match', () => {
        const notas = [
            { title: 'Glossário', contentMd: 'muito vocabulário' },
            { title: 'Regras do agente', contentMd: 'sem fachadas; verificar sempre' },
        ];
        expect(notasKernelParaRelay(notas).map((n) => n.title)).toEqual(['Regras do agente']);
        const b = blocoKernelRelay(notas);
        expect(b).toContain('KERNEL DO WORKSPACE PARA RELAY');
        expect(b).toContain('sem fachadas');
        expect(b).not.toContain('muito vocabulário');
    });

    it('faz fallback ao Kernel disponível se não houver nota focada', () => {
        const notas = [{ title: 'Sobre mim', contentMd: 'Sou mediador.' }];
        expect(notasKernelParaRelay(notas)).toEqual(notas);
    });

    it('usa cap menor que o Kernel completo para não multiplicar custo por fase/ronda/provider', () => {
        const b = blocoKernelRelay([{ title: 'Regras do agente', contentMd: 'x'.repeat(9000) }]);
        expect(b).toContain('[cortado: nota maior que o cap do Kernel]');
        expect(b.length).toBeLessThan(3000);
    });

    it('a nota Código do seed comum é apanhada pela seleção do relay', () => {
        const codigo = MYTHOS_BASE_SEED.find((n) => n.title === 'Código');
        expect(codigo).toBeTruthy();
        expect(notasKernelParaRelay([codigo!]).map((n) => n.title)).toEqual(['Código']);
    });
});

describe('MYTHOS_BASE_SEED (glossário genérico, #44)', () => {
    it('inclui a nota Glossário', () => {
        expect(MYTHOS_BASE_SEED.map((n) => n.title)).toContain('Glossário');
    });

    it('inclui a nota Código (craft de engenharia comum, herdada por todos)', () => {
        expect(MYTHOS_BASE_SEED.map((n) => n.title)).toContain('Código');
    });

    it('inclui o Manual de Instruções (#128)', () => {
        const manual = MYTHOS_BASE_SEED.find((n) => n.title === 'Manual de Instruções');
        expect(manual?.contentMd).toContain('Como usar este workspace');
        expect(manual?.contentMd).toContain('O Kernel manda');
    });

    it('o glossário é a língua do produto — sem conteúdo pessoal nem do relay', () => {
        const corpo = MYTHOS_BASE_SEED.map((n) => n.contentMd)
            .join('\n')
            .toLowerCase();
        // língua viva do produto-base, para qualquer utilizador
        expect(corpo).toContain('destila');
        expect(corpo).toContain('agente-autor');
        // nada pessoal do dono (isso é o seed:user / onboarding #40)
        expect(corpo).not.toContain('carlos');
        // nada do orquestrador/relay (entra com o módulo GitHub)
        expect(corpo).not.toContain('cruzamento');
        expect(corpo).not.toContain('handoff');
        expect(corpo).not.toContain('árvore torta');
    });

    it('cada nota cabe no cap de nota do Kernel', () => {
        for (const n of MYTHOS_BASE_SEED) {
            expect(n.contentMd.length).toBeLessThanOrEqual(4000);
        }
    });

    it('inclui o esqueleto genérico de voz e método (#120)', () => {
        const titulos = MYTHOS_BASE_SEED.map((n) => n.title);
        expect(titulos).toContain('Voz');
        expect(titulos).toContain('Como trabalho');
        const corpo = MYTHOS_BASE_SEED.map((n) => n.contentMd)
            .join('\n')
            .toLowerCase();
        // método genérico, não pessoal: update-over-create + teia
        expect(corpo).toContain('update');
        expect(corpo).toContain('[[');
        expect(corpo).toContain('nota-índice');
        expect(corpo).toContain('estado vivo');
    });
});

describe('kernel nos prompts de arranque', () => {
    const kernel = blocoKernel([{ title: 'Regras', contentMd: 'Responde sempre em PT-PT.' }]);

    it('buildPrompt (chat) antepõe o kernel quando existe', () => {
        const p = buildPrompt('olá', [], undefined, [], kernel);
        expect(p.startsWith('KERNEL DO WORKSPACE')).toBe(true);
        expect(p).toContain('Responde sempre em PT-PT.');
        // sem kernel, prompt inalterado
        expect(buildPrompt('olá', []).startsWith('Contexto recuperado')).toBe(true);
    });

    it('buildTurnoPrompt (destilação one-shot) antepõe o kernel quando existe', () => {
        const p = buildTurnoPrompt('q', 'a', [], undefined, [], kernel);
        expect(p.startsWith('KERNEL DO WORKSPACE')).toBe(true);
        expect(buildTurnoPrompt('q', 'a').startsWith('És o autor do workspace.')).toBe(true);
    });
});
