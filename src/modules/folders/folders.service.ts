import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Pasta } from './folders.tree';

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

export async function renomearPastaCom(
    db: SupabaseClient,
    id: string,
    novoNome: string,
): Promise<void> {
    const nome = novoNome.trim();
    if (!nome) throw new Error('nome de pasta vazio');
    const { error } = await db.from('folders').update({ name: nome }).eq('id', id);
    if (error) throw new Error(`renomear pasta: ${error.message}`);
}
export const renomearPasta = async (id: string, novoNome: string) =>
    renomearPastaCom(await createClient(), id, novoNome);
