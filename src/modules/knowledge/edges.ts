import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify, type WikilinkTarget } from './knowledge.links';

type EdgeTargetInput = string | WikilinkTarget;

export interface RegenerarEdgesInput {
    ownerId: string;
    fromType: 'knowledge' | 'daily';
    fromId: string;
    alvos: EdgeTargetInput[]; // slugs antigos ou alvos completos de wikilinks
}

interface AlvoEdge {
    slug: string;
    path: string | null;
}

interface KnowledgeTargetRow {
    id: string;
    slug: string;
    title: string;
    folder_id: string | null;
}

interface FolderRow {
    id: string;
    name: string;
    parent_id: string | null;
}

function ultimoSegmento(target: string): string {
    const partes = target
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean);
    return partes.at(-1) ?? target;
}

function limparCaminho(path: string): string {
    return path
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean)
        .join('/');
}

function normalizarCaminho(path: string): string {
    return limparCaminho(path).split('/').map(slugify).join('/');
}

function normalizarAlvo(alvo: EdgeTargetInput): AlvoEdge {
    if (typeof alvo !== 'string') {
        return { slug: alvo.slug, path: alvo.path ? limparCaminho(alvo.path) : null };
    }

    const target = limparCaminho(alvo);
    return {
        slug: slugify(ultimoSegmento(target)),
        path: target.includes('/') ? target : null,
    };
}

function chaveAlvo(alvo: AlvoEdge): string {
    return alvo.path ? `${alvo.slug}:${normalizarCaminho(alvo.path)}` : alvo.slug;
}

function caminhoDasPastas(pastas: FolderRow[]): Map<string, string> {
    const porId = new Map(pastas.map((p) => [p.id, p]));
    const memo = new Map<string, string>();
    const aResolver = new Set<string>();

    function path(id: string): string {
        const cached = memo.get(id);
        if (cached) return cached;
        const pasta = porId.get(id);
        if (!pasta) return 'Pasta';
        if (aResolver.has(id)) return pasta.name;
        aResolver.add(id);
        const prefixo = pasta.parent_id ? `${path(pasta.parent_id)}/` : '';
        const valor = `${prefixo}${pasta.name}`;
        memo.set(id, valor);
        aResolver.delete(id);
        return valor;
    }

    for (const p of pastas) path(p.id);
    return memo;
}

function caminhosIguais(a: string, b: string): boolean {
    return limparCaminho(a) === limparCaminho(b) || normalizarCaminho(a) === normalizarCaminho(b);
}

// Resolve o alvo para o id da nota: path certo ganha; path desatualizado com
// slug único faz fallback (a nota mudou de pasta, o link não deve partir);
// homónimos sem path certo ficam pendentes.
export function resolverIdAlvo(
    path: string | null,
    matches: Array<{ id: string; caminho: string }>,
): string | null {
    if (path) {
        const porPath = matches.find((m) => caminhosIguais(m.caminho, path));
        if (porPath) return porPath.id;
    }
    return matches.length === 1 ? matches[0].id : null;
}

// Regenera as arestas de uma entidade: apaga as antigas (owner, fromType, fromId)
// e insere uma por alvo. Resolve to_id/to_type em `knowledge` se a nota existir;
// senão fica pendente (to_slug guardado, to_id null). Partilhado por knowledge e daily.
export async function regenerarEdgesCom(
    db: SupabaseClient,
    { ownerId, fromType, fromId, alvos }: RegenerarEdgesInput,
): Promise<void> {
    // Apaga só as edges derivadas do texto (kind='wikilink'); edges estruturais
    // de outro kind (ex.: daily→conversa) são geridas à parte e sobrevivem.
    const { error: dErr } = await db
        .from('edges')
        .delete()
        .eq('owner_id', ownerId)
        .eq('from_type', fromType)
        .eq('from_id', fromId)
        .eq('kind', 'wikilink');
    if (dErr) throw new Error(`apagar edges: ${dErr.message}`);

    const unicos = Array.from(
        new Map(
            alvos
                .map(normalizarAlvo)
                .filter((alvo) => Boolean(alvo.slug))
                .map((alvo) => [chaveAlvo(alvo), alvo]),
        ).values(),
    );
    if (!unicos.length) return;

    const slugs = [...new Set(unicos.map((alvo) => alvo.slug))];
    const { data: existentes, error: kErr } = await db
        .from('knowledge')
        .select('id, slug, title, folder_id')
        .eq('owner_id', ownerId)
        .in('slug', slugs);
    if (kErr) throw new Error(`resolver knowledge para edges: ${kErr.message}`);

    const notasPorSlug = new Map<string, KnowledgeTargetRow[]>();
    for (const r of (existentes ?? []) as KnowledgeTargetRow[]) {
        const notas = notasPorSlug.get(r.slug);
        if (notas) notas.push(r);
        else notasPorSlug.set(r.slug, [r]);
    }

    let pathPorPasta = new Map<string, string>();
    if (unicos.some((alvo) => alvo.path)) {
        const { data: pastas, error: fErr } = await db
            .from('folders')
            .select('id, name, parent_id')
            .eq('owner_id', ownerId);
        if (fErr) throw new Error(`resolver pastas para edges: ${fErr.message}`);
        pathPorPasta = caminhoDasPastas((pastas ?? []) as FolderRow[]);
    }

    function caminhoNota(nota: KnowledgeTargetRow): string {
        const pasta = nota.folder_id ? pathPorPasta.get(nota.folder_id) : null;
        return pasta ? `${pasta}/${nota.title}` : nota.title;
    }

    function idResolvido(alvo: AlvoEdge): string | null {
        const matches = notasPorSlug.get(alvo.slug) ?? [];
        return resolverIdAlvo(
            alvo.path,
            matches.map((nota) => ({ id: nota.id, caminho: caminhoNota(nota) })),
        );
    }

    const { error: iErr } = await db.from('edges').insert(
        unicos.map((alvo) => {
            const to_id = idResolvido(alvo);
            return {
                owner_id: ownerId,
                from_type: fromType,
                from_id: fromId,
                to_type: to_id ? 'knowledge' : null,
                to_slug: alvo.slug,
                to_id,
                kind: 'wikilink',
            };
        }),
    );
    if (iErr) throw new Error(`inserir edges: ${iErr.message}`);
}

// #121: ao escrever uma nota, resolve as edges PENDENTES de OUTRAS notas que
// apontavam para o seu slug (to_id null) — fecha os links-fantasma que ficavam
// dormentes até a origem ser reescrita (a resolução só acontecia na escrita da
// origem). Só quando o slug é inequívoco entre as notas vivas, para não resolver
// para o homónimo errado (mantém a regra do regenerar: ambíguo fica pendente).
export async function reconciliarEdgesPendentesCom(
    db: SupabaseClient,
    ownerId: string,
    slug: string,
    noteId: string,
): Promise<void> {
    const { data: vivas, error } = await db
        .from('knowledge')
        .select('id')
        .eq('owner_id', ownerId)
        .eq('slug', slug)
        .eq('archived', false);
    if (error) throw new Error(`reconciliar edges (homónimos): ${error.message}`);
    if ((vivas ?? []).length !== 1) return; // ambíguo → deixa pendente

    const { error: uErr } = await db
        .from('edges')
        .update({ to_id: noteId, to_type: 'knowledge' })
        .eq('owner_id', ownerId)
        .eq('to_slug', slug)
        .is('to_id', null);
    if (uErr) throw new Error(`reconciliar edges pendentes: ${uErr.message}`);
}

export interface RegistarEdgeConversaInput {
    ownerId: string;
    dailyId: string;
    conversationId: string;
}

// Edge ESTRUTURAL daily→conversa (kind='conversa'): liga o recap à conversa-fonte
// na teia (grafo/expand), fora do markdown e fora do regenerar de wikilinks.
// Idempotente: apaga a anterior desta daily e insere a atual.
export async function registarEdgeConversaCom(
    db: SupabaseClient,
    { ownerId, dailyId, conversationId }: RegistarEdgeConversaInput,
): Promise<void> {
    const { error: dErr } = await db
        .from('edges')
        .delete()
        .eq('owner_id', ownerId)
        .eq('from_type', 'daily')
        .eq('from_id', dailyId)
        .eq('kind', 'conversa');
    if (dErr) throw new Error(`apagar edge conversa: ${dErr.message}`);

    const { error: iErr } = await db.from('edges').insert({
        owner_id: ownerId,
        from_type: 'daily',
        from_id: dailyId,
        to_type: 'conversa',
        to_slug: `conversa:${conversationId}`,
        to_id: conversationId,
        kind: 'conversa',
    });
    if (iErr) throw new Error(`inserir edge conversa: ${iErr.message}`);
}
