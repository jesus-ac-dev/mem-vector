// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
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

// #21: tarefas com kanban — criação, dependência bloqueante, conclusão→daily, apagar.
describe('tarefas kanban (#21, integração RLS)', () => {
    let alice: Awaited<ReturnType<typeof userClient>>;
    let aliceId: string;

    beforeAll(async () => {
        alice = await userClient('alice-tarefas@test.local', 'pw-alice-123');
        aliceId = (await alice.auth.getUser()).data.user!.id;
        const admin = getSupabaseAdmin();
        await admin.from('tarefas').delete().eq('owner_id', aliceId);
    });

    it(
        'cria com defaults, muda de estado, e a dependência BLOQUEIA a conclusão',
        { timeout: 30_000 },
        async () => {
            const { criarTarefaCom, mudarEstadoTarefaCom, concluirTarefaCom } =
                await import('@/modules/tarefas/tarefas.service');
            const base = await criarTarefaCom(alice, {
                titulo: 'Preparar proposta',
                projeto: 'zeta',
                prioridade: 'alta',
                visibility: 'privado',
            });
            expect(base.estado).toBe('backlog');

            const dependente = await criarTarefaCom(alice, {
                titulo: 'Enviar proposta',
                dependeDe: base.id,
                prioridade: 'normal',
                visibility: 'privado',
            });

            const movida = await mudarEstadoTarefaCom(alice, dependente.id, 'desenvolvimento');
            expect(movida.estado).toBe('desenvolvimento');

            // bloqueada: a base ainda não está terminada
            await expect(concluirTarefaCom(alice, dependente.id)).rejects.toThrow(/bloqueada/);

            // concluir a base desbloqueia
            await concluirTarefaCom(alice, base.id);
            const concluida = await concluirTarefaCom(alice, dependente.id);
            expect(concluida.estado).toBe('terminado');
            expect(concluida.concluidaEm).not.toBeNull();
        },
    );

    it('a conclusão escreve no daily; a criação não', { timeout: 30_000 }, async () => {
        const { criarTarefaCom, concluirTarefaCom } =
            await import('@/modules/tarefas/tarefas.service');
        const { getDailyCom, hojeLisboa } = await import('@/modules/daily/daily.service');

        const tituloUnico = `Ligar ao contabilista ${randomUUID().slice(0, 6)}`;
        const t = await criarTarefaCom(alice, {
            titulo: tituloUnico,
            prioridade: 'normal',
            visibility: 'privado',
        });
        const antes = await getDailyCom(alice, hojeLisboa());
        expect(antes?.contentMd ?? '').not.toContain(tituloUnico);

        await concluirTarefaCom(alice, t.id);
        const depois = await getDailyCom(alice, hojeLisboa());
        expect(depois?.contentMd).toContain(`✅ Tarefa concluída: ${tituloUnico}`);
    });

    it('apagar apaga mesmo (drag para o Archive = delete)', async () => {
        const { criarTarefaCom, apagarTarefaCom, listarTarefasAbertasCom } =
            await import('@/modules/tarefas/tarefas.service');
        const t = await criarTarefaCom(alice, {
            titulo: 'Tarefa descartável',
            prioridade: 'baixa',
            visibility: 'privado',
        });
        await apagarTarefaCom(alice, t.id);
        const abertas = await listarTarefasAbertasCom(alice);
        expect(abertas.map((x) => x.id)).not.toContain(t.id);
    });

    it('atualizar (#55) edita campos e limpa os removidos', { timeout: 30_000 }, async () => {
        const { criarTarefaCom, atualizarTarefaCom } =
            await import('@/modules/tarefas/tarefas.service');
        const t = await criarTarefaCom(alice, {
            titulo: 'Rever proposta',
            projeto: 'zeta',
            prioridade: 'alta',
            dataFim: '2026-06-20',
            visibility: 'privado',
        });
        const editada = await atualizarTarefaCom(alice, t.id, {
            titulo: 'Rever proposta final',
            projeto: null, // sem nome re-ancora no Pessoal (#47) — tarefa nunca fica sem projeto
            prioridade: 'normal',
            dataFim: '2026-06-14',
            descricao: 'antes da reunião',
        });
        expect(editada.titulo).toBe('Rever proposta final');
        expect(editada.projeto).toBe('Pessoal');
        expect(editada.prioridade).toBe('normal');
        expect(editada.dataFim).toBe('2026-06-14');
        expect(editada.descricao).toBe('antes da reunião');
        expect(editada.estado).toBe(t.estado); // a edição não mexe no kanban
    });
});
