import type { NovaTarefa, Tarefa } from './tarefas.schema';
import { createClient } from '@/lib/supabase/server';

// O "serviço" da feature: dados + regras numa peça. Liga ao Supabase com o
// cliente autenticado → a RLS garante que cada user só vê/cria as suas tarefas.

interface TarefaRow {
    id: string;
    titulo: string;
    feita: boolean;
    created_at: string;
}

function toTarefa(r: TarefaRow): Tarefa {
    return { id: r.id, titulo: r.titulo, feita: r.feita, criadaEm: r.created_at };
}

export async function listarTarefas(): Promise<Tarefa[]> {
    const db = await createClient();
    const { data, error } = await db
        .from('tarefas')
        .select('id, titulo, feita, created_at')
        .order('created_at', { ascending: false });
    if (error) throw new Error(`listar tarefas falhou: ${error.message}`);
    return (data ?? []).map(toTarefa);
}

export async function criarTarefa(input: NovaTarefa): Promise<Tarefa> {
    const db = await createClient();
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { data, error } = await db
        .from('tarefas')
        .insert({ titulo: input.titulo, owner_id: user.id })
        .select('id, titulo, feita, created_at')
        .single();
    if (error || !data) throw new Error(`criar tarefa falhou: ${error?.message ?? 'sem dados'}`);
    return toTarefa(data as TarefaRow);
}
