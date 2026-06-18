import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { reindexEntity } from '@/lib/indexing';
import { projectarIndicesAposEscritaCom } from '@/modules/workspace/index-projector';
import { resolverCor, COR_DEFAULT, COR_DAILY_DEFAULT, COR_CONVERSA_DEFAULT } from '@/lib/cores';
import { embedQuery } from '@/lib/embeddings';
import { reescreverWikilinks, slugify } from './knowledge.links';
import {
    limitarQueryFts,
    normalizarTags,
    propriedadesDoRow,
    tagsDoAgente,
    type PropriedadesNota,
} from './knowledge.props';
import { nomesDosAutoresCom } from './versoes-nomes';
import { montarArestasGrafo } from './knowledge.grafo';
import { diffLines, type DiffLine } from './knowledge.diff';
import {
    AtualizarPropriedadesSchema,
    EscritaKnowledgeSchema,
    type AtualizarPropriedades,
    type EscritaKnowledge,
    type NotaCandidata,
    type NotaKnowledge,
    type Versao,
} from './knowledge.schema';

export interface ResultadoEscrita extends NotaKnowledge {
    diff: DiffLine[] | null;
}

// Patch de frontmatter do summary gerado pelo agente (#22). Vazio quando o
// envelope não traz summary — o merge não toca no que existe.
export function summaryDoAgente(summary?: string): Record<string, string> {
    const s = summary?.trim();
    return s ? { summary: s, summary_author: 'agent' } : {};
}

interface WriteKnowledgeEntryRow {
    id: string;
    slug: string;
    title: string;
    content_md: string;
    updated_at: string;
    criado: boolean;
    previous_content_md: string;
}

interface WriteKnowledgeEntryByIdRow {
    id: string;
    slug: string;
    title: string;
    content_md: string;
    updated_at: string;
    previous_content_md: string;
}

interface RestoreKnowledgeEntryRow {
    id: string;
    slug: string;
    title: string;
    content_md: string;
}

interface RenameKnowledgeEntryRow {
    id: string;
    old_slug: string;
    new_slug: string;
    title: string;
    content_md: string;
    updated_at: string;
    referencing_ids: string[] | null;
}

interface ForwardEdgeRow {
    to_slug: string;
    to_id: string | null;
}

interface BacklinkEdgeRow {
    from_id: string;
    from_type: 'knowledge' | 'daily';
    to_id: string | null;
}

interface FolderPathRow {
    id: string;
    name: string;
    parent_id: string | null;
}

interface KnowledgePathRow {
    title: string;
    folder_id: string | null;
}

function caminhoDasPastas(pastas: FolderPathRow[]): Map<string, string> {
    const porId = new Map(pastas.map((p) => [p.id, p]));
    const memo = new Map<string, string>();

    function path(id: string): string {
        const cached = memo.get(id);
        if (cached) return cached;
        const pasta = porId.get(id);
        if (!pasta) return 'Pasta';
        const prefixo = pasta.parent_id ? `${path(pasta.parent_id)}/` : '';
        const valor = `${prefixo}${pasta.name}`;
        memo.set(id, valor);
        return valor;
    }

    for (const p of pastas) path(p.id);
    return memo;
}

async function caminhoNotaCom(
    db: SupabaseClient,
    ownerId: string,
    nota: KnowledgePathRow,
): Promise<string> {
    if (!nota.folder_id) return nota.title;

    const { data, error } = await db
        .from('folders')
        .select('id, name, parent_id')
        .eq('owner_id', ownerId);
    if (error) throw new Error(`resolver caminho da nota: ${error.message}`);

    const pathPorPasta = caminhoDasPastas((data ?? []) as FolderPathRow[]);
    const pasta = pathPorPasta.get(nota.folder_id);
    return pasta ? `${pasta}/${nota.title}` : nota.title;
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
    // Título + summary do agente quando o envelope o traz: o RPC faz merge com
    // o frontmatter existente, preservando propriedades do utilizador —
    // incluindo o summary quando summary_author = 'user'.
    const frontmatter = {
        title: dados.title,
        ...summaryDoAgente(dados.summary),
        ...tagsDoAgente(dados.tags),
    };

    // Escrita transacional no Postgres: nota viva + file_version no mesmo
    // statement, serializada por (user,slug). A RPC devolve o conteúdo anterior
    // já sob lock, para o diff não depender de uma leitura stale.
    const up = await db
        .rpc('write_knowledge_entry', {
            p_slug: slug,
            p_title: dados.title,
            p_content_md: dados.content_md,
            p_frontmatter: frontmatter,
            p_author: author,
        })
        .single();
    if (up.error || !up.data) throw new Error(`escrever knowledge: ${up.error?.message}`);
    const nota = up.data as WriteKnowledgeEntryRow;

    // Projector retryable: chunks/embeddings/edges ficam num job durável, processado já.
    await projectarIndicesAposEscritaCom(db, {
        entityType: 'knowledge',
        entityId: nota.id,
    });

    return {
        id: nota.id,
        slug: nota.slug,
        title: nota.title,
        contentMd: nota.content_md,
        updatedAt: nota.updated_at,
        diff: nota.criado ? null : diffLines(nota.previous_content_md, dados.content_md),
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

export async function escreverNotaEmPastaCom(
    db: SupabaseClient,
    input: EscritaKnowledge,
    folderId: string,
    author: 'agent' | 'user' = 'user',
): Promise<ResultadoEscrita> {
    const dados = EscritaKnowledgeSchema.parse(input);

    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const slug = slugify(dados.title);
    const frontmatter = {
        title: dados.title,
        ...summaryDoAgente(dados.summary),
        ...tagsDoAgente(dados.tags),
    };

    const up = await db
        .rpc('write_knowledge_entry_in_folder', {
            p_folder_id: folderId,
            p_slug: slug,
            p_title: dados.title,
            p_content_md: dados.content_md,
            p_frontmatter: frontmatter,
            p_author: author,
        })
        .single();
    if (up.error || !up.data) throw new Error(`escrever knowledge em pasta: ${up.error?.message}`);
    const nota = up.data as WriteKnowledgeEntryRow;

    await projectarIndicesAposEscritaCom(db, {
        entityType: 'knowledge',
        entityId: nota.id,
    });

    return {
        id: nota.id,
        slug: nota.slug,
        title: nota.title,
        contentMd: nota.content_md,
        updatedAt: nota.updated_at,
        diff: nota.criado ? null : diffLines(nota.previous_content_md, dados.content_md),
    };
}
export const escreverNotaEmPasta = async (
    input: EscritaKnowledge,
    folderId: string,
    author: 'agent' | 'user' = 'user',
) => escreverNotaEmPastaCom(await createClient(), input, folderId, author);

export async function listarKnowledgeCom(db: SupabaseClient): Promise<NotaKnowledge[]> {
    const { data, error } = await db
        .from('knowledge')
        .select(
            'id, slug, title, content_md, updated_at, folder_id, frontmatter, visibility, created_at',
        )
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
        tags: propriedadesDoRow(r).tags,
    }));
}
export const listarKnowledge = async () => listarKnowledgeCom(await createClient());

// Tags distintas já em uso no workspace (#90), para o agente REUTILIZAR em vez
// de inventar variantes. Reusa a listagem, que já traz as tags por nota.
export async function tagsExistentesCom(db: SupabaseClient): Promise<string[]> {
    const notas = await listarKnowledgeCom(db);
    return normalizarTags(notas.flatMap((n) => n.tags ?? []));
}

// Arquivar: tira a nota da memória ativa. Marca archived=true e apaga os chunks
// (sai do RAG). Versões e edges mantêm-se (auditoria).
export async function arquivarNotaCom(db: SupabaseClient, slug: string): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { error } = await db.rpc('archive_knowledge_entry', { p_slug: slug });
    if (error) throw new Error(`arquivar nota: ${error.message}`);
}
export const arquivarNota = async (slug: string) => arquivarNotaCom(await createClient(), slug);

export async function arquivarNotaPorIdCom(db: SupabaseClient, id: string): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { data: nota, error } = await db
        .from('knowledge')
        .select('slug')
        .eq('owner_id', user.id)
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error(`ler nota por id: ${error.message}`);
    if (!nota) throw new Error('nota não encontrada ou sem permissão de escrita');

    await arquivarNotaCom(db, nota.slug);
}
export const arquivarNotaPorId = async (id: string) =>
    arquivarNotaPorIdCom(await createClient(), id);

// Repor: archived=false e reindexa (re-embeda o conteúdo, volta ao RAG).
export async function reporNotaCom(db: SupabaseClient, slug: string): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const restored = await db.rpc('restore_knowledge_entry', { p_slug: slug }).single();
    if (restored.error || !restored.data) throw new Error(`repor nota: ${restored.error?.message}`);
    const nota = restored.data as RestoreKnowledgeEntryRow;

    try {
        await reindexEntity(db, {
            ownerId: user.id,
            entityType: 'knowledge',
            entityId: nota.id,
            source: 'knowledge',
            contentMd: nota.content_md,
            metadata: { slug: nota.slug, title: nota.title },
        });
    } catch (e) {
        const rollback = await db.rpc('archive_knowledge_entry', { p_slug: nota.slug });
        const causa = e instanceof Error ? e.message : 'erro desconhecido';
        if (rollback.error) {
            throw new Error(
                `repor nota: reindex falhou (${causa}) e rollback falhou: ${rollback.error.message}`,
            );
        }
        throw new Error(`repor nota: reindex falhou; nota voltou aos arquivados: ${causa}`);
    }
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
        .select('id, slug, title, content_md, updated_at, folder_id')
        .eq('slug', slug)
        .is('folder_id', null)
        .maybeSingle();
    if (error) throw new Error(`get nota: ${error.message}`);
    return data
        ? {
              id: data.id,
              slug: data.slug,
              title: data.title,
              contentMd: data.content_md,
              updatedAt: data.updated_at,
              folderId: data.folder_id ?? null,
          }
        : null;
}
export const getNota = async (slug: string) => getNotaCom(await createClient(), slug);

export async function getNotaPorIdCom(
    db: SupabaseClient,
    id: string,
): Promise<NotaKnowledge | null> {
    const { data, error } = await db
        .from('knowledge')
        .select('id, slug, title, content_md, updated_at, folder_id')
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error(`get nota por id: ${error.message}`);
    return data
        ? {
              id: data.id,
              slug: data.slug,
              title: data.title,
              contentMd: data.content_md,
              updatedAt: data.updated_at,
              folderId: data.folder_id ?? null,
          }
        : null;
}
export const getNotaPorId = async (id: string) => getNotaPorIdCom(await createClient(), id);

// Propriedades da nota (tags/summary do frontmatter + visibility + created).
export async function getPropriedadesNotaPorIdCom(
    db: SupabaseClient,
    id: string,
): Promise<PropriedadesNota | null> {
    const { data, error } = await db
        .from('knowledge')
        .select('id, frontmatter, visibility, created_at')
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error(`propriedades da nota: ${error.message}`);
    return data ? propriedadesDoRow(data) : null;
}
export const getPropriedadesNotaPorId = async (id: string) =>
    getPropriedadesNotaPorIdCom(await createClient(), id);

// Espelha o RETURNS TABLE do RPC; propriedadesDoRow só consome um subconjunto.
interface UpdateKnowledgePropertiesRow {
    id: string;
    slug: string;
    title: string;
    frontmatter: unknown;
    visibility: string;
    created_at: string;
    updated_at: string;
}

// Edita propriedades sem tocar no conteúdo: tags/summary fazem merge no
// frontmatter, visibility muda a coluna. Versão registada no RPC.
export async function atualizarPropriedadesNotaCom(
    db: SupabaseClient,
    id: string,
    input: AtualizarPropriedades,
): Promise<PropriedadesNota> {
    const dados = AtualizarPropriedadesSchema.parse(input);

    const patch: Record<string, unknown> = {};
    if (dados.tags !== undefined) patch.tags = normalizarTags(dados.tags);
    if (dados.summary !== undefined) {
        const s = dados.summary.trim();
        patch.summary = s;
        // Resumo escrito à mão é do utilizador (o agente passa a respeitá-lo);
        // limpar o campo devolve-o ao agente (#22).
        patch.summary_author = s ? 'user' : null;
    }

    const up = await db
        .rpc('update_knowledge_properties', {
            p_id: id,
            p_patch: patch,
            p_visibility: dados.visibility ?? null,
        })
        .single();
    if (up.error || !up.data) throw new Error(`atualizar propriedades: ${up.error?.message}`);
    return propriedadesDoRow(up.data as UpdateKnowledgePropertiesRow);
}
export const atualizarPropriedadesNota = async (id: string, input: AtualizarPropriedades) =>
    atualizarPropriedadesNotaCom(await createClient(), id, input);

export async function atualizarNotaPorIdCom(
    db: SupabaseClient,
    id: string,
    contentMd: string,
    author: 'agent' | 'user' = 'user',
    frontmatterPatch?: Record<string, unknown>,
): Promise<ResultadoEscrita> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const contentNormalizado = contentMd.trim();
    if (!contentNormalizado) throw new Error('knowledge vazio');

    const up = await db
        .rpc('write_knowledge_entry_by_id', {
            p_id: id,
            p_content_md: contentNormalizado,
            p_author: author,
            p_frontmatter_patch: frontmatterPatch ?? null,
        })
        .single();
    if (up.error || !up.data) throw new Error(`atualizar nota por id: ${up.error?.message}`);
    const nota = up.data as WriteKnowledgeEntryByIdRow;

    await projectarIndicesAposEscritaCom(db, {
        entityType: 'knowledge',
        entityId: nota.id,
    });

    return {
        id: nota.id,
        slug: nota.slug,
        title: nota.title,
        contentMd: nota.content_md,
        updatedAt: nota.updated_at,
        diff: diffLines(nota.previous_content_md, contentNormalizado),
    };
}
export const atualizarNotaPorId = async (
    id: string,
    contentMd: string,
    author: 'agent' | 'user' = 'user',
) => atualizarNotaPorIdCom(await createClient(), id, contentMd, author);

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

export async function moverNotaPorIdCom(
    db: SupabaseClient,
    id: string,
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
        .eq('id', id);
    if (error) throw new Error(`mover nota por id: ${error.message}`);
}
export const moverNotaPorId = async (id: string, folderId: string | null) =>
    moverNotaPorIdCom(await createClient(), id, folderId);

async function reapontarBacklinksRenameCom(
    db: SupabaseClient,
    ownerId: string,
    oldSlug: string,
    novoTitulo: string,
    referencingIds: string[] | null | undefined,
    oldTargetPath?: string | null,
): Promise<void> {
    const ids = [...new Set((referencingIds ?? []).map(String).filter(Boolean))];
    // Arquivadas ficam de fora (#28): a escrita recusa-as e os links delas são
    // dormentes — o restore resolve edges pendentes por slug.
    let query = db
        .from('knowledge')
        .select('id, title, content_md')
        .eq('owner_id', ownerId)
        .eq('archived', false);

    if (ids.length) query = query.in('id', ids);

    const { data: refs, error } = await query;
    if (error) throw new Error(`ler backlinks para rename: ${error.message}`);

    for (const ref of refs ?? []) {
        const novoConteudo = reescreverWikilinks(ref.content_md, oldSlug, novoTitulo, {
            oldTargetPath,
        });
        if (novoConteudo === ref.content_md) continue;

        await atualizarNotaPorIdCom(db, ref.id, novoConteudo, 'user');
    }
}

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

    const renamed = await db
        .rpc('rename_knowledge_entry', {
            p_slug: slug,
            p_new_slug: novoSlug,
            p_new_title: titulo,
            p_author: 'user',
        })
        .single();

    let referencingIds: string[] | null = null;
    if (renamed.error || !renamed.data) {
        if (novoSlug !== slug && renamed.error?.message.includes('nota não encontrada')) {
            const retry = await db
                .from('knowledge')
                .select('id')
                .eq('owner_id', user.id)
                .eq('slug', novoSlug)
                .maybeSingle();
            if (retry.error) throw new Error(`renomear nota: ${retry.error.message}`);
            if (!retry.data) throw new Error(`renomear nota: ${renamed.error?.message}`);
            // Idempotência: a nota já foi renomeada numa tentativa anterior; falta
            // apenas reapontar conteúdo que ainda contenha o slug antigo.
            referencingIds = null;
        } else {
            throw new Error(`renomear nota: ${renamed.error?.message}`);
        }
    } else {
        const row = renamed.data as RenameKnowledgeEntryRow;
        referencingIds = row.referencing_ids;
    }

    await reapontarBacklinksRenameCom(db, user.id, slug, titulo, referencingIds);

    return { novoSlug };
}
export const renomearNota = async (slug: string, novoTitulo: string) =>
    renomearNotaCom(await createClient(), slug, novoTitulo);

export async function renomearNotaPorIdCom(
    db: SupabaseClient,
    id: string,
    novoTitulo: string,
    slugAnteriorParaBacklinks?: string,
): Promise<{ novoSlug: string }> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const titulo = novoTitulo.trim();
    if (!titulo) throw new Error('título vazio');
    const novoSlug = slugify(titulo);

    const { data: notaAntes, error: notaAntesErr } = await db
        .from('knowledge')
        .select('title, folder_id')
        .eq('owner_id', user.id)
        .eq('id', id)
        .maybeSingle();
    if (notaAntesErr) throw new Error(`ler nota antes de rename: ${notaAntesErr.message}`);
    if (!notaAntes) throw new Error('nota não encontrada ou sem permissão de escrita');
    const oldTargetPath = await caminhoNotaCom(db, user.id, notaAntes as KnowledgePathRow);

    const renamed = await db
        .rpc('rename_knowledge_entry_by_id', {
            p_id: id,
            p_new_slug: novoSlug,
            p_new_title: titulo,
            p_author: 'user',
        })
        .single();
    if (renamed.error || !renamed.data)
        throw new Error(`renomear nota por id: ${renamed.error?.message}`);

    const row = renamed.data as RenameKnowledgeEntryRow;
    await reapontarBacklinksRenameCom(
        db,
        user.id,
        slugAnteriorParaBacklinks ?? row.old_slug,
        titulo,
        row.referencing_ids,
        oldTargetPath,
    );

    return { novoSlug };
}
export const renomearNotaPorId = async (
    id: string,
    novoTitulo: string,
    slugAnteriorParaBacklinks?: string,
) => renomearNotaPorIdCom(await createClient(), id, novoTitulo, slugAnteriorParaBacklinks);

// Rede de candidatos do agente-autor (#67): pool propositadamente mais largo que
// o retrieval do chat — apanha mais notas para o UPDATE-bias escolher onde
// CONTINUAR; é interno (não setting do utilizador, propósito diferente).
const CANDIDATOS_DESTILACAO = 8;

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
        // FTS estoura com texto muito longo (resposta web); o vetor já leva o todo.
        query_text: limitarQueryFts(texto),
        match_count: CANDIDATOS_DESTILACAO,
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
        .select('id, slug, title, content_md, frontmatter, visibility, created_at')
        .in('id', entityIds);
    if (nErr) throw new Error(`candidatos knowledge: ${nErr.message}`);

    const porId = new Map((notas ?? []).map((n) => [String(n.id), n]));
    return entityIds
        .map((id) => porId.get(id))
        .filter((n): n is NonNullable<typeof n> => Boolean(n))
        .map((n) => ({
            id: String(n.id),
            slug: n.slug,
            title: n.title,
            contentMd: n.content_md,
            // tags atuais (#90): vão ao agente como contexto e à união aditiva
            // ao CONTINUAR, para as tags do utilizador não se perderem.
            tags: propriedadesDoRow({
                id: String(n.id),
                frontmatter: n.frontmatter,
                visibility: n.visibility,
                created_at: n.created_at,
            }).tags,
        }));
}
export const candidatosParaFacto = async (texto: string, limite = 3) =>
    candidatosParaFactoCom(await createClient(), texto, limite);

export interface LinkNota {
    id?: string;
    slug: string;
    title: string;
    tipo?: 'knowledge' | 'daily'; // origem do backlink (ausente = knowledge)
}
export interface ForwardLink extends LinkNota {
    existe: boolean; // o alvo do wikilink existe como nota ativa (senão é link quebrado)
    ambiguo?: boolean; // existe mais do que um alvo visível com o mesmo slug
    arquivada?: boolean; // o alvo existe mas está no arquivo (fora do workspace)
}

// Backlinks: notas knowledge que apontam para `slug`. Quando há `noteId`, edges
// já resolvidas por path só contam se apontarem para essa nota exacta.
export async function backlinksDeCom(
    db: SupabaseClient,
    slug: string,
    noteId?: string,
): Promise<LinkNota[]> {
    // Cross-type: as dailies também fazem wikilinks (ex.: a destilação liga
    // [[carlos-e-sofia]]) — um backlink pode vir de knowledge OU de uma daily.
    const { data: ed, error } = await db
        .from('edges')
        .select('from_id, from_type, to_id')
        .in('from_type', ['knowledge', 'daily'])
        .eq('to_slug', slug);
    if (error) throw new Error(`backlinks edges: ${error.message}`);

    const edges = (ed ?? []) as BacklinkEdgeRow[];
    const relevantes = edges.filter((e) => !noteId || !e.to_id || e.to_id === noteId);
    const idsNotas = [
        ...new Set(relevantes.filter((e) => e.from_type === 'knowledge').map((e) => e.from_id)),
    ];
    const idsDailies = [
        ...new Set(relevantes.filter((e) => e.from_type === 'daily').map((e) => e.from_id)),
    ];
    if (!idsNotas.length && !idsDailies.length) return [];

    const [notasRes, dailiesRes] = await Promise.all([
        idsNotas.length
            ? db.from('knowledge').select('id, slug, title').in('id', idsNotas)
            : Promise.resolve({ data: [], error: null }),
        idsDailies.length
            ? db.from('dailies').select('id, dia').in('id', idsDailies)
            : Promise.resolve({ data: [], error: null }),
    ]);
    if (notasRes.error) throw new Error(`backlinks knowledge: ${notasRes.error.message}`);
    if (dailiesRes.error) throw new Error(`backlinks dailies: ${dailiesRes.error.message}`);

    return [
        ...(notasRes.data ?? []).map((n) => ({
            id: String(n.id),
            slug: n.slug as string,
            title: n.title as string,
            tipo: 'knowledge' as const,
        })),
        ...(dailiesRes.data ?? []).map((d) => ({
            id: String(d.id),
            slug: String(d.dia),
            title: String(d.dia),
            tipo: 'daily' as const,
        })),
    ].sort((a, b) => a.title.localeCompare(b.title, 'pt'));
}
export const backlinksDe = async (slug: string, noteId?: string) =>
    backlinksDeCom(await createClient(), slug, noteId);

// Forward links: wikilinks que esta entidade faz (edges com from_id = noteId), com
// flag `existe` (a nota-alvo existe ou é um link quebrado). As dailies também
// escrevem edges — o sidebar delas usa fromType='daily'.
export async function forwardLinksDeCom(
    db: SupabaseClient,
    noteId: string,
    fromType: 'knowledge' | 'daily' = 'knowledge',
): Promise<ForwardLink[]> {
    const { data: ed, error } = await db
        .from('edges')
        .select('to_slug, to_id')
        .eq('from_type', fromType)
        .eq('from_id', noteId);
    if (error) throw new Error(`forward edges: ${error.message}`);

    const edges = (ed ?? []) as ForwardEdgeRow[];
    const slugs = [...new Set(edges.map((e) => e.to_slug))];
    if (!slugs.length) return [];

    const { data, error: nErr } = await db
        .from('knowledge')
        .select('id, slug, title, archived')
        .in('slug', slugs);
    if (nErr) throw new Error(`forward knowledge: ${nErr.message}`);

    const notasPorSlug = new Map<string, Array<NonNullable<typeof data>[number]>>();
    for (const n of data ?? []) {
        const grupo = notasPorSlug.get(n.slug);
        if (grupo) grupo.push(n);
        else notasPorSlug.set(n.slug, [n]);
    }
    const notasPorId = new Map((data ?? []).map((n) => [String(n.id), n]));

    const links = new Map<string, ForwardLink>();
    for (const edge of edges) {
        const key = edge.to_id ? `id:${edge.to_id}` : `slug:${edge.to_slug}`;
        if (links.has(key)) continue;

        if (edge.to_id) {
            const nota = notasPorId.get(edge.to_id);
            links.set(key, {
                id: nota?.id ?? edge.to_id,
                slug: nota?.slug ?? edge.to_slug,
                title: nota?.title ?? edge.to_slug,
                existe: Boolean(nota && !nota.archived),
                ambiguo: false,
                arquivada: Boolean(nota?.archived),
            });
            continue;
        }

        const slug = edge.to_slug;
        if (!links.has(`slug:${slug}`)) {
            const matches = notasPorSlug.get(slug) ?? [];
            const ativos = matches.filter((m) => !m.archived);
            const unico = ativos.length === 1 ? ativos[0] : null;
            links.set(`slug:${slug}`, {
                id: unico?.id,
                slug,
                title: unico?.title ?? slug,
                existe: ativos.length > 0,
                ambiguo: ativos.length > 1,
                arquivada: ativos.length === 0 && matches.length > 0,
            });
        }
    }

    return [...links.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt'));
}
export const forwardLinksDe = async (
    noteId: string,
    fromType: 'knowledge' | 'daily' = 'knowledge',
) => forwardLinksDeCom(await createClient(), noteId, fromType);

export interface GrafoNode {
    id: string;
    slug: string;
    title: string;
    group: string; // 'knowledge' | 'daily' | 'fantasma'
    color: string; // hex resolvido (cor da pasta / cor daily / default)
    size: number; // nº de caracteres do content_md (dimensiona a bola no grafo)
    createdAt?: string; // ISO; fantasmas não têm (nascem com a 1ª origem no timelapse)
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
// grupo daily); arestas = wikilinks. Alvos fora do grafo (link por criar, nota
// arquivada) entram como nós fantasma à Obsidian (ver montarArestasGrafo).
export async function grafoDadosCom(db: SupabaseClient): Promise<GrafoDados> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) return { nodes: [], links: [] };

    // Cor por pasta (id → hex) + nome/pai para localizar a subárvore do Kernel.
    const { data: pastas } = await db
        .from('folders')
        .select('id, color, name, parent_id')
        .eq('owner_id', user.id);
    const corPorPasta = new Map<string, string | null>(
        (pastas ?? []).map((p) => [String(p.id), (p.color as string | null) ?? null]),
    );

    // Kernel fora do grafo (#44, decisão do Carlos): é infraestrutura do agente,
    // não conhecimento ligável — deixaria nós soltos numa rede que deve acabar
    // toda ligada. Exclui a pasta root "Kernel" e descendentes.
    const kernelFolderIds = new Set<string>();
    const raizKernel = (pastas ?? []).find(
        (p) => !p.parent_id && String(p.name).toLowerCase() === 'kernel',
    );
    if (raizKernel) {
        kernelFolderIds.add(String(raizKernel.id));
        let cresceu = true;
        while (cresceu) {
            cresceu = false;
            for (const p of pastas ?? []) {
                if (
                    p.parent_id &&
                    kernelFolderIds.has(String(p.parent_id)) &&
                    !kernelFolderIds.has(String(p.id))
                ) {
                    kernelFolderIds.add(String(p.id));
                    cresceu = true;
                }
            }
        }
    }

    // Nós knowledge (não arquivadas, fora do Kernel), cor = cor da pasta.
    // content_md vem só para medir o tamanho (PostgREST não expõe char_length).
    const { data: notas, error } = await db
        .from('knowledge')
        .select('id, slug, title, folder_id, content_md, created_at')
        .eq('owner_id', user.id)
        .eq('archived', false);
    if (error) throw new Error(`grafo knowledge: ${error.message}`);
    const notasKernel = (notas ?? []).filter(
        (n) => n.folder_id && kernelFolderIds.has(String(n.folder_id)),
    );
    const kernelNotaIds = new Set(notasKernel.map((n) => String(n.id)));
    const kernelSlugs = new Set(notasKernel.map((n) => String(n.slug)));
    const nodesK: GrafoNode[] = (notas ?? [])
        .filter((n) => !kernelNotaIds.has(String(n.id)))
        .map((n) => ({
            id: String(n.id),
            slug: n.slug,
            title: n.title,
            group: 'knowledge',
            color: resolverCor(
                n.folder_id ? corPorPasta.get(String(n.folder_id)) : null,
                COR_DEFAULT,
            ),
            size: (n.content_md ?? '').length,
            createdAt: String(n.created_at),
        }));

    // Cor do grupo daily (profile do utilizador).
    const prof = await db.from('profiles').select('daily_color').eq('id', user.id).maybeSingle();
    const corDaily = resolverCor(prof.data?.daily_color ?? null, COR_DAILY_DEFAULT);

    // Nós daily.
    const { data: dailies } = await db
        .from('dailies')
        .select('id, dia, content_md, created_at')
        .eq('owner_id', user.id);
    const nodesD: GrafoNode[] = (dailies ?? []).map((d) => ({
        id: String(d.id),
        slug: d.dia,
        title: d.dia,
        group: 'daily',
        color: corDaily,
        size: (d.content_md ?? '').length,
        createdAt: String(d.created_at),
    }));

    // Arestas: knowledge + daily (inclui a edge estrutural daily→conversa).
    // Pendentes/arquivadas viram fantasmas.
    const { data: ed, error: eErr } = await db
        .from('edges')
        .select('from_id, to_id, to_slug, kind')
        .in('from_type', ['knowledge', 'daily']);
    if (eErr) throw new Error(`grafo edges: ${eErr.message}`);

    // Conversas na teia: nós das conversas-fonte ligadas por edges estruturais
    // (kind='conversa'). Sem elas em idsValidos, o link viraria fantasma; com
    // elas, a conversa é um nó real e clicável (abre a conversa no chat).
    const conversaIds = [
        ...new Set(
            (ed ?? []).filter((e) => e.kind === 'conversa' && e.to_id).map((e) => String(e.to_id)),
        ),
    ];
    let nodesC: GrafoNode[] = [];
    if (conversaIds.length) {
        const { data: convs } = await db
            .from('conversations')
            .select('id, title, created_at')
            .in('id', conversaIds);
        nodesC = (convs ?? []).map((c) => ({
            id: String(c.id),
            slug: String(c.id),
            title: (c.title as string | null) ?? 'Conversa',
            group: 'conversa',
            color: COR_CONVERSA_DEFAULT,
            size: 200,
            createdAt: String(c.created_at),
        }));
    }

    const nodes = [...nodesK, ...nodesD, ...nodesC];
    const idsValidos = new Set(nodes.map((n) => n.id));

    // Arestas que tocam no Kernel saem com ele (um alvo no Kernel viraria
    // fantasma e o Kernel voltava ao grafo pela porta de trás).
    const { links, fantasmas } = montarArestasGrafo(
        (ed ?? [])
            .filter(
                (e) =>
                    !kernelNotaIds.has(String(e.from_id)) &&
                    !(e.to_id && kernelNotaIds.has(String(e.to_id))) &&
                    !(e.to_slug && kernelSlugs.has(String(e.to_slug))),
            )
            .map((e) => ({
                fromId: String(e.from_id),
                toId: e.to_id ? String(e.to_id) : null,
                toSlug: e.to_slug ?? null,
            })),
        idsValidos,
        new Map(nodes.map((n) => [n.slug, n.id])),
    );

    return { nodes: [...nodes, ...fantasmas], links };
}
export const grafoDados = async () => grafoDadosCom(await createClient());

export async function listarVersoesCom(db: SupabaseClient, entityId: string): Promise<Versao[]> {
    const { data, error } = await db
        .from('file_versions')
        .select('id, content_md, author, author_id, created_at')
        .eq('entity_type', 'knowledge')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });
    if (error) throw new Error(`listar versões: ${error.message}`);
    const nomes = await nomesDosAutoresCom(
        db,
        (data ?? []).map((r) => r.author_id),
    );
    return (data ?? []).map((r) => ({
        id: r.id,
        contentMd: r.content_md,
        author: r.author,
        autorNome: (r.author_id && nomes.get(String(r.author_id))) || null,
        createdAt: r.created_at,
    }));
}
export const listarVersoes = async (entityId: string) =>
    listarVersoesCom(await createClient(), entityId);
