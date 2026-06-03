import { embedQuery } from '@/lib/embeddings';
import { generate } from '@/lib/claude';
import { createClient } from '@/lib/supabase/server';

export interface Source {
    content: string;
    source: string | null;
    similarity: number;
}

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
    const context = sources.length
        ? sources.map((s, i) => `[${i + 1}] ${s.content}`).join('\n\n')
        : '(sem contexto)';

    const prompt =
        `Contexto recuperado da base de conhecimento:\n\n${context}\n\n` +
        `Pergunta: ${question}\n\n` +
        `Responde usando só o contexto acima.`;

    const { text, costUsd } = await generate(prompt);
    return { answer: text, sources, costUsd };
}
