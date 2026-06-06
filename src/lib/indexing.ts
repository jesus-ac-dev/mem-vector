import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkMarkdown, type MarkdownChunk } from './chunking';
import { embedPassage, EMBEDDING_MODEL } from './embeddings';

export interface HashedChunk extends MarkdownChunk {
    hash: string;
}

export interface ExistingChunk {
    id: string;
    hash: string;
    startLine: number;
    endLine: number;
    heading: string | null;
}

export interface ChunkUpdate {
    id: string;
    startLine: number;
    endLine: number;
    heading: string | null;
}

export interface ReindexPlan {
    toInsert: HashedChunk[];
    toUpdate: ChunkUpdate[];
    toDeleteIds: string[];
}

// Decide a reindexação incremental por content-hash: chunks com a mesma hash
// reusam o embedding (só atualizam posição/heading se mudaram); hashes novas são
// inseridas; existentes sem correspondência são apagadas. A correspondência é
// por fila para tolerar conteúdo duplicado dentro do mesmo ficheiro.
export function planReindex(next: HashedChunk[], existing: ExistingChunk[]): ReindexPlan {
    const porHash = new Map<string, ExistingChunk[]>();
    for (const e of existing) {
        const fila = porHash.get(e.hash);
        if (fila) fila.push(e);
        else porHash.set(e.hash, [e]);
    }

    const toInsert: HashedChunk[] = [];
    const toUpdate: ChunkUpdate[] = [];
    const usados = new Set<string>();

    for (const c of next) {
        const fila = porHash.get(c.hash);
        const match = fila?.shift();
        if (!match) {
            toInsert.push(c);
            continue;
        }
        usados.add(match.id);
        if (
            match.startLine !== c.startLine ||
            match.endLine !== c.endLine ||
            match.heading !== c.heading
        ) {
            toUpdate.push({
                id: match.id,
                startLine: c.startLine,
                endLine: c.endLine,
                heading: c.heading,
            });
        }
    }

    const toDeleteIds = existing.filter((e) => !usados.has(e.id)).map((e) => e.id);
    return { toInsert, toUpdate, toDeleteIds };
}

export interface ReindexEntityInput {
    ownerId: string;
    entityType: string; // 'knowledge' | 'daily'
    entityId: string;
    source: string; // rótulo de origem do chunk
    contentMd: string;
    metadata: Record<string, unknown>; // base (slug/title ou dia); entity_type/id são acrescentados
}

// Texto efetivamente embedado: o heading dá contexto à secção, mas o `content`
// guardado é a fatia literal (proveniência fiel).
function embedText(c: Pick<MarkdownChunk, 'heading' | 'content'>): string {
    return c.heading ? `${c.heading}\n${c.content}` : c.content;
}

function hashChunk(c: Pick<MarkdownChunk, 'heading' | 'content'>): string {
    return createHash('sha256')
        .update(`${EMBEDDING_MODEL}\n${embedText(c)}`)
        .digest('hex');
}

// Reindexação incremental de uma entidade tipada: parte o content_md em chunks
// por heading, e aplica o plano (apaga stale, atualiza posições reusadas,
// embeda+insere só os novos). Substitui o antigo "apagar tudo + 1 embedding".
export async function reindexEntity(db: SupabaseClient, input: ReindexEntityInput): Promise<void> {
    const next: HashedChunk[] = chunkMarkdown(input.contentMd).map((c) => ({
        ...c,
        hash: hashChunk(c),
    }));

    const { data: existRows, error: exErr } = await db
        .from('chunks')
        .select('id, content_hash, start_line, end_line, heading')
        .eq('owner_id', input.ownerId)
        .eq('metadata->>entity_id', input.entityId);
    if (exErr) throw new Error(`ler chunks: ${exErr.message}`);

    const existing: ExistingChunk[] = (existRows ?? []).map((r) => ({
        id: String(r.id),
        hash: r.content_hash ?? '',
        startLine: r.start_line ?? 0,
        endLine: r.end_line ?? 0,
        heading: r.heading ?? null,
    }));

    const plan = planReindex(next, existing);

    if (plan.toDeleteIds.length) {
        const { error } = await db.from('chunks').delete().in('id', plan.toDeleteIds);
        if (error) throw new Error(`apagar chunks: ${error.message}`);
    }

    for (const u of plan.toUpdate) {
        const { error } = await db
            .from('chunks')
            .update({ start_line: u.startLine, end_line: u.endLine, heading: u.heading })
            .eq('id', u.id);
        if (error) throw new Error(`atualizar chunk: ${error.message}`);
    }

    if (plan.toInsert.length) {
        const baseMetadata = {
            ...input.metadata,
            entity_type: input.entityType,
            entity_id: input.entityId,
        };
        const rows = [];
        for (const c of plan.toInsert) {
            const embedding = await embedPassage(embedText(c));
            rows.push({
                content: c.content,
                embedding: JSON.stringify(embedding),
                source: input.source,
                owner_id: input.ownerId,
                heading: c.heading,
                start_line: c.startLine,
                end_line: c.endLine,
                content_hash: c.hash,
                embedding_model: EMBEDDING_MODEL,
                metadata: baseMetadata,
            });
        }
        const { error } = await db.from('chunks').insert(rows);
        if (error) throw new Error(`inserir chunks: ${error.message}`);
    }
}
