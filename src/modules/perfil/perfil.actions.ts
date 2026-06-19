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

// Mudar email dispara o fluxo de confirmação do Supabase (email para o novo
// endereço); só efetiva após o clique. Password muda direto para o utilizador
// com sessão.
export async function atualizarEmail(input: unknown): Promise<void> {
    const { email } = AtualizarEmailSchema.parse(input);
    const { error } = await (await createClient()).auth.updateUser({ email });
    if (error) throw new Error(error.message);
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
