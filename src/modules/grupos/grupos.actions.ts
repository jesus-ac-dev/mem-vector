'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { NovoGrupoSchema, ConviteSchema } from './grupos.schema';

export async function criarGrupo(formData: FormData) {
    const { nome, descricao } = NovoGrupoSchema.parse({
        nome: formData.get('nome'),
        descricao: formData.get('descricao') || undefined,
    });
    const db = await createClient();
    // Atómico: cria o grupo e adiciona-me como membro (ver criar_grupo na migração).
    const { error } = await db.rpc('criar_grupo', { p_nome: nome, p_descricao: descricao ?? null });
    if (error) throw new Error(`criar grupo falhou: ${error.message}`);
    revalidatePath('/grupos');
}

export async function convidar(formData: FormData) {
    const { grupoId, email } = ConviteSchema.parse({
        grupoId: formData.get('grupoId'),
        email: formData.get('email'),
    });
    const db = await createClient();
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const { error } = await db
        .from('grupo_convites')
        .insert({ grupo_id: grupoId, email, convidado_por: user.id });
    if (error) throw new Error(`convidar falhou: ${error.message}`);
    revalidatePath('/grupos');
}

export async function aceitarConvite(formData: FormData) {
    const conviteId = String(formData.get('conviteId'));
    const db = await createClient();
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    // O convite é legível por RLS só se for para o meu email.
    const { data: convite, error: cErr } = await db
        .from('grupo_convites')
        .select('grupo_id')
        .eq('id', conviteId)
        .single();
    if (cErr || !convite) throw new Error('convite não encontrado');

    const entrada = await db
        .from('grupo_membros')
        .insert({ grupo_id: convite.grupo_id, user_id: user.id });
    if (entrada.error) throw new Error(`aceitar falhou: ${entrada.error.message}`);

    await db.from('grupo_convites').update({ estado: 'aceite' }).eq('id', conviteId);
    revalidatePath('/grupos');
}

export async function recusarConvite(formData: FormData) {
    const conviteId = String(formData.get('conviteId'));
    const db = await createClient();
    const { error } = await db
        .from('grupo_convites')
        .update({ estado: 'recusado' })
        .eq('id', conviteId);
    if (error) throw new Error(`recusar falhou: ${error.message}`);
    revalidatePath('/grupos');
}

export async function sair(formData: FormData) {
    const grupoId = String(formData.get('grupoId'));
    const db = await createClient();
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const { error } = await db
        .from('grupo_membros')
        .delete()
        .eq('grupo_id', grupoId)
        .eq('user_id', user.id);
    if (error) throw new Error(`sair falhou: ${error.message}`);
    revalidatePath('/grupos');
}
