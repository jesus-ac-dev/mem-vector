import { embedQuery } from '@/lib/embeddings';
import { generate } from '@/lib/claude';
import { createClient } from '@/lib/supabase/server';
import { buildPrompt, type Source } from './chat.prompt';

export type { Source };

export interface ChatResult {
    answer: string;
    sources: Source[];
    costUsd: number;
}

// Pipeline do ping-pong: embed(query) → match_chunks → prompt → claude.
export async function respond(question: string): Promise<ChatResult> {
    const db = await createClient();
    const queryEmbedding = await embedQuery(question);

    const { data, error } = await db.rpc('match_chunks', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_count: 5,
    });
    if (error) throw new Error(`match_chunks falhou: ${error.message}`);

    const sources = (data ?? []) as Source[];
    const { text, costUsd } = await generate(buildPrompt(question, sources));
    return { answer: text, sources, costUsd };
}
