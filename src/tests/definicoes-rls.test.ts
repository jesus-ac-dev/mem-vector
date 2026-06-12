// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
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

// #60: definições por utilizador — defaults sem linha, upsert, isolamento.
describe('definições (#60, integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let bruno: Awaited<ReturnType<typeof userClient>>;

    beforeAll(async () => {
        alice = await userClient('alice-definicoes@test.local', 'pw-alice-123');
        bruno = await userClient('bruno-definicoes@test.local', 'pw-bruno-123');
        const admin = getSupabaseAdmin();
        const ids = [
            (await alice.auth.getUser()).data.user!.id,
            (await bruno.auth.getUser()).data.user!.id,
        ];
        await admin.from('definicoes').delete().in('owner_id', ids);
    });

    it('sem linha devolve os defaults (one-shot, sem módulos)', { timeout: 30_000 }, async () => {
        const { lerDefinicoesCom } = await import('@/modules/definicoes/definicoes.service');
        expect(await lerDefinicoesCom(alice)).toEqual({
            metodoDestilacao: 'one-shot',
            modulosAtivos: [],
        });
    });

    it('grava, relê e isola por dono', { timeout: 30_000 }, async () => {
        const { gravarDefinicoesCom, lerDefinicoesCom } =
            await import('@/modules/definicoes/definicoes.service');
        await gravarDefinicoesCom(alice, {
            metodoDestilacao: 'agentic',
            modulosAtivos: ['github'],
        });
        expect(await lerDefinicoesCom(alice)).toEqual({
            metodoDestilacao: 'agentic',
            modulosAtivos: ['github'],
        });
        // upsert: segunda gravação substitui, não duplica
        await gravarDefinicoesCom(alice, { metodoDestilacao: 'one-shot', modulosAtivos: [] });
        expect((await lerDefinicoesCom(alice)).metodoDestilacao).toBe('one-shot');
        // o Bruno continua nos defaults dele
        expect(await lerDefinicoesCom(bruno)).toEqual({
            metodoDestilacao: 'one-shot',
            modulosAtivos: [],
        });
    });
});
