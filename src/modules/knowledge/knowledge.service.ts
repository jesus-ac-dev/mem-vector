import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { reindexEntity } from '@/lib/indexing';
import { parseWikilinks, slugify } from './knowledge.links';
import { diffLines, type DiffLine } from './knowledge.diff';
import {
    EscritaKnowledgeSchema,
    type EscritaKnowledge,
    type NotaKnowledge,
    type Versao,
} from './knowledge.schema';

export interface ResultadoEscrita extends NotaKnowledge {
    diff: DiffLine[] | null;
}

export async function escreverNotaCom(
    db: SupabaseClient,
    input: EscritaKnowledge,
    author: 'agent' | 'user' = 'agent',
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
        author,
    });
    if (vErr) throw new Error(`inserir versão: ${vErr.message}`);

    // Regenerar chunks por heading, de forma incremental (só re-embeda o que mudou).
    await reindexEntity(db, {
        ownerId: user.id,
        entityType: 'knowledge',
        entityId: nota.id,
        source: 'knowledge',
        contentMd: dados.content_md,
        metadata: { slug: nota.slug, title: nota.title },
    });

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
export async function escreverNota(
    input: EscritaKnowledge,
    author: 'agent' | 'user' = 'agent',
): Promise<ResultadoEscrita> {
    const db = await createClient();
    return escreverNotaCom(db, input, author);
}

export async function listarKnowledgeCom(db: SupabaseClient): Promise<NotaKnowledge[]> {
    const { data, error } = await db
        .from('knowledge')
        .select('id, slug, title, content_md, updated_at')
        .order('updated_at', { ascending: false });
    if (error) throw new Error(`listar knowledge: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        contentMd: r.content_md,
        updatedAt: r.updated_at,
    }));
}
export const listarKnowledge = async () => listarKnowledgeCom(await createClient());

export async function getNotaCom(db: SupabaseClient, slug: string): Promise<NotaKnowledge | null> {
    const { data, error } = await db
        .from('knowledge')
        .select('id, slug, title, content_md, updated_at')
        .eq('slug', slug)
        .maybeSingle();
    if (error) throw new Error(`get nota: ${error.message}`);
    return data
        ? {
              id: data.id,
              slug: data.slug,
              title: data.title,
              contentMd: data.content_md,
              updatedAt: data.updated_at,
          }
        : null;
}
export const getNota = async (slug: string) => getNotaCom(await createClient(), slug);

export async function listarVersoesCom(db: SupabaseClient, entityId: string): Promise<Versao[]> {
    const { data, error } = await db
        .from('file_versions')
        .select('id, content_md, author, created_at')
        .eq('entity_type', 'knowledge')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });
    if (error) throw new Error(`listar versões: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: r.id,
        contentMd: r.content_md,
        author: r.author,
        createdAt: r.created_at,
    }));
}
export const listarVersoes = async (entityId: string) =>
    listarVersoesCom(await createClient(), entityId);
