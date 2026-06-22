'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface SignInState {
    error: string;
}

export async function signIn(
    _prev: SignInState | null,
    formData: FormData,
): Promise<SignInState | null> {
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        return { error: 'Email ou password inválidos.' };
    }

    // Carimba o último login (o gancho de onboarding fica para depois).
    if (data.user) {
        await supabase
            .from('profiles')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', data.user.id);
    }

    redirect('/chat');
}

// SEM redirect() aqui: o signOut é chamado imperativamente (onClick, fire-and-forget),
// e redirect() numa action assim vaza o NEXT_REDIRECT (vinha parar ao log de erros /
// unhandledrejection). Limpa a sessão e devolve — quem chama navega no cliente.
export async function signOut(): Promise<void> {
    const supabase = await createClient();
    await supabase.auth.signOut();
}
