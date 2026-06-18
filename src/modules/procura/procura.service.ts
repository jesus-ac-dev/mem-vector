import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { embedQuery } from '@/lib/embeddings';

// Procura sobre o que está pesquisável (os `chunks`), em dois modos (#91):
//   - "Texto": full-text com prefixo (`chunks.fts`, to_tsquery `termo:*`);
//   - "Conceito": semântico (embedding + `match_chunks` por vetor).
// Ambos agrupam por entidade de origem (knowledge/daily/chat). RLS por dono.

export type TipoResultado = 'knowledge' | 'daily' | 'chat';

export interface ResultadoProcura {
    tipo: TipoResultado;
    id: string; // entity_id (knowledge/daily) ou conversation_id (chat)
    titulo: string;
    slug?: string; // knowledge — para o href
    dia?: string; // daily — para o href
    excerto: string;
}

interface ChunkMeta {
    entity_type?: string;
    entity_id?: string;
    slug?: string;
    title?: string;
    dia?: string;
    conversation_id?: string;
}

export interface ChunkHit {
    id: string;
    content: string;
    source: string;
    metadata: ChunkMeta | null;
}

const tipoDoChunk = (c: ChunkHit): TipoResultado =>
    c.source === 'knowledge' ? 'knowledge' : c.source === 'daily' ? 'daily' : 'chat';

const chaveEntidade = (c: ChunkHit): string =>
    c.metadata?.entity_id ?? c.metadata?.conversation_id ?? c.id;

// Dedup por entidade preservando a ordem (1.º chunk = melhor match). Pura/testável.
export function dedupPorEntidade(chunks: ChunkHit[]): ChunkHit[] {
    const vistos = new Set<string>();
    const out: ChunkHit[] = [];
    for (const c of chunks) {
        const chave = chaveEntidade(c);
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        out.push(c);
    }
    return out;
}

// Numa barra de procura "à medida que se escreve", cada termo é um PREFIXO
// (`termo:*`): "DDR" encontra "DDR5"/"DDR4" — o `websearch_to_tsquery` casava só
// o lexema exato. Sanitiza (tira pontuação que o `to_tsquery` lê como
// operadores) e junta com AND. Pura/testável. (#91 smoke)
export function construirQueryPrefixo(input: string): string {
    return input
        .trim()
        .split(/\s+/)
        .map((termo) => termo.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter(Boolean)
        .map((termo) => `${termo}:*`)
        .join(' & ');
}

// Comum aos dois modos: dedup por entidade + resolve títulos por id + monta os
// resultados. O metadata nem sempre traz o título — busca-se (como o chat).
async function montarResultados(
    db: SupabaseClient,
    chunks: ChunkHit[],
    limite: number,
): Promise<ResultadoProcura[]> {
    const hits = dedupPorEntidade(chunks).slice(0, limite);
    if (!hits.length) return [];

    const idsK = hits.filter((h) => tipoDoChunk(h) === 'knowledge').map(chaveEntidade);
    const idsD = hits.filter((h) => tipoDoChunk(h) === 'daily').map(chaveEntidade);
    const idsC = hits.filter((h) => tipoDoChunk(h) === 'chat').map(chaveEntidade);

    const [k, d, c] = await Promise.all([
        idsK.length
            ? db.from('knowledge').select('id, slug, title').in('id', idsK)
            : Promise.resolve({ data: [] as { id: string; slug: string; title: string }[] }),
        idsD.length
            ? db.from('dailies').select('id, dia').in('id', idsD)
            : Promise.resolve({ data: [] as { id: string; dia: string }[] }),
        idsC.length
            ? db.from('conversations').select('id, title').in('id', idsC)
            : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    ]);
    const kPorId = new Map((k.data ?? []).map((r) => [String(r.id), r]));
    const dPorId = new Map((d.data ?? []).map((r) => [String(r.id), r]));
    const cPorId = new Map((c.data ?? []).map((r) => [String(r.id), r]));

    return hits.map((h) => {
        const tipo = tipoDoChunk(h);
        const id = chaveEntidade(h);
        const excerto = h.content.slice(0, 200);
        if (tipo === 'knowledge') {
            const nota = kPorId.get(id);
            return {
                tipo,
                id,
                titulo: nota?.title ?? h.metadata?.title ?? '(nota)',
                slug: nota?.slug,
                excerto,
            };
        }
        if (tipo === 'daily') {
            const dia = dPorId.get(id)?.dia ?? h.metadata?.dia ?? id;
            return { tipo, id, titulo: dia, dia, excerto };
        }
        return { tipo, id, titulo: cPorId.get(id)?.title || 'Conversa', excerto };
    });
}

// Modo "Texto": full-text por prefixo.
export async function procurarTextoCom(
    db: SupabaseClient,
    termo: string,
    limite = 30,
): Promise<ResultadoProcura[]> {
    const query = construirQueryPrefixo(termo);
    if (!query) return [];

    const { data, error } = await db
        .from('chunks')
        .select('id, content, source, metadata')
        // Sem `type` → to_tsquery, que aceita a sintaxe de prefixo `termo:*`.
        .textSearch('fts', query, { config: 'portuguese' })
        .limit(limite * 3); // pool — dedup por entidade reduz para ~limite
    if (error) throw new Error(`procura texto: ${error.message}`);

    return montarResultados(db, (data ?? []) as ChunkHit[], limite);
}

// Modo "Conceito": semântico (embedding + match_chunks). O match_chunks não
// devolve metadata — busca-se por id, preservando a ordem de similaridade.
export async function procurarConceitoCom(
    db: SupabaseClient,
    termo: string,
    limite = 30,
): Promise<ResultadoProcura[]> {
    const t = termo.trim();
    if (!t) return [];

    const emb = await embedQuery(t);
    const mc = await db.rpc('match_chunks', {
        query_embedding: JSON.stringify(emb),
        match_count: limite * 3,
    });
    if (mc.error) throw new Error(`procura conceito: ${mc.error.message}`);
    const rows = (mc.data ?? []) as { id: string; content: string; source: string }[];
    if (!rows.length) return [];

    const { data: metas } = await db
        .from('chunks')
        .select('id, metadata')
        .in(
            'id',
            rows.map((r) => r.id),
        );
    const metaPorId = new Map((metas ?? []).map((m) => [String(m.id), m.metadata as ChunkMeta]));
    const hits: ChunkHit[] = rows.map((r) => ({
        id: r.id,
        content: r.content,
        source: r.source,
        metadata: metaPorId.get(r.id) ?? null,
    }));
    return montarResultados(db, hits, limite);
}

export const procurarTexto = async (termo: string, limite?: number) =>
    procurarTextoCom(await createClient(), termo, limite);

export const procurarConceito = async (termo: string, limite?: number) =>
    procurarConceitoCom(await createClient(), termo, limite);
