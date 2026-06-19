import { describe, expect, it } from 'vitest';

import {
    montarTextoBriefingMemoria,
    sanitizarJsonMemoria,
    sanitizarTextoMemoria,
    type BriefingMemoria,
} from './memory.service';
import { RegistarObservacaoInputSchema } from './memory.schema';

describe('memory.service', () => {
    it('sanitiza segredos comuns antes de persistir', () => {
        const texto =
            'Bearer abc.def.ghi sk-proj-1234567890abcdef token=abc123 https://user:pass@example.com /home/carlos/.ssh/id_rsa ~/.aws/credentials ~/.kube/config';

        const limpo = sanitizarTextoMemoria(texto);

        expect(limpo).not.toContain('abc.def.ghi');
        expect(limpo).not.toContain('sk-proj-1234567890abcdef');
        expect(limpo).not.toContain('abc123');
        expect(limpo).not.toContain('pass@example.com');
        expect(limpo).not.toContain('.ssh');
        expect(limpo).not.toContain('.aws');
        expect(limpo).not.toContain('.kube');
    });

    it('sanitiza metadata recursiva sem perder estrutura', () => {
        expect(
            sanitizarJsonMemoria({
                provider: 'openai',
                nested: ['api_key=secret-value', { path: '/home/carlos/.aws/credentials' }],
            }),
        ).toEqual({
            provider: 'openai',
            nested: ['api_key=[redigido]', { path: '[caminho-sensivel-redigido]' }],
        });
    });

    it('valida tipos normalizados de observação', () => {
        expect(
            RegistarObservacaoInputSchema.parse({
                type: 'agent-write',
                content: 'nota escrita',
            }).type,
        ).toBe('agent-write');

        expect(() =>
            RegistarObservacaoInputSchema.parse({
                type: 'random-event',
            }),
        ).toThrow();
    });

    it('monta briefing barato sem LLM', () => {
        const base: Omit<BriefingMemoria, 'texto'> = {
            contagens: {
                mensagens7d: 3,
                mensagens30d: 8,
                observacoes7d: 2,
                observacoes30d: 5,
                escritas7d: 1,
                escritas30d: 4,
                tarefas7d: 1,
                tarefas30d: 2,
            },
            handoffsAbertos: [
                {
                    id: 'h1',
                    sessionId: null,
                    conversationId: null,
                    summary: 'Retomar o reset da BD.',
                    openQuestions: [],
                    nextSteps: [],
                    entitiesTouched: [],
                    status: 'open',
                    acceptedBy: null,
                    acceptedAt: null,
                    expiredAt: null,
                    createdAt: '2026-06-19T10:00:00Z',
                    updatedAt: '2026-06-19T10:00:00Z',
                },
            ],
            recentes: [
                {
                    tipo: 'knowledge',
                    id: 'k1',
                    titulo: 'Kernel',
                    updatedAt: '2026-06-19T10:00:00Z',
                },
            ],
            kernel: 'KERNEL DO WORKSPACE\nRegras.',
        };

        expect(montarTextoBriefingMemoria(base)).toContain('Mensagens: 3 em 7d / 8 em 30d');
        expect(montarTextoBriefingMemoria(base)).toContain('Retomar o reset da BD.');
        expect(montarTextoBriefingMemoria(base)).toContain('knowledge: Kernel');
        expect(montarTextoBriefingMemoria(base)).toContain('KERNEL DO WORKSPACE');
    });
});
