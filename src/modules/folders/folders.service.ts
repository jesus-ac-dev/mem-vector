import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Pasta } from './folders.tree';
import { atualizarNotaPorIdCom } from '@/modules/knowledge/knowledge.service';
import { reescreverWikilinkPaths } from '@/modules/knowledge/knowledge.links';

function mapPasta(r: {
    id: string;
    name: string;
    parent_id: string | null;
    color: string | null;
}): Pasta {
    return {
        id: String(r.id),
        name: r.name,
        parentId: r.parent_id ?? null,
        color: r.color ?? null,
    };
}

export async function listarPastasCom(db: SupabaseClient): Promise<Pasta[]> {
    const { data, error } = await db
        .from('folders')
        .select('id, name, parent_id, color')
        .eq('archived', false)
        .order('name');
    if (error) throw new Error(`listar pastas: ${error.message}`);
    return (data ?? []).map(mapPasta);
}
export const listarPastas = async () => listarPastasCom(await createClient());

// Define a cor (hex) de uma pasta. null limpa a cor.
export async function definirCorPastaCom(
    db: SupabaseClient,
    folderId: string,
    cor: string | null,
): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const { error } = await db
        .from('folders')
        .update({ color: cor })
        .eq('owner_id', user.id)
        .eq('id', folderId);
    if (error) throw new Error(`definir cor pasta: ${error.message}`);
}
export const definirCorPasta = async (folderId: string, cor: string | null) =>
    definirCorPastaCom(await createClient(), folderId, cor);

export async function criarPastaCom(
    db: SupabaseClient,
    name: string,
    parentId: string | null = null,
): Promise<Pasta> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const nome = name.trim();
    if (!nome) throw new Error('nome de pasta vazio');

    const { data, error } = await db
        .from('folders')
        .insert({ owner_id: user.id, name: nome, parent_id: parentId })
        .select('id, name, parent_id, color')
        .single();
    if (error || !data) throw new Error(`criar pasta: ${error?.message ?? 'sem dados'}`);
    return mapPasta(data);
}
export const criarPasta = async (name: string, parentId: string | null = null) =>
    criarPastaCom(await createClient(), name, parentId);

function caminhoDasPastas(pastas: Pasta[]): Map<string, string> {
    const porId = new Map(pastas.map((p) => [p.id, p]));
    const memo = new Map<string, string>();

    function path(id: string): string {
        const cached = memo.get(id);
        if (cached) return cached;
        const pasta = porId.get(id);
        if (!pasta) return 'Pasta';
        const prefixo = pasta.parentId ? `${path(pasta.parentId)}/` : '';
        const valor = `${prefixo}${pasta.name}`;
        memo.set(id, valor);
        return valor;
    }

    for (const p of pastas) path(p.id);
    return memo;
}

async function reescreverWikilinksDePastaRenomeadaCom(
    db: SupabaseClient,
    ownerId: string,
    oldPath: string,
    newPath: string,
): Promise<void> {
    if (oldPath === newPath) return;

    // Arquivadas ficam de fora (#28): a escrita recusa-as e os links delas são
    // dormentes — o restore resolve edges pendentes por slug.
    const { data, error } = await db
        .from('knowledge')
        .select('id, content_md')
        .eq('owner_id', ownerId)
        .eq('archived', false);
    if (error) throw new Error(`ler notas para rename de pasta: ${error.message}`);

    for (const nota of data ?? []) {
        const novoConteudo = reescreverWikilinkPaths(nota.content_md, oldPath, newPath);
        if (novoConteudo === nota.content_md) continue;
        await atualizarNotaPorIdCom(db, nota.id, novoConteudo, 'user');
    }
}

export async function renomearPastaCom(
    db: SupabaseClient,
    id: string,
    novoNome: string,
): Promise<void> {
    const nome = novoNome.trim();
    if (!nome) throw new Error('nome de pasta vazio');
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const pastasAntes = await listarPastasCom(db);
    const oldPath = caminhoDasPastas(pastasAntes).get(id);
    const pastasDepois = pastasAntes.map((p) => (p.id === id ? { ...p, name: nome } : p));
    const newPath = caminhoDasPastas(pastasDepois).get(id);

    const { error } = await db
        .from('folders')
        .update({ name: nome })
        .eq('owner_id', user.id)
        .eq('id', id);
    if (error) throw new Error(`renomear pasta: ${error.message}`);
    if (oldPath && newPath) {
        await reescreverWikilinksDePastaRenomeadaCom(db, user.id, oldPath, newPath);
    }
}
export const renomearPasta = async (id: string, novoNome: string) =>
    renomearPastaCom(await createClient(), id, novoNome);

function pastaDescendenteDe(pastas: Pasta[], id: string, ancestorId: string): boolean {
    const porId = new Map(pastas.map((p) => [p.id, p]));
    let atual = porId.get(id);
    while (atual?.parentId) {
        if (atual.parentId === ancestorId) return true;
        atual = porId.get(atual.parentId);
    }
    return false;
}

export async function moverPastaCom(
    db: SupabaseClient,
    id: string,
    parentId: string | null,
): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    if (parentId === id) throw new Error('não podes mover uma pasta para dentro dela própria');

    const pastasAntes = await listarPastasCom(db);
    const pasta = pastasAntes.find((p) => p.id === id);
    if (!pasta) throw new Error('pasta não encontrada');
    if (parentId && !pastasAntes.some((p) => p.id === parentId)) {
        throw new Error('pasta destino não encontrada');
    }
    if (parentId && pastaDescendenteDe(pastasAntes, parentId, id)) {
        throw new Error('não podes mover uma pasta para dentro de uma subpasta dela');
    }

    const oldPath = caminhoDasPastas(pastasAntes).get(id);
    const pastasDepois = pastasAntes.map((p) => (p.id === id ? { ...p, parentId } : p));
    const newPath = caminhoDasPastas(pastasDepois).get(id);

    const { error } = await db
        .from('folders')
        .update({ parent_id: parentId })
        .eq('owner_id', user.id)
        .eq('id', id);
    if (error) throw new Error(`mover pasta: ${error.message}`);
    if (oldPath && newPath) {
        await reescreverWikilinksDePastaRenomeadaCom(db, user.id, oldPath, newPath);
    }
}
export const moverPasta = async (id: string, parentId: string | null) =>
    moverPastaCom(await createClient(), id, parentId);

async function arquivarNotasPorIdsCom(
    db: SupabaseClient,
    ownerId: string,
    noteIds: string[],
): Promise<void> {
    if (noteIds.length === 0) return;

    const { error: updateError } = await db
        .from('knowledge')
        .update({ archived: true, updated_at: new Date().toISOString() })
        .eq('owner_id', ownerId)
        .in('id', noteIds);
    if (updateError) throw new Error(`arquivar notas da pasta: ${updateError.message}`);

    const { data: chunks, error: chunksReadError } = await db
        .from('chunks')
        .select('id')
        .eq('owner_id', ownerId)
        .eq('metadata->>entity_type', 'knowledge')
        .in('metadata->>entity_id', noteIds);
    if (chunksReadError)
        throw new Error(`ler chunks da pasta arquivada: ${chunksReadError.message}`);

    const chunkIds = (chunks ?? []).map((chunk) => String(chunk.id));
    if (chunkIds.length === 0) return;

    const { error: chunksDeleteError } = await db.from('chunks').delete().in('id', chunkIds);
    if (chunksDeleteError) {
        throw new Error(`apagar chunks da pasta arquivada: ${chunksDeleteError.message}`);
    }
}

export async function arquivarPastaCom(db: SupabaseClient, id: string): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const pastasAntes = await listarPastasCom(db);
    const pasta = pastasAntes.find((p) => p.id === id);
    if (!pasta) throw new Error('pasta não encontrada');

    const pathsAntes = caminhoDasPastas(pastasAntes);
    const subtreeIds = pastasAntes
        .filter((p) => p.id === id || pastaDescendenteDe(pastasAntes, p.id, id))
        .map((p) => p.id);
    const pathsParaReescrever = subtreeIds
        .map((folderId) => pathsAntes.get(folderId))
        .filter((path): path is string => Boolean(path))
        .sort((a, b) => b.split('/').length - a.split('/').length);

    const { data: notasAntes, error: notasError } = await db
        .from('knowledge')
        .select('id')
        .eq('owner_id', user.id)
        .eq('archived', false)
        .in('folder_id', subtreeIds);
    if (notasError) throw new Error(`ler notas da pasta arquivada: ${notasError.message}`);

    for (const oldPath of pathsParaReescrever) {
        await reescreverWikilinksDePastaRenomeadaCom(db, user.id, oldPath, '');
    }

    await arquivarNotasPorIdsCom(
        db,
        user.id,
        (notasAntes ?? []).map((nota) => String(nota.id)),
    );

    const { error } = await db
        .from('folders')
        .update({ archived: true })
        .eq('owner_id', user.id)
        .in('id', subtreeIds);
    if (error) throw new Error(`arquivar pasta: ${error.message}`);
}
export const arquivarPasta = async (id: string) => arquivarPastaCom(await createClient(), id);

// Compatibilidade para chamadas antigas: a operação real é archive de pasta.
export const apagarPastaCom = arquivarPastaCom;
export const apagarPasta = arquivarPasta;
