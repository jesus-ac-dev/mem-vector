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

// #47: projetos reais — seed do Pessoal, resolução de nomes, isolamento RLS.
describe('projetos (#47, integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let bruno: Awaited<ReturnType<typeof userClient>>;

    beforeAll(async () => {
        alice = await userClient('alice-projetos@test.local', 'pw-alice-123');
        bruno = await userClient('bruno-projetos@test.local', 'pw-bruno-123');
        const admin = getSupabaseAdmin();
        const aliceId = (await alice.auth.getUser()).data.user!.id;
        const brunoId = (await bruno.auth.getUser()).data.user!.id;
        await admin.from('tarefas').delete().in('owner_id', [aliceId, brunoId]);
        await admin.from('projetos').delete().in('owner_id', [aliceId, brunoId]);
    });

    it('garantirPessoal semeia o projeto-vida e é idempotente', { timeout: 30_000 }, async () => {
        const { garantirPessoalCom, listarProjetosCom } =
            await import('@/modules/projetos/projetos.service');
        await garantirPessoalCom(alice);
        await garantirPessoalCom(alice); // 2.ª chamada não duplica
        const projetos = await listarProjetosCom(alice);
        const pessoal = projetos.filter((p) => p.nome === 'Pessoal');
        expect(pessoal).toHaveLength(1);
        // Projeto é uma pasta real (retificação): nasce com folder root próprio.
        expect(pessoal[0].folderId).not.toBeNull();
        const { data: pasta } = await alice
            .from('folders')
            .select('name, parent_id')
            .eq('id', pessoal[0].folderId!)
            .single();
        expect(pasta).toMatchObject({ name: 'Pessoal', parent_id: null });
    });

    it(
        'resolver encontra case-insensitive, cria quando não existe, e RLS isola donos',
        { timeout: 30_000 },
        async () => {
            const { resolverProjetoCom, listarProjetosCom } =
                await import('@/modules/projetos/projetos.service');
            const criado = await resolverProjetoCom(alice, 'CRMCredito');
            const mesmo = await resolverProjetoCom(alice, 'crmcredito');
            expect(mesmo.id).toBe(criado.id);

            // O Bruno não vê os projetos da Alice; o resolve dele cria o DELE.
            const doBruno = await resolverProjetoCom(bruno, 'crmcredito');
            expect(doBruno.id).not.toBe(criado.id);
            const projetosBruno = await listarProjetosCom(bruno);
            expect(projetosBruno.map((p) => p.id)).not.toContain(criado.id);
        },
    );

    it(
        'tarefas ancoram a projetos reais; sem nome cai no Pessoal',
        { timeout: 30_000 },
        async () => {
            const { criarTarefaCom } = await import('@/modules/tarefas/tarefas.service');
            const comProjeto = await criarTarefaCom(alice, {
                titulo: 'Testar emails',
                projeto: 'crmcredito',
                prioridade: 'alta',
                visibility: 'privado',
            });
            expect(comProjeto.projetoId).not.toBeNull();
            expect(comProjeto.projeto).toBe('CRMCredito'); // o nome canónico do projeto, não a grafia do input

            const semProjeto = await criarTarefaCom(alice, {
                titulo: 'Marcar dentista',
                prioridade: 'normal',
                visibility: 'privado',
            });
            expect(semProjeto.projeto).toBe('Pessoal');
        },
    );
});
