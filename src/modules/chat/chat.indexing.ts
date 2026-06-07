import type { SupabaseClient } from '@supabase/supabase-js';

import { embedPassage, EMBEDDING_MODEL } from '@/lib/embeddings';

export const CHAT_CHUNK_RETENTION_PER_CONVERSATION = 80;
export const CHAT_CHUNK_SOURCE = 'chat';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessageChunkInput {
    conversationId: string;
    messageId: string;
    role: ChatRole;
    content: string;
    createdAt: string;
}

export interface ChatMessageChunkEmbeddingInput extends ChatMessageChunkInput {
    embedding: number[];
}

export interface ChatChunkMetadata {
    entity_type: 'chat_message';
    conversation_id: string;
    message_id: string;
    role: ChatRole;
    created_at: string;
}

export interface ChatChunkInsertRow {
    content: string;
    embedding: string;
    source: typeof CHAT_CHUNK_SOURCE;
    owner_id: string;
    created_at: string;
    embedding_model: string;
    metadata: ChatChunkMetadata;
}

export interface ChatChunkPersistido {
    id: string;
    created_at: string | null;
    metadata: unknown;
}

export function buildChatChunkRows(input: {
    ownerId: string;
    messages: ChatMessageChunkEmbeddingInput[];
}): ChatChunkInsertRow[] {
    return input.messages.map((message) => ({
        content: message.content,
        embedding: JSON.stringify(message.embedding),
        source: CHAT_CHUNK_SOURCE,
        owner_id: input.ownerId,
        created_at: message.createdAt,
        embedding_model: EMBEDDING_MODEL,
        metadata: {
            entity_type: 'chat_message',
            conversation_id: message.conversationId,
            message_id: message.messageId,
            role: message.role,
            created_at: message.createdAt,
        },
    }));
}

function metadataCreatedAt(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    const value = (metadata as { created_at?: unknown }).created_at;
    return typeof value === 'string' ? value : null;
}

function timestamp(value: string | null): number {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function planearPruningChunksChat(
    chunks: ChatChunkPersistido[],
    retentionLimit: number,
): string[] {
    const limit = Math.max(0, Math.floor(retentionLimit));
    if (chunks.length <= limit) return [];

    return [...chunks]
        .sort((a, b) => {
            const aTime = timestamp(metadataCreatedAt(a.metadata) ?? a.created_at);
            const bTime = timestamp(metadataCreatedAt(b.metadata) ?? b.created_at);
            return bTime - aTime || b.id.localeCompare(a.id);
        })
        .slice(limit)
        .map((chunk) => chunk.id);
}

export async function aplicarPruningChunksChatCom(
    db: SupabaseClient,
    input: {
        ownerId: string;
        conversationId: string;
        retentionLimit?: number;
    },
): Promise<void> {
    const retentionLimit = input.retentionLimit ?? CHAT_CHUNK_RETENTION_PER_CONVERSATION;
    const { data, error } = await db
        .from('chunks')
        .select('id, created_at, metadata')
        .eq('owner_id', input.ownerId)
        .eq('source', CHAT_CHUNK_SOURCE)
        .eq('metadata->>conversation_id', input.conversationId);
    if (error) throw new Error(`ler chunks de chat para pruning: ${error.message}`);

    const chunks: ChatChunkPersistido[] = (data ?? []).map((row) => ({
        id: String(row.id),
        created_at: typeof row.created_at === 'string' ? row.created_at : null,
        metadata: row.metadata,
    }));
    const idsParaApagar = planearPruningChunksChat(chunks, retentionLimit);
    if (!idsParaApagar.length) return;

    const deleted = await db.from('chunks').delete().in('id', idsParaApagar);
    if (deleted.error) throw new Error(`apagar chunks de chat antigos: ${deleted.error.message}`);
}

export async function indexarMensagensChatCom(
    db: SupabaseClient,
    input: {
        ownerId: string;
        conversationId: string;
        messages: ChatMessageChunkInput[];
        retentionLimit?: number;
    },
): Promise<void> {
    const messages = input.messages.filter((message) => message.content.trim().length > 0);
    if (!messages.length) return;

    const messagesWithEmbeddings: ChatMessageChunkEmbeddingInput[] = [];
    for (const message of messages) {
        messagesWithEmbeddings.push({
            ...message,
            embedding: await embedPassage(message.content),
        });
    }

    const rows = buildChatChunkRows({
        ownerId: input.ownerId,
        messages: messagesWithEmbeddings,
    });
    const { error } = await db.from('chunks').insert(rows);
    if (error) throw new Error(`indexar chunks de chat: ${error.message}`);

    await aplicarPruningChunksChatCom(db, {
        ownerId: input.ownerId,
        conversationId: input.conversationId,
        retentionLimit: input.retentionLimit,
    });
}
