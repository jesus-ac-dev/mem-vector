import { embedQuery } from '@/lib/embeddings';
import { generate } from '@/lib/claude';
import { createClient } from '@/lib/supabase/server';
import { buildPrompt, relevantSources, type Source } from './chat.prompt';
import { destilar as destilarReal } from '@/modules/knowledge/knowledge.destilar';
import { escreverNota as escreverNotaReal } from '@/modules/knowledge/knowledge.service';

export type { Source };

export interface ChatResult {
    answer: string;
    sources: Source[];
    costUsd: number;
}

interface DestilDeps {
    destilar: (q: string, a: string) => Promise<unknown>;
    escrever: (input: unknown) => Promise<unknown>;
}

export async function aplicarDestilacao(
    question: string,
    answer: string,
    deps: DestilDeps = {
        destilar: destilarReal,
        escrever: escreverNotaReal as DestilDeps['escrever'],
    },
): Promise<void> {
    const nota = await deps.destilar(question, answer);
    if (nota) await deps.escrever(nota);
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

    // Filtra o lixo de fundo: só fontes relevantes vão ao prompt e ao resultado
    // (sources honesto). Abaixo do corte → (sem contexto) → fallback limpo.
    const sources = relevantSources((data ?? []) as Source[]);
    const { text, costUsd } = await generate(buildPrompt(question, sources));

    // Destilação proativa: best-effort — falha nunca bloqueia a resposta ao user.
    try {
        await aplicarDestilacao(question, text);
    } catch (e) {
        console.error('destilação falhou:', e);
    }

    return { answer: text, sources, costUsd };
}
