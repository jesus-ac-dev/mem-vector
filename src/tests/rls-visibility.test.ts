// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Vetor 384-dim qualquer (a RLS é o que se testa, não a qualidade do retrieval).
const DUMMY_EMBEDDING = JSON.stringify([1, ...Array(383).fill(0)]);

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
    let aliceId: string;
    let aliceConvId: string;

    beforeAll(async () => {
        alice = await userClient('alice-rls@test.local', 'pw-alice-123');
        bob = await userClient('bob-rls@test.local', 'pw-bob-123');
        aliceId = (await alice.auth.getUser()).data.user!.id;

        const conv = await alice
            .from('conversations')
            .insert({ owner_id: aliceId, title: 'segredo da alice' })
            .select('id')
            .single();
        if (conv.error || !conv.data) throw conv.error ?? new Error('sem conversa');
        aliceConvId = conv.data.id as string;

        const chunk = await alice.from('chunks').insert({
            content: 'chunk privado da alice',
            embedding: DUMMY_EMBEDDING,
            source: 'test',
            owner_id: aliceId,
        });
        if (chunk.error) throw chunk.error;
    });

    it('o dono ve a sua conversa privada', async () => {
        const { data } = await alice.from('conversations').select('title');
        expect(data?.some((r) => r.title === 'segredo da alice')).toBe(true);
    });

    it('outro user NAO ve a conversa privada', async () => {
        const { data } = await bob.from('conversations').select('title');
        expect(data?.some((r) => r.title === 'segredo da alice')).toBe(false);
    });

    it('outro user NAO consegue forjar owner_id', async () => {
        // Bob tenta criar uma conversa como se fosse a alice → with check bloqueia.
        const { error } = await bob
            .from('conversations')
            .insert({ owner_id: aliceId, title: 'forjada' });
        expect(error).toBeTruthy();
    });

    it('outro user NAO consegue escrever na conversa de outro', async () => {
        const { error } = await bob
            .from('messages')
            .insert({ conversation_id: aliceConvId, role: 'user', content: 'intruso' });
        expect(error).toBeTruthy();
    });

    it('match_chunks NAO vaza chunks privados de outro user', async () => {
        const { data } = await bob.rpc('match_chunks', {
            query_embedding: DUMMY_EMBEDDING,
            match_count: 5,
        });
        const contents = ((data ?? []) as { content: string }[]).map((r) => r.content);
        expect(contents).not.toContain('chunk privado da alice');
    });
});
