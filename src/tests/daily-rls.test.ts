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

const DIA_TESTE = '2026-01-15';

describe('acrescentarAoDaily (integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;

    beforeAll(async () => {
        alice = await userClient('alice-daily@test.local', 'pw-alice-daily-123');
        // Limpar estado de runs anteriores para o dia de teste.
        const admin = getSupabaseAdmin();
        const aliceUser = (await alice.auth.getUser()).data.user!;
        const existing = await admin
            .from('dailies')
            .select('id')
            .eq('owner_id', aliceUser.id)
            .eq('dia', DIA_TESTE)
            .maybeSingle();
        if (existing.data?.id) {
            const dailyId = existing.data.id;
            await admin.from('file_versions').delete().eq('entity_id', dailyId);
            await admin.from('chunks').delete().eq('metadata->>entity_id', dailyId);
            await admin.from('dailies').delete().eq('id', dailyId);
        }
    });

    it('primeiro acrescento cria o daily (criado=true, 1 versão, 1 chunk)', async () => {
        const { acrescentarAoDailyCom } = await import('@/modules/daily/daily.service');

        const r1 = await acrescentarAoDailyCom(alice, 'linha um do dia', DIA_TESTE);
        expect(r1.dia).toBe(DIA_TESTE);
        expect(r1.criado).toBe(true);

        // Verificar o daily foi criado.
        const { data: daily } = await alice
            .from('dailies')
            .select('id, content_md')
            .eq('dia', DIA_TESTE)
            .maybeSingle();
        expect(daily).not.toBeNull();
        expect(daily!.content_md).toBe('linha um do dia');

        // Deve ter 1 versão.
        const { data: versoes1 } = await alice
            .from('file_versions')
            .select('id')
            .eq('entity_type', 'daily')
            .eq('entity_id', daily!.id);
        expect(versoes1?.length).toBe(1);

        // Deve ter exatamente 1 chunk.
        const { data: chunks1 } = await alice
            .from('chunks')
            .select('id')
            .eq('metadata->>entity_id', daily!.id);
        expect(chunks1?.length).toBe(1);
    }, 120_000);

    it('segundo acrescento ao mesmo dia acumula (criado=false, 2 versões, 1 chunk)', async () => {
        const { acrescentarAoDailyCom, listarVersoesDailyCom } =
            await import('@/modules/daily/daily.service');

        const r2 = await acrescentarAoDailyCom(alice, 'linha dois do dia', DIA_TESTE);
        expect(r2.dia).toBe(DIA_TESTE);
        expect(r2.criado).toBe(false);

        // Conteúdo deve ter as duas linhas.
        const { data: daily } = await alice
            .from('dailies')
            .select('id, content_md')
            .eq('dia', DIA_TESTE)
            .maybeSingle();
        expect(daily!.content_md).toBe('linha um do dia\nlinha dois do dia');

        // Deve ter 2 versões agora.
        const versoes = await listarVersoesDailyCom(alice, daily!.id);
        expect(versoes.length).toBe(2);

        // Ainda deve ter exatamente 1 chunk (regenerado).
        const { data: chunks } = await alice
            .from('chunks')
            .select('id')
            .eq('metadata->>entity_id', daily!.id);
        expect(chunks?.length).toBe(1);
    }, 120_000);

    it('listar e get daily funcionam', async () => {
        const { listarDailiesCom, getDailyCom } = await import('@/modules/daily/daily.service');

        const lista = await listarDailiesCom(alice);
        expect(lista.some((d) => d.dia === DIA_TESTE)).toBe(true);

        const daily = await getDailyCom(alice, DIA_TESTE);
        expect(daily).not.toBeNull();
        expect(daily!.dia).toBe(DIA_TESTE);
        expect(daily!.contentMd).toBe('linha um do dia\nlinha dois do dia');
    }, 30_000);

    it('Bob não vê dados de Alice (isolamento cross-user)', async () => {
        const bob = await userClient('bob-daily@test.local', 'pw-bob-daily-456');

        const aliceUser = (await alice.auth.getUser()).data.user!;
        const { data: aliceDaily } = await alice
            .from('dailies')
            .select('id')
            .eq('owner_id', aliceUser.id)
            .eq('dia', DIA_TESTE)
            .maybeSingle();
        const aliceDailyId = aliceDaily!.id;

        const { data: dailyRows } = await bob.from('dailies').select('id').eq('id', aliceDailyId);
        expect(dailyRows?.length).toBe(0);

        const { data: fvRows } = await bob
            .from('file_versions')
            .select('id')
            .eq('entity_id', aliceDailyId);
        expect(fvRows?.length).toBe(0);
    }, 60_000);
});
