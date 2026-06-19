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

const uid = async (c: Awaited<ReturnType<typeof userClient>>) =>
    (await c.auth.getUser()).data.user!.id;

describe('memória operacional de agentes (integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let bob: Awaited<ReturnType<typeof userClient>>;
    let carol: Awaited<ReturnType<typeof userClient>>;
    let aliceId: string;
    let grupoId: string;

    beforeAll(async () => {
        alice = await userClient('alice-agent-memory@test.local', 'pw-alice-agent-memory-123');
        bob = await userClient('bob-agent-memory@test.local', 'pw-bob-agent-memory-123');
        carol = await userClient('carol-agent-memory@test.local', 'pw-carol-agent-memory-123');
        aliceId = await uid(alice);
        const bobId = await uid(bob);

        const grupo = await alice.rpc('criar_grupo', { p_nome: 'memoria-operacional' });
        if (grupo.error || !grupo.data) throw grupo.error ?? new Error('sem grupo');
        grupoId = (grupo.data as { id: string }).id;
        const join = await bob.from('grupo_membros').insert({ grupo_id: grupoId, user_id: bobId });
        if (join.error) throw join.error;
    });

    it('dono cria sessão/observação privadas e outro utilizador não vê', async () => {
        const { abrirOuReusarSessaoCom, registarObservacaoCom } =
            await import('@/modules/memory/memory.service');

        const sessao = await abrirOuReusarSessaoCom(alice, { operator: 'codex', runner: 'web' });
        await registarObservacaoCom(alice, {
            sessionId: sessao.id,
            type: 'user-prompt',
            content: 'Segredo operacional',
        });

        const outro = await carol
            .from('agent_observations')
            .select('content')
            .eq('session_id', sessao.id);
        expect(outro.data?.length ?? 0).toBe(0);
    });

    it('membro de grupo vê e aceita handoff protected; não-membro não vê', async () => {
        const { criarHandoffCom, aceitarHandoffCom } =
            await import('@/modules/memory/memory.service');

        const handoff = await criarHandoffCom(alice, {
            summary: 'Validar reset da BD local.',
            nextSteps: ['Correr db reset'],
            visibility: 'protected',
            groupId: grupoId,
        });

        const vistoBob = await bob.from('agent_handoffs').select('summary').eq('id', handoff.id);
        expect(vistoBob.data?.length).toBe(1);

        const aceite = await aceitarHandoffCom(bob, handoff.id);
        expect(aceite.status).toBe('accepted');
        expect(aceite.acceptedBy).toBe(await uid(bob));

        const idempotente = await aceitarHandoffCom(bob, handoff.id);
        expect(idempotente.status).toBe('accepted');

        const vistoCarol = await carol
            .from('agent_handoffs')
            .select('summary')
            .eq('id', handoff.id);
        expect(vistoCarol.data?.length ?? 0).toBe(0);
    });

    it('handoff open pode expirar e deixa de aceitar', async () => {
        const { criarHandoffCom, aceitarHandoffCom, expirarHandoffCom } =
            await import('@/modules/memory/memory.service');

        const handoff = await criarHandoffCom(alice, {
            summary: 'Handoff temporário',
            visibility: 'privado',
            metadata: { ownerId: aliceId },
        });

        const expirado = await expirarHandoffCom(alice, handoff.id);
        expect(expirado.status).toBe('expired');

        await expect(aceitarHandoffCom(alice, handoff.id)).rejects.toThrow('expired');
    });
});
