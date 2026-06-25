// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient as createAnonClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { escreverNotaCom } from '@/modules/knowledge/knowledge.service';
import { varrerDerivedIndexPendentesCom } from '@/modules/workspace/index-projector';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function userClient(email: string): Promise<SupabaseClient> {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.createUser({
        email,
        password: 'pw-sweeper-123',
        email_confirm: true,
    });
    if (error && !error.message.includes('already been registered')) throw error;
    const c = createAnonClient(URL, ANON);
    const { error: e2 } = await c.auth.signInWithPassword({ email, password: 'pw-sweeper-123' });
    if (e2) throw e2;
    return c;
}

describe('sweeper derived_index (auto-cura)', () => {
    let db: SupabaseClient;
    beforeAll(async () => {
        db = await userClient('derived-sweeper@test.local');
        const {
            data: { user },
        } = await db.auth.getUser();
        await getSupabaseAdmin().from('agent_jobs').delete().eq('owner_id', user!.id);
    });

    it('retoma um job failed (attempts<5) e deixa-o done', async () => {
        const nota = await escreverNotaCom(db, {
            title: 'Sweeper Teste',
            content_md: '# Sweeper Teste\nconteúdo de teste',
            links: [],
            reason: 'teste do sweeper',
        });
        const {
            data: { user },
        } = await db.auth.getUser();
        const ins = await db
            .from('agent_jobs')
            .insert({
                owner_id: user!.id,
                type: 'derived_index_entity',
                status: 'failed',
                payload: { entityType: 'knowledge', entityId: nota.id },
            })
            .select('id')
            .single();
        const jobId = String(ins.data!.id);

        const r = await varrerDerivedIndexPendentesCom(db);
        expect(r.processados).toBeGreaterThanOrEqual(1);

        const depois = await db.from('agent_jobs').select('status').eq('id', jobId).single();
        expect(depois.data!.status).toBe('done');
    });

    it('não retenta jobs cronicamente partidos (attempts>=5)', async () => {
        const nota = await escreverNotaCom(db, {
            title: 'Sweeper Limite',
            content_md: '# Sweeper Limite\nconteúdo de teste',
            links: [],
            reason: 'teste do limite do sweeper',
        });
        const {
            data: { user },
        } = await db.auth.getUser();
        const ins = await db
            .from('agent_jobs')
            .insert({
                owner_id: user!.id,
                type: 'derived_index_entity',
                status: 'failed',
                attempts: 5,
                payload: { entityType: 'knowledge', entityId: nota.id },
            })
            .select('id')
            .single();
        const jobId = String(ins.data!.id);

        const r = await varrerDerivedIndexPendentesCom(db);
        expect(r.falhados).toBe(0);

        const depois = await db
            .from('agent_jobs')
            .select('status, attempts')
            .eq('id', jobId)
            .single();
        expect(depois.data).toMatchObject({ status: 'failed', attempts: 5 });
    });
});
