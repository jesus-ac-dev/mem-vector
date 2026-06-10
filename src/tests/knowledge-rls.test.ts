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
        const { atualizarNotaPorIdCom, escreverNotaCom } =
            await import('@/modules/knowledge/knowledge.service');
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

        const r3 = await atualizarNotaPorIdCom(alice, r1.id, 'v3 [[tdd]]', 'user');
        expect(r3.id).toBe(r1.id);
        expect(r3.slug).toBe('e5');
        expect(r3.contentMd).toBe('v3 [[tdd]]');
        const versoes3 = await alice.from('file_versions').select('id').eq('entity_id', r1.id);
        expect(versoes3.data?.length).toBe(3);
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

    it('permite o mesmo slug em pastas diferentes sem resolver wikilink ambíguo', async () => {
        const { criarPastaCom } = await import('@/modules/folders/folders.service');
        const { escreverNotaCom, escreverNotaEmPastaCom, listarKnowledgeCom } =
            await import('@/modules/knowledge/knowledge.service');

        const suffix = Date.now() % 100000;
        const titulo = `Duplicado Pasta ${suffix}`;
        const root = await escreverNotaCom(
            alice,
            {
                title: titulo,
                content_md: `# ${titulo}\n\nna raiz`,
                links: [],
                reason: 'teste slug por pasta',
            },
            'user',
        );
        const pasta = await criarPastaCom(alice, `Pasta Duplicado ${suffix}`);
        const naPasta = await escreverNotaEmPastaCom(
            alice,
            {
                title: titulo,
                content_md: `# ${titulo}\n\nna pasta`,
                links: [],
                reason: 'teste slug por pasta',
            },
            pasta.id,
            'user',
        );

        expect(naPasta.slug).toBe(root.slug);
        expect(naPasta.id).not.toBe(root.id);

        const notas = await listarKnowledgeCom(alice);
        const duplicadas = notas.filter((n) => n.slug === root.slug);
        expect(duplicadas.map((n) => n.folderId ?? null).sort()).toEqual([null, pasta.id].sort());

        const ref = await escreverNotaCom(
            alice,
            {
                title: `Referencia Ambigua ${suffix}`,
                content_md: `liga a [[${titulo}]]`,
                links: [],
                reason: 'teste wikilink ambiguo',
            },
            'user',
        );
        const { data: edges } = await alice
            .from('edges')
            .select('to_slug, to_id')
            .eq('from_id', ref.id)
            .eq('to_slug', root.slug);
        expect(edges?.length).toBe(1);
        expect(edges?.[0]?.to_id).toBeNull();
    }, 180_000);

    it('resolve wikilink com path para a nota exacta em pasta', async () => {
        const { criarPastaCom, renomearPastaCom } =
            await import('@/modules/folders/folders.service');
        const {
            escreverNotaCom,
            escreverNotaEmPastaCom,
            backlinksDeCom,
            forwardLinksDeCom,
            renomearNotaPorIdCom,
        } = await import('@/modules/knowledge/knowledge.service');

        const suffix = Date.now() % 100000;
        const titulo = `Path Resolvido ${suffix}`;
        const root = await escreverNotaCom(
            alice,
            {
                title: titulo,
                content_md: `# ${titulo}\n\nna raiz`,
                links: [],
                reason: 'teste path wikilink',
            },
            'user',
        );
        const pasta = await criarPastaCom(alice, `Pasta Path ${suffix}`);
        const naPasta = await escreverNotaEmPastaCom(
            alice,
            {
                title: titulo,
                content_md: `# ${titulo}\n\nna pasta`,
                links: [],
                reason: 'teste path wikilink',
            },
            pasta.id,
            'user',
        );
        const outraPasta = await criarPastaCom(alice, `Outra Pasta Path ${suffix}`);
        await escreverNotaEmPastaCom(
            alice,
            {
                title: titulo,
                content_md: `# ${titulo}\n\nnoutra pasta`,
                links: [],
                reason: 'teste path wikilink',
            },
            outraPasta.id,
            'user',
        );

        const ref = await escreverNotaCom(
            alice,
            {
                title: `Referencia Path ${suffix}`,
                content_md:
                    `liga a [[${pasta.name}/${titulo}|${titulo}]] ` +
                    `e [[${outraPasta.name}/${titulo}|${titulo}]]`,
                links: [],
                reason: 'teste wikilink com path',
            },
            'user',
        );

        const { data: edges } = await alice
            .from('edges')
            .select('to_slug, to_id')
            .eq('from_id', ref.id)
            .eq('to_slug', naPasta.slug);
        expect(edges?.some((e) => e.to_id === naPasta.id)).toBe(true);

        const forward = await forwardLinksDeCom(alice, ref.id);
        expect(forward).toContainEqual({
            id: naPasta.id,
            slug: naPasta.slug,
            title: naPasta.title,
            existe: true,
            ambiguo: false,
            arquivada: false,
        });

        const backlinksRoot = await backlinksDeCom(alice, root.slug, root.id);
        expect(backlinksRoot.some((n) => n.id === ref.id)).toBe(false);

        const backlinksPasta = await backlinksDeCom(alice, naPasta.slug, naPasta.id);
        expect(backlinksPasta).toContainEqual({
            id: ref.id,
            slug: ref.slug,
            title: ref.title,
            tipo: 'knowledge',
        });

        const pastaRenomeada = `Pasta Path Renamed ${suffix}`;
        await renomearPastaCom(alice, pasta.id, pastaRenomeada);
        const { data: refAposPasta } = await alice
            .from('knowledge')
            .select('content_md')
            .eq('id', ref.id)
            .maybeSingle();
        expect(refAposPasta?.content_md).toContain(`[[${pastaRenomeada}/${titulo}|${titulo}]]`);
        expect(refAposPasta?.content_md).toContain(`[[${outraPasta.name}/${titulo}|${titulo}]]`);

        const novoTitulo = `Path Renamed ${suffix}`;
        await renomearNotaPorIdCom(alice, naPasta.id, novoTitulo, naPasta.slug);
        const { data: refDepois } = await alice
            .from('knowledge')
            .select('content_md')
            .eq('id', ref.id)
            .maybeSingle();
        expect(refDepois?.content_md).toContain(
            `[[${pastaRenomeada}/${novoTitulo}|${novoTitulo}]]`,
        );
        expect(refDepois?.content_md).not.toContain(
            `[[${pastaRenomeada}/${novoTitulo}|${titulo}]]`,
        );
        expect(refDepois?.content_md).toContain(`[[${outraPasta.name}/${titulo}|${titulo}]]`);
    }, 180_000);

    it('move pasta atualizando parent_id, paths de wikilinks e bloqueando ciclos', async () => {
        const { criarPastaCom, moverPastaCom } = await import('@/modules/folders/folders.service');
        const { escreverNotaCom, escreverNotaEmPastaCom } =
            await import('@/modules/knowledge/knowledge.service');

        const suffix = Date.now() % 100000;
        const origem = await criarPastaCom(alice, `Move Origem ${suffix}`);
        const filho = await criarPastaCom(alice, `Move Filho ${suffix}`, origem.id);
        const destino = await criarPastaCom(alice, `Move Destino ${suffix}`);
        const titulo = `Nota Movida ${suffix}`;
        await escreverNotaEmPastaCom(
            alice,
            {
                title: titulo,
                content_md: `# ${titulo}

conteudo`,
                links: [],
                reason: 'teste move pasta',
            },
            filho.id,
            'user',
        );
        const ref = await escreverNotaCom(
            alice,
            {
                title: `Referencia Move ${suffix}`,
                content_md: `liga a [[${origem.name}/${filho.name}/${titulo}|${titulo}]]`,
                links: [],
                reason: 'teste rewrite move pasta',
            },
            'user',
        );

        await moverPastaCom(alice, filho.id, destino.id);

        const { data: pastaMovida } = await alice
            .from('folders')
            .select('parent_id')
            .eq('id', filho.id)
            .maybeSingle();
        expect(pastaMovida?.parent_id).toBe(destino.id);

        const { data: refDepois } = await alice
            .from('knowledge')
            .select('content_md')
            .eq('id', ref.id)
            .maybeSingle();
        expect(refDepois?.content_md).toContain(
            `[[${destino.name}/${filho.name}/${titulo}|${titulo}]]`,
        );
        expect(refDepois?.content_md).not.toContain(`${origem.name}/${filho.name}/${titulo}`);

        await expect(moverPastaCom(alice, destino.id, filho.id)).rejects.toThrow(/subpasta/);
    }, 180_000);

    it('arquiva pasta arquivando notas descendentes e reescrevendo wikilinks por path', async () => {
        const { criarPastaCom, arquivarPastaCom } =
            await import('@/modules/folders/folders.service');
        const { escreverNotaCom, escreverNotaEmPastaCom } =
            await import('@/modules/knowledge/knowledge.service');

        const suffix = Date.now() % 100000;
        const pasta = await criarPastaCom(alice, `Folder Drop ${suffix}`);
        const subpasta = await criarPastaCom(alice, `Sub Drop ${suffix}`, pasta.id);
        const tituloPasta = `Nota Pasta Arquivada ${suffix}`;
        const tituloSub = `Nota Sub Arquivada ${suffix}`;
        const notaPasta = await escreverNotaEmPastaCom(
            alice,
            {
                title: tituloPasta,
                content_md: `# ${tituloPasta}

conteudo`,
                links: [],
                reason: 'teste arquivar pasta',
            },
            pasta.id,
            'user',
        );
        const notaRootHomonima = await escreverNotaCom(
            alice,
            {
                title: tituloPasta,
                content_md: `# ${tituloPasta}

homónima ativa na raiz`,
                links: [],
                reason: 'teste homónimo raiz ao arquivar pasta',
            },
            'user',
        );
        const notaSub = await escreverNotaEmPastaCom(
            alice,
            {
                title: tituloSub,
                content_md: `# ${tituloSub}

conteudo`,
                links: [],
                reason: 'teste arquivar subpasta',
            },
            subpasta.id,
            'user',
        );
        const ref = await escreverNotaCom(
            alice,
            {
                title: `Referencia Archive ${suffix}`,
                content_md:
                    `liga a [[${pasta.name}/${tituloPasta}|${tituloPasta}]] ` +
                    `e [[${pasta.name}/${subpasta.name}/${tituloSub}|${tituloSub}]]`,
                links: [],
                reason: 'teste rewrite archive pasta',
            },
            'user',
        );

        await arquivarPastaCom(alice, pasta.id);

        const { data: pastasDepois } = await alice
            .from('folders')
            .select('id, archived')
            .in('id', [pasta.id, subpasta.id]);
        expect(pastasDepois).toHaveLength(2);
        expect(pastasDepois?.every((p) => p.archived === true)).toBe(true);

        const { data: notasDepois } = await alice
            .from('knowledge')
            .select('id, folder_id, archived')
            .in('id', [notaPasta.id, notaSub.id, notaRootHomonima.id]);
        expect(notasDepois).toHaveLength(3);
        const porId = new Map((notasDepois ?? []).map((n) => [n.id, n]));
        expect(porId.get(notaPasta.id)).toMatchObject({ archived: true, folder_id: pasta.id });
        expect(porId.get(notaSub.id)).toMatchObject({ archived: true, folder_id: subpasta.id });
        expect(porId.get(notaRootHomonima.id)).toMatchObject({
            archived: false,
            folder_id: null,
        });

        const { data: chunksDepois } = await alice
            .from('chunks')
            .select('id')
            .in('metadata->>entity_id', [notaPasta.id, notaSub.id]);
        expect(chunksDepois ?? []).toHaveLength(0);

        const { data: refDepois } = await alice
            .from('knowledge')
            .select('content_md')
            .eq('id', ref.id)
            .maybeSingle();
        expect(refDepois?.content_md).toContain(`[[${tituloPasta}|${tituloPasta}]]`);
        expect(refDepois?.content_md).toContain(`[[${tituloSub}|${tituloSub}]]`);
        expect(refDepois?.content_md).not.toContain(pasta.name);
        expect(refDepois?.content_md).not.toContain(subpasta.name);
    }, 180_000);

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
