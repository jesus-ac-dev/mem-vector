// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
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

const LONGO = 'corpo substancial com bastante texto. '.repeat(20); // > 280 chars
const CURTO = 'só uma frase.'; // < 50% do LONGO

describe('knowledge versions (#119)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;

    beforeAll(async () => {
        alice = await userClient('alice-kv@test.local', 'pw-alice-kv-123');
        const admin = getSupabaseAdmin();
        const u = (await alice.auth.getUser()).data.user!;
        await admin.from('knowledge').delete().eq('owner_id', u.id);
    });

    async function criarNota(slug: string, content: string): Promise<string> {
        const { data, error } = await alice.rpc('write_knowledge_entry', {
            p_slug: slug,
            p_title: `T ${slug}`,
            p_content_md: content,
            p_frontmatter: {},
            p_author: 'agent',
        });
        if (error) throw new Error(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        return String((row as { id: string }).id);
    }

    it('a guarda recusa o encolhimento drástico do agente, mas deixa o user e o agente sensato', async () => {
        const id = await criarNota('guarda-encolhe', LONGO);

        // agente encolhe demais (truncamento) → recusado, transação revertida
        const drastico = await alice.rpc('write_knowledge_entry_by_id', {
            p_id: id,
            p_content_md: CURTO,
            p_author: 'agent',
            p_frontmatter_patch: null,
        });
        expect(drastico.error?.message ?? '').toMatch(/encolhimento/i);

        // o corpo continua o longo (o overwrite não passou)
        const apos = await alice.from('knowledge').select('content_md').eq('id', id).single();
        expect(apos.data?.content_md).toBe(LONGO);

        // agente que mantém o tamanho → ok
        const ok = await alice.rpc('write_knowledge_entry_by_id', {
            p_id: id,
            p_content_md: `${LONGO} mais um bocado`,
            p_author: 'agent',
            p_frontmatter_patch: null,
        });
        expect(ok.error).toBeNull();

        // o utilizador PODE encolher (é deliberado) → a guarda não o trava
        const user = await alice.rpc('write_knowledge_entry_by_id', {
            p_id: id,
            p_content_md: CURTO,
            p_author: 'user',
            p_frontmatter_patch: null,
        });
        expect(user.error).toBeNull();
    }, 60_000);

    it('restaura o corpo de uma versão antiga e preserva o histórico', async () => {
        const { restaurarVersaoKnowledgeCom, listarVersoesCom } =
            await import('@/modules/knowledge/knowledge.service');
        const id = await criarNota('restauro', `PRIMEIRA versão. ${LONGO}`);

        // o utilizador troca o corpo
        await alice.rpc('write_knowledge_entry_by_id', {
            p_id: id,
            p_content_md: 'SEGUNDA versão, completamente diferente.',
            p_author: 'user',
            p_frontmatter_patch: null,
        });

        const versoes = await listarVersoesCom(alice, id);
        const v1 = versoes.find((v) => v.contentMd.startsWith('PRIMEIRA'));
        expect(v1).toBeTruthy();

        await restaurarVersaoKnowledgeCom(alice, v1!.id);

        const nota = await alice.from('knowledge').select('content_md').eq('id', id).single();
        expect(nota.data?.content_md).toContain('PRIMEIRA');

        // histórico preservado + nova versão gerada (o restauro é reversível)
        const depois = await listarVersoesCom(alice, id);
        expect(depois.length).toBe(versoes.length + 1);
    }, 60_000);

    it('restaura também o título/slug quando o H1 da versão antiga é diferente', async () => {
        const {
            escreverNotaCom,
            listarVersoesCom,
            renomearNotaPorIdCom,
            restaurarVersaoKnowledgeCom,
        } = await import('@/modules/knowledge/knowledge.service');

        const criada = await escreverNotaCom(
            alice,
            {
                title: 'Restauro Nome Antigo',
                content_md: '# Restauro Nome Antigo\n\ncorpo inicial',
                links: [],
                reason: 'teste restore titulo',
            },
            'user',
        );

        await renomearNotaPorIdCom(alice, criada.id, 'Restauro Nome Novo', criada.slug);
        await alice.rpc('write_knowledge_entry_by_id', {
            p_id: criada.id,
            p_content_md: '# Restauro Nome Novo\n\ncorpo novo',
            p_author: 'user',
            p_frontmatter_patch: null,
        });

        const versoes = await listarVersoesCom(alice, criada.id);
        const antiga = versoes.find((v) => v.contentMd.startsWith('# Restauro Nome Antigo'));
        expect(antiga).toBeTruthy();

        await restaurarVersaoKnowledgeCom(alice, antiga!.id);

        const nota = await alice
            .from('knowledge')
            .select('title, slug, content_md')
            .eq('id', criada.id)
            .single();
        expect(nota.data).toMatchObject({
            title: 'Restauro Nome Antigo',
            slug: 'restauro-nome-antigo',
            content_md: '# Restauro Nome Antigo\n\ncorpo inicial',
        });
    }, 60_000);

    it('reconcilia o link-fantasma quando o alvo nasce (#121)', async () => {
        const { escreverNotaCom } = await import('@/modules/knowledge/knowledge.service');

        // A liga a [[alvo-tardio]], que ainda não existe → edge pendente (to_id null).
        const a = await escreverNotaCom(
            alice,
            {
                title: 'Origem Link',
                content_md: '# Origem Link\nliga a [[alvo-tardio]] que ainda não existe.',
                links: [],
                reason: 'teste #121',
            },
            'agent',
        );
        const pend = await alice
            .from('edges')
            .select('to_id')
            .eq('from_id', a.id)
            .eq('to_slug', 'alvo-tardio')
            .single();
        expect(pend.data?.to_id).toBeNull();

        // Nasce o alvo (slug 'alvo-tardio') → o projector resolve a edge pendente.
        const b = await escreverNotaCom(
            alice,
            {
                title: 'Alvo Tardio',
                content_md: '# Alvo Tardio\no conteúdo do alvo.',
                links: [],
                reason: 'teste #121',
            },
            'agent',
        );
        const resolvida = await alice
            .from('edges')
            .select('to_id')
            .eq('from_id', a.id)
            .eq('to_slug', 'alvo-tardio')
            .single();
        expect(resolvida.data?.to_id).toBe(b.id);
    }, 60_000);
});
