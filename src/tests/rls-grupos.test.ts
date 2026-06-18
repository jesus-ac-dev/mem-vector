// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function userClient(email: string, password: string) {
    const admin = getSupabaseAdmin();
    const { error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });
    if (createErr && !createErr.message.includes('already been registered')) throw createErr;
    const c = createAnonClient(URL, ANON);
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return c;
}
const uid = async (c: Awaited<ReturnType<typeof userClient>>) =>
    (await c.auth.getUser()).data.user!.id;

describe('RLS protected colaborativo (grupos)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let bob: Awaited<ReturnType<typeof userClient>>;
    let carol: Awaited<ReturnType<typeof userClient>>;
    let aliceId: string;
    let grupoId: string;
    let tarefaId: string;

    beforeAll(async () => {
        alice = await userClient('alice-grp@test.local', 'pw-a-123');
        bob = await userClient('bob-grp@test.local', 'pw-b-123');
        carol = await userClient('carol-grp@test.local', 'pw-c-123');
        aliceId = await uid(alice);
        const bobId = await uid(bob);

        // Alice cria o grupo (criar_grupo adiciona-a como membro); Bob entra
        // (na vida real via convite).
        const grupo = await alice.rpc('criar_grupo', { p_nome: 'equipa' });
        if (grupo.error || !grupo.data) throw grupo.error ?? new Error('sem grupo');
        grupoId = (grupo.data as { id: string }).id;
        const join = await bob.from('grupo_membros').insert({ grupo_id: grupoId, user_id: bobId });
        if (join.error) throw join.error;

        // Alice cria uma tarefa PROTECTED ao grupo.
        const t = await alice
            .from('tarefas')
            .insert({
                titulo: 'partilhada',
                owner_id: aliceId,
                visibility: 'protected',
                group_id: grupoId,
            })
            .select('id')
            .single();
        if (t.error || !t.data) throw t.error ?? new Error('sem tarefa');
        tarefaId = t.data.id as string;
    });

    it('membro do grupo VÊ a tarefa protected', async () => {
        const { data } = await bob.from('tarefas').select('titulo').eq('id', tarefaId);
        expect(data?.length).toBe(1);
    });

    it('membro do grupo EDITA a tarefa protected', async () => {
        // #21: `feita` deu lugar a `estado` (kanban) — a edição colaborativa testa-se igual.
        const upd = await bob
            .from('tarefas')
            .update({ estado: 'desenvolvimento' })
            .eq('id', tarefaId);
        expect(upd.error).toBeNull();
        const { data } = await bob.from('tarefas').select('estado').eq('id', tarefaId).single();
        expect(data?.estado).toBe('desenvolvimento');
    });

    it('membro do grupo CONCLUI tarefa protected pelo serviço', { timeout: 30_000 }, async () => {
        const t = await alice
            .from('tarefas')
            .insert({
                titulo: 'fechar partilhada',
                owner_id: aliceId,
                visibility: 'protected',
                group_id: grupoId,
            })
            .select('id')
            .single();
        if (t.error || !t.data) throw t.error ?? new Error('sem tarefa');

        const { concluirTarefaCom } = await import('@/modules/tarefas/tarefas.service');
        const concluida = await concluirTarefaCom(bob, t.data.id as string);
        expect(concluida.estado).toBe('terminado');
        expect(concluida.concluidaEm).not.toBeNull();
    });

    it('membro do grupo NÃO apaga (só o dono)', async () => {
        await bob.from('tarefas').delete().eq('id', tarefaId);
        // RLS de delete (só dono) → 0 linhas afetadas; a tarefa continua a existir.
        const { data } = await alice.from('tarefas').select('id').eq('id', tarefaId);
        expect(data?.length).toBe(1);
    });

    it('não-membro NÃO vê a tarefa protected', async () => {
        const { data } = await carol.from('tarefas').select('id').eq('id', tarefaId);
        expect(data?.length).toBe(0);
    });
});

describe('fluxo de convites (o que os actions fazem)', () => {
    it('convidar → aceitar → membro → acesso ao protected', async () => {
        const alice = await userClient('alice-conv@test.local', 'pw-a-123');
        const dave = await userClient('dave-conv@test.local', 'pw-d-123');
        const aliceId = await uid(alice);
        const daveId = await uid(dave);

        // Alice cria grupo + tarefa protected.
        const grupo = await alice.rpc('criar_grupo', { p_nome: 'projeto' });
        const grupoId = (grupo.data as { id: string }).id;
        await alice.from('tarefas').insert({
            titulo: 'doc do projeto',
            owner_id: aliceId,
            visibility: 'protected',
            group_id: grupoId,
        });

        // Antes de aceitar, Dave NÃO vê.
        const antes = await dave.from('tarefas').select('id').eq('group_id', grupoId);
        expect(antes.data?.length ?? 0).toBe(0);

        // Alice convida o email do Dave.
        const conv = await alice
            .from('grupo_convites')
            .insert({ grupo_id: grupoId, email: 'dave-conv@test.local', convidado_por: aliceId })
            .select('id')
            .single();
        expect(conv.error).toBeNull();

        // Dave vê o convite (RLS: para o meu email).
        const visto = await dave
            .from('grupo_convites')
            .select('id, grupo_id')
            .eq('id', conv.data!.id)
            .single();
        expect(visto.data?.grupo_id).toBe(grupoId);

        // Dave aceita (entra como membro).
        const entrada = await dave
            .from('grupo_membros')
            .insert({ grupo_id: grupoId, user_id: daveId });
        expect(entrada.error).toBeNull();

        // Agora Dave VÊ a tarefa protected.
        const depois = await dave.from('tarefas').select('titulo').eq('group_id', grupoId);
        expect(depois.data?.length).toBe(1);
    });
});
