// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient as createAnonClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { criarDb } from '@/agent/agent-db';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function restaurarEnv(nome: string, valor: string | undefined): void {
    if (valor === undefined) delete process.env[nome];
    else process.env[nome] = valor;
}

// #159: o agente partilhava o refresh_token do utilizador e fazia setSession → com
// enable_refresh_token_rotation=true, refrescava e ROTAVA o refresh token,
// invalidando a sessão do browser (kick). Fix: o agente autentica SÓ com o access
// token (header Authorization), sem refresh token → não pode rotar.
describe('criarDb do agente (#159)', () => {
    let accessToken: string;
    let userId: string;
    const accessAntes = process.env.MEMVECTOR_AGENT_ACCESS_TOKEN;
    const refreshAntes = process.env.MEMVECTOR_AGENT_REFRESH_TOKEN;

    beforeAll(async () => {
        const admin = getSupabaseAdmin();
        const email = 'agent-auth-159@test.local';
        const { error } = await admin.auth.admin.createUser({
            email,
            password: 'pw-159-123',
            email_confirm: true,
        });
        if (error && !error.message.includes('already been registered')) throw error;
        const c = createAnonClient(URL, ANON);
        const { data, error: e2 } = await c.auth.signInWithPassword({
            email,
            password: 'pw-159-123',
        });
        if (e2 || !data.session) throw e2 ?? new Error('sem sessão de teste');
        accessToken = data.session.access_token;
        userId = data.user.id;
    });

    afterAll(() => {
        restaurarEnv('MEMVECTOR_AGENT_ACCESS_TOKEN', accessAntes);
        restaurarEnv('MEMVECTOR_AGENT_REFRESH_TOKEN', refreshAntes);
    });

    it('autentica como o user SÓ com o access token (sem refresh token no ambiente)', async () => {
        process.env.MEMVECTOR_AGENT_ACCESS_TOKEN = accessToken;
        delete process.env.MEMVECTOR_AGENT_REFRESH_TOKEN; // a chave do #159

        const db = await criarDb();
        const { data, error } = await db.auth.getUser();

        expect(error).toBeNull();
        expect(data.user?.id).toBe(userId);

        // RLS: uma query de dados é aceite com a identidade do user (header →
        // PostgREST valida o JWT), não só o getUser.
        const sel = await db.from('knowledge').select('id').limit(1);
        expect(sel.error).toBeNull();
    });
});
