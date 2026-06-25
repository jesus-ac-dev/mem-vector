import type { SupabaseClient } from '@supabase/supabase-js';

import type { EstadoTarefa, NovaTarefa, Tarefa } from './tarefas.schema';
import { ESTADOS_TAREFA, ordenarTarefasAbertas } from './tarefas.schema';
import { createClient } from '@/lib/supabase/server';
import { acrescentarAoDailyCom } from '@/modules/daily/daily.service';
import { horaLisboa } from '@/modules/daily/daily.capture';
import { resolverProjetoCom } from '@/modules/projetos/projetos.service';
import type { Projeto } from '@/modules/projetos/projetos.schema';

// Payload do painel de tarefas (sidebar esquerda + kanban), servido por
// `GET /api/tarefas-painel` (#73) e consumido pelos dois clientes.
export interface PainelTarefas {
    abertas: Tarefa[];
    concluidas: Tarefa[];
    projetos: Projeto[];
}

// O "serviço" da feature: dados + regras numa peça. Liga ao Supabase com o
// cliente autenticado → a RLS garante que cada user só vê/cria as suas tarefas.
// Variantes `...Com` recebem o cliente (scripts/evals/agente); as outras são
// conveniência de Server Actions.

// #47: o projeto é um FK real; o nome vem por join (display/serializar).
const COLUNAS =
    'id, titulo, estado, prioridade, projeto_id, projetos ( nome ), descricao, depende_de, data_fim, created_at, concluida_em, repo_github, issue_github, relay_estado, relay_fase, relay_pr_url';

interface TarefaRow {
    id: string;
    titulo: string;
    estado: EstadoTarefa;
    prioridade: Tarefa['prioridade'];
    projeto_id: string | null;
    projetos: { nome: string } | null;
    descricao: string | null;
    depende_de: string | null;
    data_fim: string | null;
    created_at: string;
    concluida_em: string | null;
    repo_github: string | null;
    issue_github: number | null;
    relay_estado: string | null;
    relay_fase: string | null;
    relay_pr_url: string | null;
}

function toTarefa(r: TarefaRow): Tarefa {
    return {
        id: r.id,
        titulo: r.titulo,
        estado: r.estado,
        prioridade: r.prioridade,
        projetoId: r.projeto_id,
        projeto: r.projetos?.nome ?? null,
        descricao: r.descricao,
        dependeDe: r.depende_de,
        dataFim: r.data_fim,
        criadaEm: r.created_at,
        concluidaEm: r.concluida_em,
        repoGithub: r.repo_github,
        issueGithub: r.issue_github,
        relayEstado: r.relay_estado,
        relayFase: r.relay_fase,
        relayPrUrl: r.relay_pr_url,
    };
}

// Vista kanban segue o relay: o orchestrator escreve semáforo, fase, PR e coluna
// no cartão ligado à issue. Best-effort (a verdade é a issue) — não lança.
export async function atualizarRelayPorIssueCom(
    db: SupabaseClient,
    repo: string,
    issue: number,
    campos: {
        relayEstado?: string;
        relayFase?: string | null;
        relayPrUrl?: string | null;
        estado?: Exclude<EstadoTarefa, 'terminado'>;
    },
): Promise<void> {
    const update: Record<string, string | null> = {};
    if (campos.relayEstado !== undefined) update.relay_estado = campos.relayEstado;
    if (campos.relayFase !== undefined) update.relay_fase = campos.relayFase;
    if (campos.relayPrUrl !== undefined) update.relay_pr_url = campos.relayPrUrl;
    if (campos.estado !== undefined) update.estado = campos.estado;
    if (Object.keys(update).length === 0) return;
    // #M7-D: cada progresso do relay bate o heartbeat — o sweeper deteta órfãos
    // (crashados) por este timestamp ficar congelado.
    update.relay_heartbeat = new Date().toISOString();
    const { error } = await db
        .from('tarefas')
        .update(update)
        .eq('repo_github', repo)
        .eq('issue_github', issue);
    if (error) console.error('atualizar relay no cartão falhou (segue):', error.message);
}

// #M7-D: durabilidade — detetar relays órfãos (crashados; heartbeat congelado).
// Conservador de propósito: o heartbeat bate por FASE (não por ronda/spawn), e uma
// fase pode chegar a ~maxRondas × providers × RELAY_REPO_TIMEOUT_MS (até ~120min no
// pior caso, com tudo a esgotar o timeout). A janela TEM de exceder isso, senão
// marca um relay vivo como órfão (falso-positivo = bolinha de erro num relay a
// correr). Custo: deteção lenta. Hardening futuro = heartbeat por-spawn (rápido).
const JANELA_ORFAO_MS = 120 * 60 * 1000;

// Puro: um relay 'processando' é órfão se o heartbeat é null (não seguido — relay
// crashado, ou o caso raro de um relay anterior a esta migration) ou mais velho que
// a janela (o processo morreu e parou de o bater).
export function relayEstaOrfao(
    heartbeat: string | null,
    agoraMs: number,
    janelaMs: number,
): boolean {
    if (heartbeat === null) return true;
    const ts = Date.parse(heartbeat);
    if (Number.isNaN(ts)) return true;
    return ts < agoraMs - janelaMs;
}

// Sweeper: marca os relays 'processando' órfãos como bloqueado (→ bolinha de erro →
// recuperação pela fatia [C]). NÃO auto-resume — o humano é o juiz. Disparado no
// load do kanban. Devolve quantos marcou.
export async function varrerRelaysOrfaosCom(db: SupabaseClient): Promise<number> {
    const { data, error } = await db
        .from('tarefas')
        .select('repo_github, issue_github, relay_heartbeat')
        .eq('relay_estado', 'processando');
    if (error) {
        console.error('varrer relays órfãos falhou (segue):', error.message);
        return 0;
    }
    const agora = Date.now();
    let marcados = 0;
    for (const t of (data ?? []) as {
        repo_github: string | null;
        issue_github: number | null;
        relay_heartbeat: string | null;
    }[]) {
        if (!t.repo_github || !t.issue_github) continue;
        if (!relayEstaOrfao(t.relay_heartbeat, agora, JANELA_ORFAO_MS)) continue;
        // Atualização condicional: se um relay vivo bateu heartbeat entre o SELECT
        // e este UPDATE, não o marcamos bloqueado com uma leitura antiga.
        let q = db
            .from('tarefas')
            .update(
                {
                    relay_estado: 'bloqueado',
                    relay_fase: 'órfão',
                    relay_heartbeat: new Date().toISOString(),
                },
                { count: 'exact' },
            )
            .eq('repo_github', t.repo_github)
            .eq('issue_github', t.issue_github)
            .eq('relay_estado', 'processando');
        q =
            t.relay_heartbeat === null
                ? q.is('relay_heartbeat', null)
                : q.eq('relay_heartbeat', t.relay_heartbeat);
        const { count, error: updateError } = await q;
        if (updateError) {
            console.error('marcar relay órfão falhou (segue):', updateError.message);
            continue;
        }
        marcados += count ?? 0;
    }
    return marcados;
}

// Espelho de leitura do atualizarRelayPorIssueCom: o estado do relay de um cartão
// ligado, por (repo, issue). null = não há cartão ligado a essa issue.
export async function relayEstadoPorIssueCom(
    db: SupabaseClient,
    repo: string,
    issue: number,
): Promise<{
    estado: string | null;
    relayEstado: string | null;
    relayFase: string | null;
    relayPrUrl: string | null;
} | null> {
    const { data, error } = await db
        .from('tarefas')
        .select('estado, relay_estado, relay_fase, relay_pr_url')
        .eq('repo_github', repo)
        .eq('issue_github', issue)
        .maybeSingle();
    if (error) throw new Error(`ler estado do relay falhou: ${error.message}`);
    if (!data) return null;
    return {
        estado: data.estado ?? null,
        relayEstado: data.relay_estado ?? null,
        relayFase: data.relay_fase ?? null,
        relayPrUrl: data.relay_pr_url ?? null,
    };
}

export async function atualizarRelayEstadoPorIssueCom(
    db: SupabaseClient,
    repo: string,
    issue: number,
    estado: string,
): Promise<void> {
    await atualizarRelayPorIssueCom(db, repo, issue, { relayEstado: estado });
}

// Liga o cartão a uma issue (a promoção): grava repo + número. Só o dono (RLS).
export async function ligarIssueTarefaCom(
    db: SupabaseClient,
    id: string,
    repo: string,
    issue: number,
): Promise<Tarefa> {
    const { data, error } = await db
        .from('tarefas')
        .update({ repo_github: repo, issue_github: issue })
        .eq('id', id)
        .select(COLUNAS)
        .single();
    if (error || !data) throw new Error(`ligar issue à tarefa falhou: ${error?.message ?? '?'}`);
    return toTarefa(data as unknown as TarefaRow);
}

export async function getTarefaCom(db: SupabaseClient, id: string): Promise<Tarefa | null> {
    const { data, error } = await db.from('tarefas').select(COLUNAS).eq('id', id).maybeSingle();
    if (error) throw new Error(`ler tarefa falhou: ${error.message}`);
    return data ? toTarefa(data as unknown as TarefaRow) : null;
}

// Dedup do import de issues: já há cartão ligado a esta (repo, issue)? Só o dono (RLS).
export async function tarefaPorIssueCom(
    db: SupabaseClient,
    repo: string,
    issue: number,
): Promise<Tarefa | null> {
    const { data, error } = await db
        .from('tarefas')
        .select(COLUNAS)
        .eq('repo_github', repo)
        .eq('issue_github', issue)
        .maybeSingle();
    if (error) throw new Error(`procurar tarefa por issue falhou: ${error.message}`);
    return data ? toTarefa(data as unknown as TarefaRow) : null;
}

// Importa uma issue do GitHub como cartão de código (ligado, com o estado já mapeado
// do estado da issue). Insere direto (estado explícito, sem passar por backlog).
export async function criarTarefaDeIssueCom(
    db: SupabaseClient,
    input: { titulo: string; projeto: string; repo: string; issue: number; estado: EstadoTarefa },
): Promise<Tarefa> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const projeto = await resolverProjetoCom(db, input.projeto);
    const { data, error } = await db
        .from('tarefas')
        .insert({
            titulo: input.titulo,
            projeto_id: projeto.id,
            prioridade: 'normal',
            estado: input.estado,
            owner_id: user.id,
            visibility: 'privado',
            repo_github: input.repo,
            issue_github: input.issue,
            // Issue fechada entra como terminada com data — não reaparece como trabalho.
            concluida_em: input.estado === 'terminado' ? new Date().toISOString() : null,
        })
        .select(COLUNAS)
        .single();
    if (error || !data) {
        throw new Error(`criar tarefa de issue falhou: ${error?.message ?? 'sem dados'}`);
    }
    return toTarefa(data as unknown as TarefaRow);
}

export async function listarTarefasAbertasCom(db: SupabaseClient): Promise<Tarefa[]> {
    const { data, error } = await db
        .from('tarefas')
        .select(COLUNAS)
        .neq('estado', 'terminado')
        .order('created_at', { ascending: false });
    if (error) throw new Error(`listar tarefas abertas falhou: ${error.message}`);
    // Ordem do painel (#51): data fim → prioridade → estado desc do kanban.
    return ordenarTarefasAbertas(((data ?? []) as unknown as TarefaRow[]).map(toTarefa));
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
    return ((data ?? []) as unknown as TarefaRow[]).map(toTarefa);
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

    // #47: o nome resolve sempre para um projeto real — encontra, cria, ou
    // cai no Pessoal quando não vem nome (toda a tarefa pertence a um projeto).
    const projeto = await resolverProjetoCom(db, input.projeto);

    const { data, error } = await db
        .from('tarefas')
        .insert({
            titulo: input.titulo,
            projeto_id: projeto.id,
            prioridade: input.prioridade ?? 'normal',
            descricao: input.descricao ?? null,
            depende_de: input.dependeDe ?? null,
            data_fim: input.dataFim ?? null,
            owner_id: user.id,
            visibility: input.visibility ?? 'privado',
            group_id: input.visibility === 'protected' ? input.groupId : null,
        })
        .select(COLUNAS)
        .single();
    if (error || !data) throw new Error(`criar tarefa falhou: ${error?.message ?? 'sem dados'}`);
    return toTarefa(data as unknown as TarefaRow);
}

// Edição pelo quick-add (#55): reescreve os campos dos tokens; terminadas não
// se editam (coerente com mudarEstado — reabrir/alterar histórico é feature
// deliberada, não efeito colateral).
export async function atualizarTarefaCom(
    db: SupabaseClient,
    id: string,
    campos: {
        titulo: string;
        projeto: string | null;
        prioridade: Tarefa['prioridade'];
        dataFim: string | null;
        descricao: string | null;
    },
): Promise<Tarefa> {
    // #47: sem nome re-ancora no Pessoal — uma tarefa nunca fica sem projeto.
    const projeto = await resolverProjetoCom(db, campos.projeto);
    const { data, error } = await db
        .from('tarefas')
        .update({
            titulo: campos.titulo,
            projeto_id: projeto.id,
            prioridade: campos.prioridade,
            data_fim: campos.dataFim,
            descricao: campos.descricao,
        })
        .eq('id', id)
        .neq('estado', 'terminado')
        .select(COLUNAS)
        .single();
    if (error || !data)
        throw new Error(
            `atualizar tarefa falhou (terminada não se edita): ${error?.message ?? 'sem dados'}`,
        );
    return toTarefa(data as unknown as TarefaRow);
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
    return toTarefa(data as unknown as TarefaRow);
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
    return toTarefa(full as unknown as TarefaRow);
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
