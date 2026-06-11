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

async function limparNota(ownerId: string, slug: string) {
    const admin = getSupabaseAdmin();
    const existing = await admin
        .from('knowledge')
        .select('id')
        .eq('owner_id', ownerId)
        .eq('slug', slug);
    for (const row of existing.data ?? []) {
        await admin.from('file_versions').delete().eq('entity_id', row.id);
        await admin.from('chunks').delete().eq('metadata->>entity_id', row.id);
        await admin.from('edges').delete().eq('from_id', row.id);
        await admin.from('knowledge').delete().eq('id', row.id);
    }
}

// #28: nota arquivada está FORA do pipeline de escrita. O upsert por slug
// aterrava na arquivada (foi assim que o agente "atualizou" a Carlos e Sofia
// arquivada, e que uma criação manual homónima lhe esmagou o corpo).
describe('escritas recusam alvo arquivado (#28, integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let aliceId: string;
    let notaId: string;

    beforeAll(async () => {
        alice = await userClient('alice-arq@test.local', 'pw-alice-123');
        aliceId = (await alice.auth.getUser()).data.user!.id;
        await limparNota(aliceId, 'guarda-arquivo');
        await limparNota(aliceId, 'guarda-arquivo-pasta');
        await limparNota(aliceId, 'liga-ativa');
        await limparNota(aliceId, 'liga-arquivada');
        const admin = getSupabaseAdmin();
        await admin
            .from('folders')
            .delete()
            .eq('owner_id', aliceId)
            .in('name', ['arq-teste', 'arq-rename', 'arq-rename-novo']);

        const { escreverNotaCom, arquivarNotaPorIdCom } =
            await import('@/modules/knowledge/knowledge.service');
        const r = await escreverNotaCom(alice, {
            title: 'Guarda Arquivo',
            content_md: '# Guarda Arquivo\n\ncorpo original',
            links: [],
            reason: 'fixture #28',
        });
        notaId = r.id;
        await arquivarNotaPorIdCom(alice, notaId);
    });

    it('upsert por slug (criar homónima) é recusado em vez de esmagar a arquivada', async () => {
        const { escreverNotaCom } = await import('@/modules/knowledge/knowledge.service');
        await expect(
            escreverNotaCom(alice, {
                title: 'Guarda arquivo',
                content_md: '# Guarda arquivo\n\n',
                links: [],
                reason: 'colisão manual',
            }),
        ).rejects.toThrow(/arquivo/);

        // O corpo da arquivada fica intacto.
        const { data } = await alice
            .from('knowledge')
            .select('content_md, archived')
            .eq('id', notaId)
            .single();
        expect(data?.archived).toBe(true);
        expect(data?.content_md).toContain('corpo original');
    });

    it('continuar por id é recusado', async () => {
        const { atualizarNotaPorIdCom } = await import('@/modules/knowledge/knowledge.service');
        await expect(atualizarNotaPorIdCom(alice, notaId, 'corpo novo', 'agent')).rejects.toThrow(
            /arquivo/,
        );
    });

    it('em pasta: upsert por slug também recusa alvo arquivado', async () => {
        const { escreverNotaEmPastaCom, arquivarNotaPorIdCom } =
            await import('@/modules/knowledge/knowledge.service');
        const pasta = await alice
            .from('folders')
            .insert({ owner_id: aliceId, name: 'arq-teste' })
            .select('id')
            .single();
        expect(pasta.error).toBeNull();

        const r = await escreverNotaEmPastaCom(
            alice,
            {
                title: 'Guarda Arquivo Pasta',
                content_md: '# Guarda Arquivo Pasta\n\ncorpo em pasta',
                links: [],
                reason: 'fixture #28',
            },
            String(pasta.data!.id),
        );
        await arquivarNotaPorIdCom(alice, r.id);

        await expect(
            escreverNotaEmPastaCom(
                alice,
                {
                    title: 'Guarda Arquivo Pasta',
                    content_md: '# Guarda Arquivo Pasta\n\n',
                    links: [],
                    reason: 'colisão em pasta',
                },
                String(pasta.data!.id),
            ),
        ).rejects.toThrow(/arquivo/);
    });

    it('rename de pasta não rebenta com arquivada a linkar o path (regressão do audit)', async () => {
        const { escreverNotaCom, arquivarNotaPorIdCom } =
            await import('@/modules/knowledge/knowledge.service');
        const { renomearPastaCom } = await import('@/modules/folders/folders.service');

        const pasta = await alice
            .from('folders')
            .insert({ owner_id: aliceId, name: 'arq-rename' })
            .select('id')
            .single();
        expect(pasta.error).toBeNull();

        const ativa = await escreverNotaCom(alice, {
            title: 'Liga Ativa',
            content_md: '# Liga Ativa\n\nver [[arq-rename/alvo]]',
            links: [],
            reason: 'fixture rename',
        });
        const arquivada = await escreverNotaCom(alice, {
            title: 'Liga Arquivada',
            content_md: '# Liga Arquivada\n\nver [[arq-rename/alvo]]',
            links: [],
            reason: 'fixture rename',
        });
        await arquivarNotaPorIdCom(alice, arquivada.id);

        // Antes do fix, isto rebentava: a reescrita de wikilinks tocava na
        // arquivada e o guard recusava.
        await renomearPastaCom(alice, String(pasta.data!.id), 'arq-rename-novo');

        const { data: a } = await alice
            .from('knowledge')
            .select('content_md')
            .eq('id', ativa.id)
            .single();
        expect(a?.content_md).toContain('[[arq-rename-novo/alvo]]');

        const { data: b } = await alice
            .from('knowledge')
            .select('content_md')
            .eq('id', arquivada.id)
            .single();
        // A arquivada fica dormente, com o link antigo intacto.
        expect(b?.content_md).toContain('[[arq-rename/alvo]]');
    });

    it('repor a nota devolve-lhe a escrita (controlo positivo)', async () => {
        const { reporNotaCom, escreverNotaCom } =
            await import('@/modules/knowledge/knowledge.service');
        await reporNotaCom(alice, 'guarda-arquivo');

        const r = await escreverNotaCom(alice, {
            title: 'Guarda Arquivo',
            content_md: '# Guarda Arquivo\n\ncorpo original + facto novo',
            links: [],
            reason: 'pós-restore',
        });
        expect(r.slug).toBe('guarda-arquivo');
        expect(r.diff).not.toBeNull(); // atualizou a existente, não criou
    });
});
