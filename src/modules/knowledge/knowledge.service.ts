import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { embedPassage } from '@/lib/embeddings';
import { parseWikilinks, slugify } from './knowledge.links';
import { diffLines, type DiffLine } from './knowledge.diff';
import {
    EscritaKnowledgeSchema,
    type EscritaKnowledge,
    type NotaKnowledge,
} from './knowledge.schema';

export interface ResultadoEscrita extends NotaKnowledge {
    diff: DiffLine[] | null;
}

export async function escreverNotaCom(
    db: SupabaseClient,
    input: EscritaKnowledge,
): Promise<ResultadoEscrita> {
    const dados = EscritaKnowledgeSchema.parse(input);

    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const slug = slugify(dados.title);

    // Ler nota existente (para diff e para passar o id no upsert).
    const existente = await db
        .from('knowledge')
        .select('id, content_md')
        .eq('owner_id', user.id)
        .eq('slug', slug)
        .maybeSingle();
    if (existente.error) throw new Error(`ler knowledge: ${existente.error.message}`);

    const before = existente.data?.content_md ?? '';
    const frontmatter = { title: dados.title, tags: [] as string[] };

    // Upsert pela constraint unique(owner_id, slug).
    const up = await db
        .from('knowledge')
        .upsert(
            {
                ...(existente.data ? { id: existente.data.id } : {}),
                owner_id: user.id,
                slug,
                title: dados.title,
                frontmatter,
                content_md: dados.content_md,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'owner_id,slug' },
        )
        .select('id, slug, title, content_md, updated_at')
        .single();
    if (up.error || !up.data) throw new Error(`upsert knowledge: ${up.error?.message}`);
    const nota = up.data;

    // Versão imutável do conteúdo desta escrita.
    const { error: vErr } = await db.from('file_versions').insert({
        owner_id: user.id,
        entity_type: 'knowledge',
        entity_id: nota.id,
        content_md: dados.content_md,
        frontmatter,
        author: 'agent',
    });
    if (vErr) throw new Error(`inserir versão: ${vErr.message}`);

    // Regenerar chunks: apagar os antigos, inserir um novo com o embedding actual.
    // Nota: filtramos por metadata->>'entity_id' (operador ->> devolve texto).
    const { error: dChErr } = await db
        .from('chunks')
        .delete()
        .eq('owner_id', user.id)
        .eq('metadata->>entity_id', nota.id);
    if (dChErr) throw new Error(`apagar chunks: ${dChErr.message}`);

    const embedding = await embedPassage(dados.content_md);
    const { error: iChErr } = await db.from('chunks').insert({
        content: dados.content_md,
        embedding: JSON.stringify(embedding),
        source: 'knowledge',
        owner_id: user.id,
        metadata: { entity_type: 'knowledge', entity_id: nota.id },
    });
    if (iChErr) throw new Error(`inserir chunk: ${iChErr.message}`);

    // Regenerar edges (wikilinks): apagar e reinserir.
    const { error: dEdErr } = await db
        .from('edges')
        .delete()
        .eq('owner_id', user.id)
        .eq('from_type', 'knowledge')
        .eq('from_id', nota.id);
    if (dEdErr) throw new Error(`apagar edges: ${dEdErr.message}`);

    const alvos = [...new Set([...parseWikilinks(dados.content_md), ...dados.links.map(slugify)])];
    if (alvos.length) {
        const alvosExistentes = await db
            .from('knowledge')
            .select('id, slug')
            .eq('owner_id', user.id)
            .in('slug', alvos);
        const idPorSlug = new Map((alvosExistentes.data ?? []).map((r) => [r.slug, r.id]));

        const { error: iEdErr } = await db.from('edges').insert(
            alvos.map((to_slug) => ({
                owner_id: user.id,
                from_type: 'knowledge',
                from_id: nota.id,
                to_type: idPorSlug.has(to_slug) ? 'knowledge' : null,
                to_slug,
                to_id: idPorSlug.get(to_slug) ?? null,
                kind: 'wikilink',
            })),
        );
        if (iEdErr) throw new Error(`inserir edges: ${iEdErr.message}`);
    }

    return {
        id: nota.id,
        slug: nota.slug,
        title: nota.title,
        contentMd: nota.content_md,
        updatedAt: nota.updated_at,
        diff: existente.data ? diffLines(before, dados.content_md) : null,
    };
}

// Variante para uso em Server Actions / Route Handlers (lê a sessão dos cookies).
export async function escreverNota(input: EscritaKnowledge): Promise<ResultadoEscrita> {
    const db = await createClient();
    return escreverNotaCom(db, input);
}
