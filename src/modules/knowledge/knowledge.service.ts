import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { reindexEntity } from '@/lib/indexing';
import { regenerarEdgesCom } from './edges';
import { resolverCor, COR_DEFAULT, COR_DAILY_DEFAULT } from '@/lib/cores';
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

    // Regenerar edges (wikilinks) — helper partilhado com o daily.
    await regenerarEdgesCom(db, {
        ownerId: user.id,
        fromType: 'knowledge',
        fromId: nota.id,
        alvos: [...new Set([...parseWikilinks(dados.content_md), ...dados.links.map(slugify)])],
    });

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
        .eq('archived', false)
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

// Arquivar: tira a nota da memória ativa. Marca archived=true e apaga os chunks
// (sai do RAG). Versões e edges mantêm-se (auditoria).
export async function arquivarNotaCom(db: SupabaseClient, slug: string): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { data: nota, error } = await db
        .from('knowledge')
        .select('id')
        .eq('owner_id', user.id)
        .eq('slug', slug)
        .maybeSingle();
    if (error) throw new Error(`ler nota: ${error.message}`);
    if (!nota) throw new Error('nota não encontrada');

    const up = await db.from('knowledge').update({ archived: true }).eq('id', nota.id);
    if (up.error) throw new Error(`arquivar nota: ${up.error.message}`);

    const del = await db
        .from('chunks')
        .delete()
        .eq('owner_id', user.id)
        .eq('metadata->>entity_type', 'knowledge')
        .eq('metadata->>entity_id', nota.id);
    if (del.error) throw new Error(`apagar chunks: ${del.error.message}`);
}
export const arquivarNota = async (slug: string) => arquivarNotaCom(await createClient(), slug);

// Repor: archived=false e reindexa (re-embeda o conteúdo, volta ao RAG).
export async function reporNotaCom(db: SupabaseClient, slug: string): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { data: nota, error } = await db
        .from('knowledge')
        .select('id, slug, title, content_md')
        .eq('owner_id', user.id)
        .eq('slug', slug)
        .maybeSingle();
    if (error) throw new Error(`ler nota: ${error.message}`);
    if (!nota) throw new Error('nota não encontrada');

    const up = await db.from('knowledge').update({ archived: false }).eq('id', nota.id);
    if (up.error) throw new Error(`repor nota: ${up.error.message}`);

    await reindexEntity(db, {
        ownerId: user.id,
        entityType: 'knowledge',
        entityId: nota.id,
        source: 'knowledge',
        contentMd: nota.content_md,
        metadata: { slug: nota.slug, title: nota.title },
    });
}
export const reporNota = async (slug: string) => reporNotaCom(await createClient(), slug);

// Notas arquivadas do utilizador (para a vista de arquivados do explorer).
export async function listarArquivadosCom(db: SupabaseClient): Promise<NotaKnowledge[]> {
    const { data, error } = await db
        .from('knowledge')
        .select('id, slug, title, content_md, updated_at, folder_id')
        .eq('archived', true)
        .order('updated_at', { ascending: false });
    if (error) throw new Error(`listar arquivados: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        contentMd: r.content_md,
        updatedAt: r.updated_at,
        folderId: r.folder_id ?? null,
    }));
}
export const listarArquivados = async () => listarArquivadosCom(await createClient());

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

export interface LinkNota {
    slug: string;
    title: string;
}
export interface ForwardLink extends LinkNota {
    existe: boolean; // o alvo do wikilink existe como nota (senão é link quebrado)
}

// Backlinks: notas knowledge que apontam para `slug` (edges com to_slug = slug).
export async function backlinksDeCom(db: SupabaseClient, slug: string): Promise<LinkNota[]> {
    const { data: ed, error } = await db
        .from('edges')
        .select('from_id')
        .eq('from_type', 'knowledge')
        .eq('to_slug', slug);
    if (error) throw new Error(`backlinks edges: ${error.message}`);

    const ids = [...new Set((ed ?? []).map((e) => e.from_id as string))];
    if (!ids.length) return [];

    const { data, error: nErr } = await db
        .from('knowledge')
        .select('slug, title')
        .in('id', ids)
        .order('title');
    if (nErr) throw new Error(`backlinks knowledge: ${nErr.message}`);
    return (data ?? []).map((n) => ({ slug: n.slug, title: n.title }));
}
export const backlinksDe = async (slug: string) => backlinksDeCom(await createClient(), slug);

// Forward links: wikilinks que esta nota faz (edges com from_id = noteId), com
// flag `existe` (a nota-alvo existe ou é um link quebrado).
export async function forwardLinksDeCom(
    db: SupabaseClient,
    noteId: string,
): Promise<ForwardLink[]> {
    const { data: ed, error } = await db
        .from('edges')
        .select('to_slug')
        .eq('from_type', 'knowledge')
        .eq('from_id', noteId);
    if (error) throw new Error(`forward edges: ${error.message}`);

    const slugs = [...new Set((ed ?? []).map((e) => e.to_slug as string))];
    if (!slugs.length) return [];

    const { data, error: nErr } = await db
        .from('knowledge')
        .select('slug, title')
        .in('slug', slugs);
    if (nErr) throw new Error(`forward knowledge: ${nErr.message}`);

    const titlePorSlug = new Map((data ?? []).map((n) => [n.slug, n.title]));
    return slugs
        .map((slug) => ({
            slug,
            title: titlePorSlug.get(slug) ?? slug,
            existe: titlePorSlug.has(slug),
        }))
        .sort((a, b) => a.title.localeCompare(b.title, 'pt'));
}
export const forwardLinksDe = async (noteId: string) =>
    forwardLinksDeCom(await createClient(), noteId);

export interface GrafoNode {
    id: string;
    slug: string;
    title: string;
    group: string; // 'knowledge' | 'daily'
    color: string; // hex resolvido (cor da pasta / cor daily / default)
}
export interface GrafoLink {
    source: string;
    target: string;
}
export interface GrafoDados {
    nodes: GrafoNode[];
    links: GrafoLink[];
}

// Grafo do conhecimento: nós = notas knowledge (cor da pasta) + dailies (cor do
// grupo daily); arestas = wikilinks (edges com to_id resolvido). Arquivadas e
// links pendentes (to_id null / extremo desconhecido) ficam de fora.
export async function grafoDadosCom(db: SupabaseClient): Promise<GrafoDados> {
    const {
        data: { user },
    } = await db.auth.getUser();

    // Cor por pasta (id → hex).
    const { data: pastas } = await db.from('folders').select('id, color');
    const corPorPasta = new Map<string, string | null>(
        (pastas ?? []).map((p) => [String(p.id), (p.color as string | null) ?? null]),
    );

    // Nós knowledge (não arquivadas), cor = cor da pasta (ou default).
    const { data: notas, error } = await db
        .from('knowledge')
        .select('id, slug, title, folder_id')
        .eq('archived', false);
    if (error) throw new Error(`grafo knowledge: ${error.message}`);
    const nodesK: GrafoNode[] = (notas ?? []).map((n) => ({
        id: String(n.id),
        slug: n.slug,
        title: n.title,
        group: 'knowledge',
        color: resolverCor(n.folder_id ? corPorPasta.get(String(n.folder_id)) : null, COR_DEFAULT),
    }));

    // Cor do grupo daily (profile do utilizador).
    let corDailyHex: string | null = null;
    if (user) {
        const prof = await db
            .from('profiles')
            .select('daily_color')
            .eq('id', user.id)
            .maybeSingle();
        corDailyHex = prof.data?.daily_color ?? null;
    }
    const corDaily = resolverCor(corDailyHex, COR_DAILY_DEFAULT);

    // Nós daily.
    const { data: dailies } = await db.from('dailies').select('id, dia');
    const nodesD: GrafoNode[] = (dailies ?? []).map((d) => ({
        id: String(d.id),
        slug: d.dia,
        title: d.dia,
        group: 'daily',
        color: corDaily,
    }));

    const nodes = [...nodesK, ...nodesD];
    const idsValidos = new Set(nodes.map((n) => n.id));

    // Arestas: knowledge + daily, ambos os extremos têm de ser nós conhecidos.
    const { data: ed, error: eErr } = await db
        .from('edges')
        .select('from_id, to_id')
        .in('from_type', ['knowledge', 'daily'])
        .not('to_id', 'is', null);
    if (eErr) throw new Error(`grafo edges: ${eErr.message}`);
    const links: GrafoLink[] = (ed ?? [])
        .map((e) => ({ source: String(e.from_id), target: String(e.to_id) }))
        .filter((l) => idsValidos.has(l.source) && idsValidos.has(l.target));

    return { nodes, links };
}
export const grafoDados = async () => grafoDadosCom(await createClient());

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
