import { describe, expect, it } from 'vitest';

import {
    buildChatChunkRows,
    planearPruningChunksChat,
    type ChatChunkPersistido,
} from './chat.indexing';

describe('chat indexing', () => {
    it('cria chunks de chat com metadata de conversa e mensagem', () => {
        const rows = buildChatChunkRows({
            ownerId: 'user-1',
            messages: [
                {
                    conversationId: 'conv-1',
                    messageId: 'msg-user',
                    role: 'user',
                    content: 'Pergunta sobre o workspace',
                    createdAt: '2026-06-07T10:00:00.000Z',
                    embedding: [0.1, 0.2],
                },
                {
                    conversationId: 'conv-1',
                    messageId: 'msg-assistant',
                    role: 'assistant',
                    content: 'Resposta com contexto.',
                    createdAt: '2026-06-07T10:00:03.000Z',
                    embedding: [0.3, 0.4],
                },
            ],
        });

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            content: 'Pergunta sobre o workspace',
            embedding: '[0.1,0.2]',
            source: 'chat',
            owner_id: 'user-1',
            created_at: '2026-06-07T10:00:00.000Z',
            embedding_model: 'multilingual-e5-small',
            metadata: {
                entity_type: 'chat_message',
                conversation_id: 'conv-1',
                message_id: 'msg-user',
                role: 'user',
                created_at: '2026-06-07T10:00:00.000Z',
            },
        });
        expect(rows[1].metadata.role).toBe('assistant');
    });

    it('planeia pruning mantendo os chunks mais recentes por conversa', () => {
        const chunks: ChatChunkPersistido[] = [
            chunk({ id: 'old', metadataCreatedAt: '2026-06-07T09:00:00.000Z' }),
            chunk({ id: 'middle', metadataCreatedAt: '2026-06-07T10:00:00.000Z' }),
            chunk({ id: 'new', metadataCreatedAt: '2026-06-07T11:00:00.000Z' }),
        ];

        expect(planearPruningChunksChat(chunks, 2)).toEqual(['old']);
    });

    it('nao apaga nada quando o limite cobre todos os chunks', () => {
        expect(
            planearPruningChunksChat(
                [
                    chunk({ id: 'a', metadataCreatedAt: '2026-06-07T09:00:00.000Z' }),
                    chunk({ id: 'b', metadataCreatedAt: '2026-06-07T10:00:00.000Z' }),
                ],
                2,
            ),
        ).toEqual([]);
    });
});

function chunk(input: { id: string; metadataCreatedAt: string }): ChatChunkPersistido {
    return {
        id: input.id,
        created_at: '2026-06-07T00:00:00.000Z',
        metadata: {
            created_at: input.metadataCreatedAt,
        },
    };
}
