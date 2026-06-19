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

describe('agent_jobs (integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;

    beforeAll(async () => {
        alice = await userClient('alice-chat-jobs@test.local', 'pw-alice-chat-jobs-123');
        const admin = getSupabaseAdmin();
        const aliceUser = (await alice.auth.getUser()).data.user!;
        await admin.from('agent_jobs').delete().eq('owner_id', aliceUser.id);
    });

    it('permite retry de job falhado e bloqueia novo claim depois de concluido', async () => {
        const {
            concluirDestilacaoJobCom,
            criarDestilacaoJobCom,
            estadoDestilacaoJobCom,
            falharDestilacaoJobCom,
            reclamarDestilacaoJobCom,
        } = await import('@/modules/chat/chat.jobs');

        const jobId = await criarDestilacaoJobCom(alice, {
            question: 'O que falta validar?',
            answer: 'Falta validar retry de jobs.',
            conversationId: '11111111-1111-4111-8111-111111111111',
            userMessageId: '22222222-2222-4222-8222-222222222222',
            assistantMessageId: '33333333-3333-4333-8333-333333333333',
        });

        const firstClaim = await reclamarDestilacaoJobCom(alice, jobId);
        expect(firstClaim?.id).toBe(jobId);

        await falharDestilacaoJobCom(alice, jobId, 'falha temporaria');
        await expect(estadoDestilacaoJobCom(alice, jobId)).resolves.toMatchObject({
            status: 'failed',
            error: 'falha temporaria',
        });

        const retryClaim = await reclamarDestilacaoJobCom(alice, jobId);
        expect(retryClaim?.id).toBe(jobId);

        const running = await alice
            .from('agent_jobs')
            .select('status, attempts, error, locked_at')
            .eq('id', jobId)
            .single();
        expect(running.data).toMatchObject({
            status: 'running',
            attempts: 2,
            error: null,
        });
        expect(running.data?.locked_at).not.toBeNull();

        await concluirDestilacaoJobCom(alice, jobId, {
            notas: [],
            daily: { dia: '2026-06-07', criado: true },
        });

        await expect(reclamarDestilacaoJobCom(alice, jobId)).resolves.toBeNull();
        await expect(estadoDestilacaoJobCom(alice, jobId)).resolves.toMatchObject({
            status: 'done',
            result: {
                notas: [],
                daily: { dia: '2026-06-07', criado: true },
            },
        });
    }, 60_000);

    it('reclama um running preso (lock expirado) mas não um running fresco (#118)', async () => {
        const { criarDestilacaoJobCom, reclamarDestilacaoJobCom } =
            await import('@/modules/chat/chat.jobs');
        const admin = getSupabaseAdmin();

        const jobId = await criarDestilacaoJobCom(alice, {
            question: 'q preso',
            answer: 'a preso',
            conversationId: '44444444-4444-4444-8444-444444444444',
            userMessageId: null,
            assistantMessageId: null,
        });

        // 1.º claim → running com lock fresco; um running fresco NÃO é reclamável
        // (o processador ainda está vivo).
        expect((await reclamarDestilacaoJobCom(alice, jobId))?.id).toBe(jobId);
        await expect(reclamarDestilacaoJobCom(alice, jobId)).resolves.toBeNull();

        // Simula o processador morto: lock há 20 min (> 10 min do limite).
        const vinteMinAtras = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        await admin.from('agent_jobs').update({ locked_at: vinteMinAtras }).eq('id', jobId);

        // Agora o sweeper consegue reclamar o órfão.
        await expect(reclamarDestilacaoJobCom(alice, jobId)).resolves.toMatchObject({ id: jobId });
    }, 60_000);
});
