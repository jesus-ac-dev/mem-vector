// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient as createAnonClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { escreverNotaCom, atualizarNotaPorIdCom } from '@/modules/knowledge/knowledge.service';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function userClient(email: string): Promise<SupabaseClient> {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.createUser({
        email,
        password: 'pw-tags-guard-123',
        email_confirm: true,
    });
    if (error && !error.message.includes('already been registered')) throw error;
    const c = createAnonClient(URL, ANON);
    const { error: e2 } = await c.auth.signInWithPassword({ email, password: 'pw-tags-guard-123' });
    if (e2) throw e2;
    return c;
}

async function tagsDaNota(db: SupabaseClient, id: string): Promise<string[]> {
    const { data } = await db.from('knowledge').select('frontmatter').eq('id', id).single();
    const fm = (data?.frontmatter ?? {}) as { tags?: string[] };
    return fm.tags ?? [];
}

describe('guard SQL das tags (#95)', () => {
    let db: SupabaseClient;
    beforeAll(async () => {
        db = await userClient('tags-guard@test.local');
    });

    it('escrita por slug (colisão): o agente UNE, não esmaga a tag do utilizador', async () => {
        // O utilizador cria uma nota com a sua tag.
        const r1 = await escreverNotaCom(
            db,
            {
                title: 'Hardware do Carlos',
                content_md: '# Hardware do Carlos\n\nNotas de hardware.',
                links: [],
                reason: 'seed do utilizador',
                tags: ['importante'],
            },
            'user',
        );
        // O agente escreve no MESMO slug (sem candidata, fallback) com OUTRA tag.
        await escreverNotaCom(
            db,
            {
                title: 'Hardware do Carlos',
                content_md: '# Hardware do Carlos\n\nNotas + facto novo.',
                links: [],
                reason: 'escrita do agente',
                tags: ['hardware'],
            },
            'agent',
        );
        const tags = await tagsDaNota(db, r1.id);
        expect(tags).toContain('importante'); // a do user sobrevive
        expect(tags).toContain('hardware'); // a do agente acrescenta
    });

    it('continuar por id: tags do agente unidas às existentes', async () => {
        const r = await escreverNotaCom(
            db,
            {
                title: 'Gata Mia',
                content_md: '# Gata Mia\n\nA Mia.',
                links: [],
                reason: 'seed',
                tags: ['animais'],
            },
            'user',
        );
        await atualizarNotaPorIdCom(
            db,
            r.id,
            '# Gata Mia\n\nA Mia tem medo de trovoada.',
            'agent',
            {
                tags: ['gato'],
            },
        );
        const tags = await tagsDaNota(db, r.id);
        expect(tags).toContain('animais');
        expect(tags).toContain('gato');
    });

    it('agente sem tags não remove as do utilizador', async () => {
        const r = await escreverNotaCom(
            db,
            {
                title: 'Projeto Faro',
                content_md: '# Projeto Faro\n\nInício.',
                links: [],
                reason: 'seed',
                tags: ['trabalho'],
            },
            'user',
        );
        // continuar SEM tags (patch sem a chave) → as existentes ficam
        await atualizarNotaPorIdCom(db, r.id, '# Projeto Faro\n\nAvanço.', 'agent', {});
        expect(await tagsDaNota(db, r.id)).toContain('trabalho');
    });
});
