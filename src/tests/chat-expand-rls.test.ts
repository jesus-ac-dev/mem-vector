// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { Source } from '@/modules/chat/chat.prompt';

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

const DIA = '2099-02-02';

describe('expandirFontesCom (integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let aliceId: string;
    beforeAll(async () => {
        alice = await userClient('alice-expand@test.local', 'pw-alice-123');
        aliceId = (await alice.auth.getUser()).data.user!.id;
        const admin = getSupabaseAdmin();
        const dailies = await admin.from('dailies').select('id').eq('owner_id', aliceId);
        for (const d of dailies.data ?? []) {
            await admin.from('edges').delete().eq('from_id', d.id);
            await admin.from('file_versions').delete().eq('entity_id', d.id);
            await admin.from('chunks').delete().eq('metadata->>entity_id', d.id);
        }
        await admin.from('dailies').delete().eq('owner_id', aliceId);
    });

    it('puxa a knowledge ligada a uma daily (forward) e a daily de volta (backward)', async () => {
        const { expandirFontesCom } = await import('@/modules/chat/chat.expand');
        const { escreverNotaCom } = await import('@/modules/knowledge/knowledge.service');
        const { acrescentarAoDailyCom } = await import('@/modules/daily/daily.service');
        const admin = getSupabaseAdmin();

        const nota = await escreverNotaCom(alice, {
            title: 'Nota Ligada Expand',
            content_md: 'conteudo da nota ligada ao expand',
            links: [],
            reason: 'x',
        });
        await acrescentarAoDailyCom(alice, '- recap do expand', DIA);
        const daily = await alice
            .from('dailies')
            .select('id')
            .eq('owner_id', aliceId)
            .eq('dia', DIA)
            .single();
        const dailyId = String(daily.data!.id);

        // Edge daily→knowledge (como a linha "Estado escrito: [[slug]]" geraria).
        await admin.from('edges').delete().eq('from_id', dailyId);
        await admin.from('edges').insert({
            owner_id: aliceId,
            from_type: 'daily',
            from_id: dailyId,
            to_type: 'knowledge',
            to_slug: nota.slug,
            to_id: nota.id,
            kind: 'wikilink',
        });

        // Fonte = a daily → forward traz a nota ligada.
        const fonteDaily: Source = {
            content: 'recap',
            source: DIA,
            similarity: 0.9,
            metadata: { entity_type: 'daily', entity_id: dailyId },
        };
        const expDaily = await expandirFontesCom(alice, [fonteDaily]);
        expect(expDaily.some((s) => s.metadata?.entity_id === nota.id)).toBe(true);

        // Fonte = a nota → backward traz a daily que a menciona.
        const fonteNota: Source = {
            content: 'conteudo',
            source: 'Nota Ligada Expand',
            similarity: 0.9,
            metadata: { entity_type: 'knowledge', entity_id: nota.id },
        };
        const expNota = await expandirFontesCom(alice, [fonteNota]);
        expect(expNota.some((s) => s.metadata?.entity_id === dailyId)).toBe(true);
    }, 120_000);

    it('sem entidades nas fontes (ex.: meta-pergunta) não expande — não amplifica o #62', async () => {
        const { expandirFontesCom } = await import('@/modules/chat/chat.expand');
        const semMeta: Source = { content: 'x', source: null, similarity: 0.9, metadata: null };
        expect(await expandirFontesCom(alice, [semMeta])).toEqual([]);
    }, 120_000);
});
