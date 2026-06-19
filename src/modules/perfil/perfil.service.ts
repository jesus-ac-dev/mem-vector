import type { SupabaseClient } from '@supabase/supabase-js';

import { caminhoAvatar, validarAvatar } from './perfil.schema';

// O perfil para leitura vem por props do layout (que já tem o user); aqui só
// vivem as ESCRITAS. donoCom resolve o utilizador da sessão para o owner_id.
async function donoCom(db: SupabaseClient): Promise<{ id: string }> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    return { id: user.id };
}

export async function atualizarNomeCom(db: SupabaseClient, displayName: string): Promise<void> {
    const { id } = await donoCom(db);
    const { error } = await db.from('profiles').update({ display_name: displayName }).eq('id', id);
    if (error) throw new Error(`atualizar nome: ${error.message}`);
}

// O upload usa a sessão do utilizador (RLS do Storage garante a pasta {uid}/);
// upsert para o avatar ser sempre o mesmo caminho. Devolve o URL público com
// cache-bust para a UI refrescar a imagem reescrita.
export async function atualizarAvatarCom(
    db: SupabaseClient,
    file: { bytes: Uint8Array; mime: string; size: number },
): Promise<string> {
    const { id } = await donoCom(db);
    const v = validarAvatar({ type: file.mime, size: file.size });
    if (!v.ok) throw new Error(v.erro ?? 'avatar inválido');

    const path = caminhoAvatar(id, file.mime);
    const { error: upErr } = await db.storage
        .from('avatars')
        .upload(path, file.bytes, { contentType: file.mime, upsert: true });
    if (upErr) throw new Error(`upload do avatar: ${upErr.message}`);

    const { data: pub } = db.storage.from('avatars').getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    const { error } = await db.from('profiles').update({ avatar_url: url }).eq('id', id);
    if (error) throw new Error(`gravar avatar_url: ${error.message}`);
    return url;
}
