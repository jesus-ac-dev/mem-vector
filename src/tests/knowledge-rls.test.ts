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
    }, 120_000);
});
