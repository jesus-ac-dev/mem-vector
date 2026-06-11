import { describe, expect, it } from 'vitest';

import { blocoKernel } from './kernel';
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
