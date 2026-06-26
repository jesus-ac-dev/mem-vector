// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient as createAnonClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { slugify } from '@/modules/knowledge/knowledge.links';

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

// Guard SQL puro: chamar a RPC mantém RLS/transação, mas evita o projector de
// índices do service, que é irrelevante para tags e tornava o gate flaky a 5s.
async function escreverKnowledgeRpc(
    db: SupabaseClient,
    input: { title: string; content_md: string; tags?: string[] },
    author: 'agent' | 'user',
): Promise<{ id: string }> {
    const { data, error } = await db
        .rpc('write_knowledge_entry', {
            p_slug: slugify(input.title),
            p_title: input.title,
            p_content_md: input.content_md,
            p_frontmatter: { title: input.title, ...(input.tags ? { tags: input.tags } : {}) },
            p_author: author,
        })
        .single();
    if (error || !data) throw new Error(`write_knowledge_entry: ${error?.message}`);
    return data as { id: string };
}

async function atualizarKnowledgePorIdRpc(
    db: SupabaseClient,
    id: string,
    contentMd: string,
    author: 'agent' | 'user',
    frontmatterPatch?: Record<string, unknown>,
): Promise<void> {
    const { error } = await db.rpc('write_knowledge_entry_by_id', {
        p_id: id,
        p_content_md: contentMd,
        p_author: author,
        p_frontmatter_patch: frontmatterPatch ?? null,
    });
    if (error) throw new Error(`write_knowledge_entry_by_id: ${error.message}`);
}

describe('guard SQL das tags (#95)', () => {
    let db: SupabaseClient;
    beforeAll(async () => {
        db = await userClient('tags-guard@test.local');
    });

    it('escrita por slug (colisão): o agente UNE, não esmaga a tag do utilizador', async () => {
        // O utilizador cria uma nota com a sua tag.
        const r1 = await escreverKnowledgeRpc(
            db,
            {
                title: 'Hardware do Carlos',
                content_md: '# Hardware do Carlos\n\nNotas de hardware.',
                tags: ['importante'],
            },
            'user',
        );
        // O agente escreve no MESMO slug (sem candidata, fallback) com OUTRA tag.
        await escreverKnowledgeRpc(
            db,
            {
                title: 'Hardware do Carlos',
                content_md: '# Hardware do Carlos\n\nNotas + facto novo.',
                tags: ['hardware'],
            },
            'agent',
        );
        const tags = await tagsDaNota(db, r1.id);
        expect(tags).toContain('importante'); // a do user sobrevive
        expect(tags).toContain('hardware'); // a do agente acrescenta
    });

    it('continuar por id: tags do agente unidas às existentes', async () => {
        const r = await escreverKnowledgeRpc(
            db,
            {
                title: 'Gata Mia',
                content_md: '# Gata Mia\n\nA Mia.',
                tags: ['animais'],
            },
            'user',
        );
        await atualizarKnowledgePorIdRpc(
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
        const r = await escreverKnowledgeRpc(
            db,
            {
                title: 'Projeto Faro',
                content_md: '# Projeto Faro\n\nInício.',
                tags: ['trabalho'],
            },
            'user',
        );
        // continuar SEM tags (patch sem a chave) → as existentes ficam
        await atualizarKnowledgePorIdRpc(db, r.id, '# Projeto Faro\n\nAvanço.', 'agent', {});
        expect(await tagsDaNota(db, r.id)).toContain('trabalho');
    });
});
