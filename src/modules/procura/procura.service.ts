import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Procura "Texto" (full-text) sobre o que está pesquisável — os `chunks` (FTS
// `chunks.fts`, tsvector PT + GIN). Cobre knowledge + daily + chat; agrupa por
// entidade de origem (uma nota pode ter vários chunks a bater). RLS filtra por
// dono. (Modo "Conceito"/semântico é fatia seguinte.) Ref: #91.

export type TipoResultado = 'knowledge' | 'daily' | 'chat';

export interface ResultadoProcura {
    tipo: TipoResultado;
    id: string; // entity_id (knowledge/daily) ou conversation_id (chat)
    titulo: string;
    slug?: string; // knowledge — para o href
    dia?: string; // daily — para o href
    excerto: string; // 1.º chunk que bateu
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

// Chave de agrupamento: a entidade de origem (não o chunk). Chat agrupa por
// conversa. Sem entidade, cai no próprio id do chunk (defensivo).
const chaveEntidade = (c: ChunkHit): string =>
    c.metadata?.entity_id ?? c.metadata?.conversation_id ?? c.id;

// Dedup por entidade preservando a ordem (o 1.º chunk = melhor match do FTS).
// Pura/testável.
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
// o lexema exato ("DDR" ≠ "DDR5"). Sanitiza (tira pontuação que o `to_tsquery`
// lê como operadores) e junta com AND. Pura/testável. (#91 smoke)
export function construirQueryPrefixo(input: string): string {
    return input
        .trim()
        .split(/\s+/)
        .map((termo) => termo.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter(Boolean)
        .map((termo) => `${termo}:*`)
        .join(' & ');
}

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

    const hits = dedupPorEntidade((data ?? []) as ChunkHit[]).slice(0, limite);
    if (!hits.length) return [];

    // Títulos: o metadata nem sempre os tem — busca por id (como o chat).
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

export const procurarTexto = async (termo: string, limite?: number) =>
    procurarTextoCom(await createClient(), termo, limite);
