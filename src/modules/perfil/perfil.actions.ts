'use server';

import { createClient } from '@/lib/supabase/server';
import {
    AtualizarNomeSchema,
    AtualizarEmailSchema,
    AtualizarPasswordSchema,
} from './perfil.schema';
import { atualizarNomeCom, atualizarAvatarCom } from './perfil.service';

export async function atualizarNome(input: unknown): Promise<void> {
    const { displayName } = AtualizarNomeSchema.parse(input);
    await atualizarNomeCom(await createClient(), displayName);
}

// O email É o login. Com confirmações LIGADAS (prod), `updateUser` deixa o novo
// email PENDENTE (`new_email`) até o clique no link — o login só muda aí. Com
// confirmações DESLIGADAS (autoconfirm, ex.: dev local), muda JÁ e em silêncio.
// Devolvemos qual dos dois aconteceu para a UI não mentir.
export async function atualizarEmail(input: unknown): Promise<{ pendente: boolean }> {
    const { email } = AtualizarEmailSchema.parse(input);
    const { data, error } = await (await createClient()).auth.updateUser({ email });
    if (error) throw new Error(error.message);
    return { pendente: Boolean(data.user?.new_email) };
}

export async function atualizarPassword(input: unknown): Promise<void> {
    const { password } = AtualizarPasswordSchema.parse(input);
    const { error } = await (await createClient()).auth.updateUser({ password });
    if (error) throw new Error(error.message);
}

export async function atualizarAvatar(formData: FormData): Promise<string> {
    const file = formData.get('avatar');
    if (!(file instanceof File)) throw new Error('sem ficheiro');
    const bytes = new Uint8Array(await file.arrayBuffer());
    return atualizarAvatarCom(await createClient(), {
        bytes,
        mime: file.type,
        size: file.size,
    });
}
