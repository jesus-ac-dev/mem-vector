import type { SupabaseClient } from '@supabase/supabase-js';

export interface RegenerarEdgesInput {
    ownerId: string;
    fromType: 'knowledge' | 'daily';
    fromId: string;
    alvos: string[]; // slugs já normalizados (parseWikilinks + links explícitos)
}

// Regenera as arestas de uma entidade: apaga as antigas (owner, fromType, fromId)
// e insere uma por alvo. Resolve to_id/to_type em `knowledge` se a nota existir;
// senão fica pendente (to_slug guardado, to_id null). Partilhado por knowledge e daily.
export async function regenerarEdgesCom(
    db: SupabaseClient,
    { ownerId, fromType, fromId, alvos }: RegenerarEdgesInput,
): Promise<void> {
    const { error: dErr } = await db
        .from('edges')
        .delete()
        .eq('owner_id', ownerId)
        .eq('from_type', fromType)
        .eq('from_id', fromId);
    if (dErr) throw new Error(`apagar edges: ${dErr.message}`);

    const unicos = [...new Set(alvos)].filter(Boolean);
    if (!unicos.length) return;

    const { data: existentes } = await db
        .from('knowledge')
        .select('id, slug')
        .eq('owner_id', ownerId)
        .in('slug', unicos);
    const idPorSlug = new Map((existentes ?? []).map((r) => [r.slug, r.id]));

    const { error: iErr } = await db.from('edges').insert(
        unicos.map((to_slug) => ({
            owner_id: ownerId,
            from_type: fromType,
            from_id: fromId,
            to_type: idPorSlug.has(to_slug) ? 'knowledge' : null,
            to_slug,
            to_id: idPorSlug.get(to_slug) ?? null,
            kind: 'wikilink',
        })),
    );
    if (iErr) throw new Error(`inserir edges: ${iErr.message}`);
}
