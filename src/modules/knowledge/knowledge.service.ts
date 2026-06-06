import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { reindexEntity } from '@/lib/indexing';
import { embedQuery } from '@/lib/embeddings';
import { parseWikilinks, reescreverWikilinks, slugify } from './knowledge.links';
import { diffLines, type DiffLine } from './knowledge.diff';
import {
    EscritaKnowledgeSchema,
    type EscritaKnowledge,
    type NotaCandidata,
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
        .select('id, slug, title, content_md, updated_at, folder_id')
        .order('updated_at', { ascending: false });
    if (error) throw new Error(`listar knowledge: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        contentMd: r.content_md,
        updatedAt: r.updated_at,
        folderId: r.folder_id ?? null,
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

// Move uma nota para uma pasta (folderId null = raiz). Drag-drop do explorer.
export async function moverNotaCom(
    db: SupabaseClient,
    slug: string,
    folderId: string | null,
): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const { error } = await db
        .from('knowledge')
        .update({ folder_id: folderId })
        .eq('owner_id', user.id)
        .eq('slug', slug);
    if (error) throw new Error(`mover nota: ${error.message}`);
}
export const moverNota = async (slug: string, folderId: string | null) =>
    moverNotaCom(await createClient(), slug, folderId);

// Renomeia uma nota: muda título+slug e reescreve os [[links]] nas notas que
// apontam para ela (senão ficariam quebrados). Se o slug não muda, só atualiza o
// título de exibição.
export async function renomearNotaCom(
    db: SupabaseClient,
    slug: string,
    novoTitulo: string,
): Promise<{ novoSlug: string }> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const titulo = novoTitulo.trim();
    if (!titulo) throw new Error('título vazio');
    const novoSlug = slugify(titulo);

    const { data: nota, error } = await db
        .from('knowledge')
        .select('id, frontmatter')
        .eq('owner_id', user.id)
        .eq('slug', slug)
        .maybeSingle();
    if (error) throw new Error(`ler nota: ${error.message}`);
    if (!nota) throw new Error('nota não encontrada');

    const frontmatter = { ...((nota.frontmatter as Record<string, unknown>) ?? {}), title: titulo };

    if (novoSlug === slug) {
        const up = await db
            .from('knowledge')
            .update({ title: titulo, frontmatter })
            .eq('id', nota.id);
        if (up.error) throw new Error(`renomear nota: ${up.error.message}`);
        return { novoSlug };
    }

    // Colisão de slug?
    const col = await db
        .from('knowledge')
        .select('id')
        .eq('owner_id', user.id)
        .eq('slug', novoSlug)
        .maybeSingle();
    if (col.data) throw new Error('já existe uma nota com esse nome');

    // 1) Renomear a própria nota (id estável).
    const up = await db
        .from('knowledge')
        .update({ title: titulo, slug: novoSlug, frontmatter })
        .eq('id', nota.id);
    if (up.error) throw new Error(`renomear nota: ${up.error.message}`);

    // 2) Atualizar slug/title na metadata dos chunks da nota.
    const ch = await db
        .from('chunks')
        .select('id, metadata')
        .eq('owner_id', user.id)
        .eq('metadata->>entity_id', nota.id);
    for (const c of ch.data ?? []) {
        const meta = {
            ...((c.metadata as Record<string, unknown>) ?? {}),
            slug: novoSlug,
            title: titulo,
        };
        await db.from('chunks').update({ metadata: meta }).eq('id', c.id);
    }

    // 3) Reescrever os [[links]] nas notas que apontam para a antiga (re-save
    //    regenera os edges dessas notas a apontar para o novo slug).
    const ed = await db
        .from('edges')
        .select('from_id')
        .eq('owner_id', user.id)
        .eq('from_type', 'knowledge')
        .eq('to_slug', slug);
    const fromIds = [...new Set((ed.data ?? []).map((e) => e.from_id as string))];
    if (fromIds.length) {
        const refs = await db.from('knowledge').select('id, title, content_md').in('id', fromIds);
        for (const ref of refs.data ?? []) {
            const novoConteudo = reescreverWikilinks(ref.content_md, slug, titulo);
            if (novoConteudo !== ref.content_md) {
                await escreverNotaCom(
                    db,
                    {
                        title: ref.title,
                        content_md: novoConteudo,
                        links: [],
                        reason: `rename ${slug}`,
                    },
                    'agent',
                );
            }
        }
    }

    return { novoSlug };
}
export const renomearNota = async (slug: string, novoTitulo: string) =>
    renomearNotaCom(await createClient(), slug, novoTitulo);

// UPDATE-bias: dado o texto de um facto, devolve as notas knowledge existentes
// mais relacionadas (via busca híbrida), para o agente-autor CONTINUAR a certa
// em vez de criar uma nova. Ordenadas por relevância, distintas, top `limite`.
export async function candidatosParaFactoCom(
    db: SupabaseClient,
    texto: string,
    limite = 3,
): Promise<NotaCandidata[]> {
    const emb = await embedQuery(texto);
    const { data, error } = await db.rpc('match_chunks_hybrid', {
        query_embedding: JSON.stringify(emb),
        query_text: texto,
        match_count: 8,
    });
    if (error) throw new Error(`candidatos match_chunks_hybrid: ${error.message}`);

    const ids = (data ?? [])
        .filter((r: { source: string | null }) => r.source === 'knowledge')
        .map((r: { id: string }) => String(r.id));
    if (!ids.length) return [];

    const { data: chunkRows, error: cErr } = await db
        .from('chunks')
        .select('id, metadata')
        .in('id', ids);
    if (cErr) throw new Error(`candidatos metadata: ${cErr.message}`);

    const entityIdPorChunk = new Map<string, string | null>(
        (chunkRows ?? []).map((r) => {
            const meta = (r.metadata ?? {}) as Record<string, unknown>;
            return [String(r.id), typeof meta.entity_id === 'string' ? meta.entity_id : null];
        }),
    );

    // Entity_ids distintos, na ordem de relevância dos chunks.
    const entityIds: string[] = [];
    for (const id of ids) {
        const ent = entityIdPorChunk.get(id);
        if (ent && !entityIds.includes(ent)) entityIds.push(ent);
        if (entityIds.length >= limite) break;
    }
    if (!entityIds.length) return [];

    const { data: notas, error: nErr } = await db
        .from('knowledge')
        .select('id, slug, title, content_md')
        .in('id', entityIds);
    if (nErr) throw new Error(`candidatos knowledge: ${nErr.message}`);

    const porId = new Map((notas ?? []).map((n) => [String(n.id), n]));
    return entityIds
        .map((id) => porId.get(id))
        .filter((n): n is NonNullable<typeof n> => Boolean(n))
        .map((n) => ({ slug: n.slug, title: n.title, contentMd: n.content_md }));
}
export const candidatosParaFacto = async (texto: string, limite = 3) =>
    candidatosParaFactoCom(await createClient(), texto, limite);

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
