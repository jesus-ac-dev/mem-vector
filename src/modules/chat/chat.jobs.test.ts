import { describe, expect, it } from 'vitest';
import { distillationJobPayloadSchema, parseDistillationJobResult } from '@/modules/chat/chat.jobs';

describe('chat jobs', () => {
    it('valida payload de destilação com ids de mensagens opcionais/null', () => {
        const payload = distillationJobPayloadSchema.parse({
            question: 'O que decidimos?',
            answer: 'Decidimos criar jobs duráveis.',
            conversationId: '11111111-1111-4111-8111-111111111111',
            userMessageId: null,
            assistantMessageId: '22222222-2222-4222-8222-222222222222',
        });

        expect(payload.question).toBe('O que decidimos?');
        expect(payload.userMessageId).toBeNull();
    });

    it('normaliza resultado persistido do job para TurnoDestilado', () => {
        expect(
            parseDistillationJobResult({
                nota: { slug: 'jobs-duraveis', title: 'Jobs duráveis', criada: true },
                daily: { dia: '2026-06-07', criado: false },
            }),
        ).toEqual({
            nota: { slug: 'jobs-duraveis', title: 'Jobs duráveis', criada: true },
            daily: { dia: '2026-06-07', criado: false },
        });
    });
});
