// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cria (ou reusa) um user e devolve um cliente anon autenticado por ele (RLS ativa).
async function userClient(email: string, password: string) {
    const admin = getSupabaseAdmin();
    const { error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });
    if (createErr && !createErr.message.includes('already been registered')) {
        throw createErr;
    }
    const c = createAnonClient(URL, ANON);
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return c;
}

describe('RLS visibilidade privado', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let bob: Awaited<ReturnType<typeof userClient>>;

    beforeAll(async () => {
        alice = await userClient('alice-rls@test.local', 'pw-alice-123');
        bob = await userClient('bob-rls@test.local', 'pw-bob-123');
        const aliceId = (await alice.auth.getUser()).data.user!.id;
        const { error } = await alice
            .from('conversations')
            .insert({ owner_id: aliceId, title: 'segredo da alice' });
        if (error) throw error;
    });

    it('o dono ve a sua conversa privada', async () => {
        const { data } = await alice.from('conversations').select('title');
        expect(data?.some((r) => r.title === 'segredo da alice')).toBe(true);
    });

    it('outro user NAO ve a conversa privada', async () => {
        const { data } = await bob.from('conversations').select('title');
        expect(data?.some((r) => r.title === 'segredo da alice')).toBe(false);
    });
});
