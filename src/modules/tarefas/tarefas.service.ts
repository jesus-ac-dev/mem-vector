import type { SupabaseClient } from '@supabase/supabase-js';

import type { EstadoTarefa, NovaTarefa, Tarefa } from './tarefas.schema';
import { ESTADOS_TAREFA } from './tarefas.schema';
import { createClient } from '@/lib/supabase/server';
import { acrescentarAoDailyCom } from '@/modules/daily/daily.service';
import { horaLisboa } from '@/modules/daily/daily.capture';

// O "serviço" da feature: dados + regras numa peça. Liga ao Supabase com o
// cliente autenticado → a RLS garante que cada user só vê/cria as suas tarefas.
// Variantes `...Com` recebem o cliente (scripts/evals/agente); as outras são
// conveniência de Server Actions.

const COLUNAS =
    'id, titulo, estado, prioridade, projeto, descricao, depende_de, created_at, concluida_em';

interface TarefaRow {
    id: string;
    titulo: string;
    estado: EstadoTarefa;
    prioridade: Tarefa['prioridade'];
    projeto: string | null;
    descricao: string | null;
    depende_de: string | null;
    created_at: string;
    concluida_em: string | null;
}

function toTarefa(r: TarefaRow): Tarefa {
    return {
        id: r.id,
        titulo: r.titulo,
        estado: r.estado,
        prioridade: r.prioridade,
        projeto: r.projeto,
        descricao: r.descricao,
        dependeDe: r.depende_de,
        criadaEm: r.created_at,
        concluidaEm: r.concluida_em,
    };
}

export async function listarTarefasAbertasCom(db: SupabaseClient): Promise<Tarefa[]> {
    const { data, error } = await db
        .from('tarefas')
        .select(COLUNAS)
        .neq('estado', 'terminado')
        .order('created_at', { ascending: false });
    if (error) throw new Error(`listar tarefas abertas falhou: ${error.message}`);
    return ((data ?? []) as TarefaRow[]).map(toTarefa);
}

export async function listarTarefasConcluidasCom(
    db: SupabaseClient,
    limite = 50,
): Promise<Tarefa[]> {
    const { data, error } = await db
        .from('tarefas')
        .select(COLUNAS)
        .eq('estado', 'terminado')
        .order('concluida_em', { ascending: false })
        .limit(limite);
    if (error) throw new Error(`listar tarefas concluídas falhou: ${error.message}`);
    return ((data ?? []) as TarefaRow[]).map(toTarefa);
}

export async function criarTarefaCom(db: SupabaseClient, input: NovaTarefa): Promise<Tarefa> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    // Dependência tem de ser visível a quem cria (audit #21): uma dep privada
    // de outro dono seria escondida pela RLS na conclusão e o bloqueio ficava
    // invisível — recusa-se à entrada.
    if (input.dependeDe) {
        const { data: dep } = await db
            .from('tarefas')
            .select('id')
            .eq('id', input.dependeDe)
            .maybeSingle();
        if (!dep) throw new Error('dependência inválida: tarefa não encontrada');
    }

    const { data, error } = await db
        .from('tarefas')
        .insert({
            titulo: input.titulo,
            projeto: input.projeto ?? null,
            prioridade: input.prioridade ?? 'normal',
            descricao: input.descricao ?? null,
            depende_de: input.dependeDe ?? null,
            owner_id: user.id,
            visibility: input.visibility ?? 'privado',
            group_id: input.visibility === 'protected' ? input.groupId : null,
        })
        .select(COLUNAS)
        .single();
    if (error || !data) throw new Error(`criar tarefa falhou: ${error?.message ?? 'sem dados'}`);
    return toTarefa(data as TarefaRow);
}

// Mudar de coluna no kanban. A passagem a 'terminado' vai SEMPRE pelo
// concluirTarefaCom (valida dependência bloqueante + daily) — aqui recusa-se.
export async function mudarEstadoTarefaCom(
    db: SupabaseClient,
    id: string,
    estado: Exclude<EstadoTarefa, 'terminado'>,
): Promise<Tarefa> {
    if (!ESTADOS_TAREFA.includes(estado) || (estado as EstadoTarefa) === 'terminado') {
        throw new Error('estado inválido (concluir vai pelo concluirTarefa)');
    }
    // Terminada não se reabre por aqui (audit #21): protegia-se o concluida_em
    // de ser apagado por um membro do grupo; reabrir será feature deliberada.
    const { data, error } = await db
        .from('tarefas')
        .update({ estado })
        .eq('id', id)
        .neq('estado', 'terminado')
        .select(COLUNAS)
        .single();
    if (error || !data)
        throw new Error(
            `mudar estado falhou (terminada não se reabre): ${error?.message ?? 'sem dados'}`,
        );
    return toTarefa(data as TarefaRow);
}

// Conclusão (#21): RPC valida a dependência bloqueante; a conclusão — e só
// ela — fica registada no daily (decisão do Carlos: a criação não vai, a data
// de criação já vive na tarefa).
export async function concluirTarefaCom(db: SupabaseClient, id: string): Promise<Tarefa> {
    const { data, error } = await db.rpc('concluir_tarefa', { p_id: id }).single();
    if (error || !data) throw new Error(`concluir tarefa falhou: ${error?.message ?? 'sem dados'}`);
    const row = data as { id: string; titulo: string; concluida_em: string };

    try {
        await acrescentarAoDailyCom(
            db,
            `### ${horaLisboa()}\n- ✅ Tarefa concluída: ${row.titulo}`,
        );
    } catch (e) {
        console.error('daily da conclusão falhou (tarefa concluída na mesma):', e);
    }

    const { data: full, error: e2 } = await db
        .from('tarefas')
        .select(COLUNAS)
        .eq('id', row.id)
        .single();
    if (e2 || !full) throw new Error(`ler tarefa concluída falhou: ${e2?.message ?? 'sem dados'}`);
    return toTarefa(full as TarefaRow);
}

// Apagar mesmo (decisão do Carlos: arrastar tarefa para o Archive APAGA —
// tarefas não têm a semântica de arquivo das notas).
export async function apagarTarefaCom(db: SupabaseClient, id: string): Promise<void> {
    const { error } = await db.from('tarefas').delete().eq('id', id);
    if (error) throw new Error(`apagar tarefa falhou: ${error.message}`);
}

// ── Conveniência para Server Actions / Server Components ──
export async function listarTarefas(): Promise<Tarefa[]> {
    return listarTarefasAbertasCom(await createClient());
}

export async function criarTarefa(input: NovaTarefa): Promise<Tarefa> {
    return criarTarefaCom(await createClient(), input);
}
