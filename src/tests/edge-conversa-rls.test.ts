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

const DAILY_ID = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
const CONVERSA_ID = '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b';

describe('edge estrutural daily→conversa (integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let aliceId: string;
    beforeAll(async () => {
        alice = await userClient('alice-edge-conv@test.local', 'pw-alice-123');
        aliceId = (await alice.auth.getUser()).data.user!.id;
        const admin = getSupabaseAdmin();
        const dailies = await admin.from('dailies').select('id').eq('owner_id', aliceId);
        for (const d of dailies.data ?? []) {
            await admin.from('edges').delete().eq('from_id', d.id);
            await admin.from('file_versions').delete().eq('entity_id', d.id);
            await admin.from('chunks').delete().eq('metadata->>entity_id', d.id);
        }
        await admin.from('dailies').delete().eq('owner_id', aliceId);
        await admin.from('edges').delete().eq('from_id', DAILY_ID);
    });

    it('grava a edge kind=conversa e sobrevive ao regenerar dos wikilinks', async () => {
        const { registarEdgeConversaCom, regenerarEdgesCom } =
            await import('@/modules/knowledge/edges');
        await registarEdgeConversaCom(alice, {
            ownerId: aliceId,
            dailyId: DAILY_ID,
            conversationId: CONVERSA_ID,
        });
        // O projector regenera as edges de wikilink da daily — não deve tocar a conversa.
        await regenerarEdgesCom(alice, {
            ownerId: aliceId,
            fromType: 'daily',
            fromId: DAILY_ID,
            alvos: ['tdd'],
        });
        const edges = await alice
            .from('edges')
            .select('kind, to_type, to_id')
            .eq('from_id', DAILY_ID);
        const kinds = (edges.data ?? []).map((e) => e.kind);
        expect(kinds).toContain('conversa'); // sobreviveu ao regenerar
        expect(kinds).toContain('wikilink'); // a do wikilink foi (re)criada
        const conv = (edges.data ?? []).find((e) => e.kind === 'conversa');
        expect(conv?.to_id).toBe(CONVERSA_ID);
        expect(conv?.to_type).toBe('conversa');
    }, 120_000);

    it('registar a mesma conversa de novo não duplica a edge', async () => {
        const { registarEdgeConversaCom } = await import('@/modules/knowledge/edges');
        await registarEdgeConversaCom(alice, {
            ownerId: aliceId,
            dailyId: DAILY_ID,
            conversationId: CONVERSA_ID,
        });
        const convs = await alice
            .from('edges')
            .select('id')
            .eq('from_id', DAILY_ID)
            .eq('kind', 'conversa');
        expect(convs.data?.length).toBe(1);
    }, 120_000);

    it('acrescentarAoDailyCom com conversationId grava a edge ponta-a-ponta', async () => {
        const { acrescentarAoDailyCom, hojeLisboa } = await import('@/modules/daily/daily.service');
        await acrescentarAoDailyCom(alice, '- teste de edge conversa', undefined, CONVERSA_ID);
        const daily = await alice
            .from('dailies')
            .select('id')
            .eq('owner_id', aliceId)
            .eq('dia', hojeLisboa())
            .single();
        const edge = await alice
            .from('edges')
            .select('to_id, kind')
            .eq('from_id', daily.data!.id)
            .eq('kind', 'conversa')
            .maybeSingle();
        expect(edge.data?.to_id).toBe(CONVERSA_ID);
    }, 120_000);

    it('grafoDadosCom materializa a conversa como nó ligado à daily', async () => {
        const { grafoDadosCom } = await import('@/modules/knowledge/knowledge.service');
        const { acrescentarAoDailyCom } = await import('@/modules/daily/daily.service');
        const conv = await alice
            .from('conversations')
            .insert({ title: 'Conversa do grafo', owner_id: aliceId })
            .select('id')
            .single();
        const convId = String(conv.data!.id);
        await acrescentarAoDailyCom(alice, '- no conversa no grafo', '2099-01-01', convId);
        const daily = await alice
            .from('dailies')
            .select('id')
            .eq('owner_id', aliceId)
            .eq('dia', '2099-01-01')
            .single();
        const dailyId = String(daily.data!.id);

        const grafo = await grafoDadosCom(alice);
        const noConversa = grafo.nodes.find((n) => n.id === convId);
        expect(noConversa?.group).toBe('conversa');
        expect(
            grafo.links.some((l) => String(l.source) === dailyId && String(l.target) === convId),
        ).toBe(true);
    }, 120_000);
});
