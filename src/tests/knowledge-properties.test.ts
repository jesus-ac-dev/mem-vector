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

describe('propriedades de notas (integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    beforeAll(async () => {
        alice = await userClient('alice-props@test.local', 'pw-alice-123');
        // Limpar estado de runs anteriores.
        const admin = getSupabaseAdmin();
        const aliceUser = (await alice.auth.getUser()).data.user!;
        const existing = await admin
            .from('knowledge')
            .select('id')
            .eq('owner_id', aliceUser.id)
            .eq('slug', 'nota-props');
        for (const row of existing.data ?? []) {
            await admin.from('file_versions').delete().eq('entity_id', row.id);
            await admin.from('chunks').delete().eq('metadata->>entity_id', row.id);
            await admin.from('edges').delete().eq('from_id', row.id);
            await admin.from('knowledge').delete().eq('id', row.id);
        }
    });

    it('define tags/summary/visibility e a escrita do agente preserva-as (merge)', async () => {
        const { escreverNotaCom, getPropriedadesNotaPorIdCom, atualizarPropriedadesNotaCom } =
            await import('@/modules/knowledge/knowledge.service');

        const r1 = await escreverNotaCom(alice, {
            title: 'Nota Props',
            content_md: 'v1',
            links: [],
            reason: 'x',
        });

        // Propriedades default.
        const p0 = await getPropriedadesNotaPorIdCom(alice, r1.id);
        expect(p0).not.toBeNull();
        expect(p0!.tags).toEqual([]);
        expect(p0!.summary).toBeNull();
        expect(p0!.visibility).toBe('privado');
        expect(p0!.createdAt).toBeTruthy();

        // Editar propriedades (normaliza tags: trim, #, dedupe).
        const p1 = await atualizarPropriedadesNotaCom(alice, r1.id, {
            tags: ['#rag', ' rag ', 'Chat'],
            summary: 'nota de teste',
        });
        expect(p1.tags).toEqual(['rag', 'Chat']);
        expect(p1.summary).toBe('nota de teste');

        // Versão registada também na edição de propriedades.
        const versoes = await alice.from('file_versions').select('id').eq('entity_id', r1.id);
        expect(versoes.data?.length).toBe(2);

        // Escrita do agente (mesmo slug) NÃO apaga as propriedades.
        await escreverNotaCom(alice, {
            title: 'Nota Props',
            content_md: 'v2 com mais conteúdo',
            links: [],
            reason: 'x',
        });
        const p2 = await getPropriedadesNotaPorIdCom(alice, r1.id);
        expect(p2!.tags).toEqual(['rag', 'Chat']);
        expect(p2!.summary).toBe('nota de teste');

        // Visibility muda e o resto fica.
        const p3 = await atualizarPropriedadesNotaCom(alice, r1.id, {
            visibility: 'protected',
        });
        expect(p3.visibility).toBe('protected');
        expect(p3.tags).toEqual(['rag', 'Chat']);

        // Visibility inválida é recusada pelo schema.
        await expect(
            atualizarPropriedadesNotaCom(alice, r1.id, {
                visibility: 'whatever' as never,
            }),
        ).rejects.toThrow();

        // Tags chegam na listagem (para o filtro do explorer).
        const { listarKnowledgeCom } = await import('@/modules/knowledge/knowledge.service');
        const notas = await listarKnowledgeCom(alice);
        const nota = notas.find((n) => n.id === r1.id);
        expect(nota?.tags).toEqual(['rag', 'Chat']);
    }, 120_000);

    it('não deixa editar propriedades de nota alheia', async () => {
        const { escreverNotaCom, atualizarPropriedadesNotaCom } =
            await import('@/modules/knowledge/knowledge.service');
        const bob = await userClient('bob-props@test.local', 'pw-bob-123');

        const r = await escreverNotaCom(alice, {
            title: 'Nota Props',
            content_md: 'v3',
            links: [],
            reason: 'x',
        });

        await expect(atualizarPropriedadesNotaCom(bob, r.id, { tags: ['hack'] })).rejects.toThrow(
            /não encontrada|sem permissão/,
        );
    }, 60_000);
});

describe('summary auto no ciclo de escrita (#22, integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    beforeAll(async () => {
        alice = await userClient('alice-props@test.local', 'pw-alice-123');
        const admin = getSupabaseAdmin();
        const aliceUser = (await alice.auth.getUser()).data.user!;
        const existing = await admin
            .from('knowledge')
            .select('id')
            .eq('owner_id', aliceUser.id)
            .eq('slug', 'nota-summary');
        for (const row of existing.data ?? []) {
            await admin.from('file_versions').delete().eq('entity_id', row.id);
            await admin.from('chunks').delete().eq('metadata->>entity_id', row.id);
            await admin.from('edges').delete().eq('from_id', row.id);
            await admin.from('knowledge').delete().eq('id', row.id);
        }
    });

    it('nasce com summary do agente, refresca a cada escrita, respeita o do utilizador', async () => {
        const { escreverNotaCom, getPropriedadesNotaPorIdCom, atualizarPropriedadesNotaCom } =
            await import('@/modules/knowledge/knowledge.service');
        const { escreverOuContinuarNotaCom } =
            await import('@/modules/knowledge/knowledge.continuar');

        // 1. Nota nova nasce com summary do agente.
        const r1 = await escreverNotaCom(alice, {
            title: 'Nota Summary',
            content_md: 'v1',
            links: [],
            reason: 'x',
            summary: 'resumo v1',
        });
        const p1 = await getPropriedadesNotaPorIdCom(alice, r1.id);
        expect(p1!.summary).toBe('resumo v1');

        // 2. Escrita seguinte do agente refresca o summary (autoria agent).
        await escreverNotaCom(alice, {
            title: 'Nota Summary',
            content_md: 'v2',
            links: [],
            reason: 'x',
            summary: 'resumo v2',
        });
        const p2 = await getPropriedadesNotaPorIdCom(alice, r1.id);
        expect(p2!.summary).toBe('resumo v2');

        // 3. CONTINUAR via candidata (caminho por id) também refresca.
        await escreverOuContinuarNotaCom(
            alice,
            {
                title: 'Nota Summary',
                content_md: 'v3',
                links: [],
                reason: 'x',
                summary: 'resumo v3',
            },
            [{ id: r1.id, slug: r1.slug, title: 'Nota Summary', contentMd: 'v2' }],
        );
        const p3 = await getPropriedadesNotaPorIdCom(alice, r1.id);
        expect(p3!.summary).toBe('resumo v3');

        // 4. Utilizador escreve o summary à mão → o agente passa a respeitá-lo.
        await atualizarPropriedadesNotaCom(alice, r1.id, { summary: 'resumo do carlos' });
        await escreverNotaCom(alice, {
            title: 'Nota Summary',
            content_md: 'v4',
            links: [],
            reason: 'x',
            summary: 'resumo do agente intruso',
        });
        const p4 = await getPropriedadesNotaPorIdCom(alice, r1.id);
        expect(p4!.summary).toBe('resumo do carlos');

        // 5. Limpar o summary devolve-o ao agente.
        await atualizarPropriedadesNotaCom(alice, r1.id, { summary: '' });
        await escreverNotaCom(alice, {
            title: 'Nota Summary',
            content_md: 'v5',
            links: [],
            reason: 'x',
            summary: 'resumo v5',
        });
        const p5 = await getPropriedadesNotaPorIdCom(alice, r1.id);
        expect(p5!.summary).toBe('resumo v5');

        // 6. Escrita do agente SEM summary não apaga o que existe.
        await escreverNotaCom(alice, {
            title: 'Nota Summary',
            content_md: 'v6',
            links: [],
            reason: 'x',
        });
        const p6 = await getPropriedadesNotaPorIdCom(alice, r1.id);
        expect(p6!.summary).toBe('resumo v5');
    }, 120_000);
});
