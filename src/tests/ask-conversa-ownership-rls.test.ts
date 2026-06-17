// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient as createAnonClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '@/lib/supabase-admin';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function userClient(email: string, password: string) {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error && !error.message.includes('already been registered')) throw error;
    const c = createAnonClient(URL, ANON);
    const { error: e2 } = await c.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
    return c;
}

// #68: o ask() confiava no conversationId recebido. A posse tem de ser
// verificada antes de o usar (defense-in-depth — evita um oracle de UUID).
describe('garantirConversaCom (#68 — posse do conversationId)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let bob: Awaited<ReturnType<typeof userClient>>;
    let aliceId: string;
    let bobId: string;

    beforeAll(async () => {
        alice = await userClient('alice-convid@test.local', 'pw-alice-convid-123');
        bob = await userClient('bob-convid@test.local', 'pw-bob-convid-123');
        aliceId = (await alice.auth.getUser()).data.user!.id;
        bobId = (await bob.auth.getUser()).data.user!.id;
    });

    it('sem conversationId cria uma conversa nova do utilizador', async () => {
        const { garantirConversaCom } = await import('@/modules/chat/chat.conversas');
        const id = await garantirConversaCom(alice, aliceId, 'pergunta nova da alice');
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('a dona pode reutilizar a sua conversa', async () => {
        const { garantirConversaCom } = await import('@/modules/chat/chat.conversas');
        const id = await garantirConversaCom(alice, aliceId, 'primeira');
        await expect(garantirConversaCom(alice, aliceId, 'segunda', id)).resolves.toBe(id);
    });

    it('rejeita um conversationId que não pertence ao utilizador (sem dizer se existe)', async () => {
        const { garantirConversaCom } = await import('@/modules/chat/chat.conversas');
        const convAlice = await garantirConversaCom(alice, aliceId, 'conversa privada da alice');
        await expect(garantirConversaCom(bob, bobId, 'intruso', convAlice)).rejects.toThrow(
            /não encontrada/,
        );
    });
});
