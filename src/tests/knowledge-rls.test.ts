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

describe('escreverNota (integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    beforeAll(async () => {
        alice = await userClient('alice-kn@test.local', 'pw-alice-123');
        // Limpar estado de runs anteriores: apagar a nota 'e5' e dados dependentes.
        const admin = getSupabaseAdmin();
        const aliceUser = (await alice.auth.getUser()).data.user!;
        const existing = await admin
            .from('knowledge')
            .select('id')
            .eq('owner_id', aliceUser.id)
            .eq('slug', 'e5')
            .maybeSingle();
        if (existing.data?.id) {
            const noteId = existing.data.id;
            await admin.from('file_versions').delete().eq('entity_id', noteId);
            await admin.from('chunks').delete().eq('metadata->>entity_id', noteId);
            await admin.from('edges').delete().eq('from_id', noteId);
            await admin.from('knowledge').delete().eq('id', noteId);
        }
    });

    it('cria nota + versão + chunk; 2ª escrita gera 2ª versão e diff', async () => {
        const { escreverNotaCom } = await import('@/modules/knowledge/knowledge.service');
        const r1 = await escreverNotaCom(alice, {
            title: 'E5',
            content_md: 'v1 [[tdd]]',
            links: ['tdd'],
            reason: 'x',
        });
        expect(r1.slug).toBe('e5');

        const versoes1 = await alice.from('file_versions').select('id').eq('entity_id', r1.id);
        expect(versoes1.data?.length).toBe(1);

        const edges = await alice.from('edges').select('to_slug').eq('from_id', r1.id);
        expect(edges.data?.map((e) => e.to_slug)).toContain('tdd');

        const chunks1 = await alice.from('chunks').select('id').eq('metadata->>entity_id', r1.id);
        expect(chunks1.data?.length).toBe(1);

        const r2 = await escreverNotaCom(alice, {
            title: 'E5',
            content_md: 'v2 [[tdd]]',
            links: ['tdd'],
            reason: 'x',
        });
        expect(r2.id).toBe(r1.id);
        const versoes2 = await alice.from('file_versions').select('id').eq('entity_id', r1.id);
        expect(versoes2.data?.length).toBe(2);
        expect(r2.diff?.some((d) => d.op === 'add' && d.text.includes('v2'))).toBe(true);

        const chunks2 = await alice.from('chunks').select('id').eq('metadata->>entity_id', r1.id);
        expect(chunks2.data?.length).toBe(1);
    }, 120_000);

    it('lista as notas do dono e lê versões por slug', async () => {
        const { listarKnowledgeCom, listarVersoesCom } =
            await import('@/modules/knowledge/knowledge.service');
        const notas = await listarKnowledgeCom(alice);
        expect(notas.some((n) => n.slug === 'e5')).toBe(true);
        const e5 = notas.find((n) => n.slug === 'e5')!;
        const versoes = await listarVersoesCom(alice, e5.id);
        expect(versoes.length).toBeGreaterThanOrEqual(2);
    }, 30_000);

    it('Bob não vê dados de Alice (isolamento cross-user)', async () => {
        const { escreverNotaCom } = await import('@/modules/knowledge/knowledge.service');

        // Criar uma nota exclusiva para este teste e limpar estado anterior.
        const admin = getSupabaseAdmin();
        const aliceUser = (await alice.auth.getUser()).data.user!;
        const existente = await admin
            .from('knowledge')
            .select('id')
            .eq('owner_id', aliceUser.id)
            .eq('slug', 'segredo-alice')
            .maybeSingle();
        if (existente.data?.id) {
            const noteId = existente.data.id;
            await admin.from('file_versions').delete().eq('entity_id', noteId);
            await admin.from('chunks').delete().eq('metadata->>entity_id', noteId);
            await admin.from('edges').delete().eq('from_id', noteId);
            await admin.from('knowledge').delete().eq('id', noteId);
        }

        const r = await escreverNotaCom(alice, {
            title: 'Segredo Alice',
            content_md: 'conteúdo secreto [[privado]]',
            links: ['privado'],
            reason: 'teste isolamento',
        });
        const aliceNoteId = r.id;

        const bob = await userClient('bob-kn@test.local', 'pw-bob-456');

        const { data: knRows } = await bob.from('knowledge').select('id').eq('id', aliceNoteId);
        expect(knRows?.length).toBe(0);

        const { data: fvRows } = await bob
            .from('file_versions')
            .select('id')
            .eq('entity_id', aliceNoteId);
        expect(fvRows?.length).toBe(0);

        const { data: edgeRows } = await bob.from('edges').select('id').eq('from_id', aliceNoteId);
        expect(edgeRows?.length).toBe(0);
    }, 120_000);
});
