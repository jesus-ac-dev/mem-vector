import { createClient } from '@/lib/supabase/server';
import type { Grupo, ConvitePendente } from './grupos.schema';

// Os meus grupos (a RLS já filtra para os grupos a que pertenço).
export async function listarMeusGrupos(): Promise<Grupo[]> {
    const db = await createClient();
    const { data, error } = await db
        .from('grupos')
        .select('id, nome, descricao, created_at')
        .order('created_at', { ascending: false });
    if (error) throw new Error(`listar grupos falhou: ${error.message}`);
    return (data ?? []) as Grupo[];
}

// Os user_id dos membros de um grupo (RLS: só dos meus grupos).
export async function membros(grupoId: string): Promise<string[]> {
    const db = await createClient();
    const { data, error } = await db
        .from('grupo_membros')
        .select('user_id')
        .eq('grupo_id', grupoId);
    if (error) throw new Error(`listar membros falhou: ${error.message}`);
    return (data ?? []).map((m) => m.user_id as string);
}

// Convites pendentes endereçados a mim (para aceitar/recusar).
export async function convitesParaMim(): Promise<ConvitePendente[]> {
    const db = await createClient();
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user?.email) return [];
    const { data, error } = await db
        .from('grupo_convites')
        .select('id, grupo_id, email, estado, created_at')
        .eq('email', user.email)
        .eq('estado', 'pendente');
    if (error) throw new Error(`listar convites falhou: ${error.message}`);
    return (data ?? []) as ConvitePendente[];
}
