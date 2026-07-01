import type { Tarefa } from '@/modules/tarefas/tarefas.schema';
import type { EventoRelayLido } from '@/modules/relay/relay.eventos';
import { motivoBloqueio } from '@/modules/relay/relay.motivo';

export const FASE_LABEL: Record<string, string> = {
    analise: 'Análise',
    dev: 'Desenvolvimento',
    testes: 'Testes',
    docs: 'Documentação',
    auditoria: 'Auditoria',
    pr: 'PR',
    erro: 'Erro',
};

function issueUrl(tarefa: Pick<Tarefa, 'repoGithub' | 'issueGithub'>): string | null {
    if (!tarefa.repoGithub || !tarefa.issueGithub) return null;
    return `https://github.com/${tarefa.repoGithub}/issues/${tarefa.issueGithub}`;
}

export function promptKillSwitchRelay(tarefa: Tarefa, repoPath: string | null): string {
    const fase = tarefa.relayFase
        ? (FASE_LABEL[tarefa.relayFase] ?? tarefa.relayFase)
        : 'fase desconhecida';
    const motivo = motivoBloqueio(tarefa.relayFase);
    const linhas = [
        `Quero recuperar o kill-switch do relay desta tarefa.`,
        '',
        `Tarefa: ${tarefa.titulo}`,
        `Projeto: ${tarefa.projeto ? `#${tarefa.projeto}` : '(sem projeto)'}`,
        `Repo: ${tarefa.repoGithub ?? '(sem repo)'}`,
        `Issue: ${tarefa.issueGithub ? `#${tarefa.issueGithub}` : '(sem issue)'}`,
        `Fase bloqueada: ${fase}`,
        `Motivo provável (${motivo.codigo}): ${motivo.descricao}`,
        `Estado relay: ${tarefa.relayEstado ?? '(sem estado)'}`,
    ];

    const urlIssue = issueUrl(tarefa);
    if (urlIssue) linhas.push(`Link issue: ${urlIssue}`);
    if (tarefa.relayPrUrl) linhas.push(`Link PR: ${tarefa.relayPrUrl}`);
    if (repoPath) linhas.push(`Working copy local: ${repoPath}`);
    if (tarefa.descricao?.trim())
        linhas.push('', `Descrição da tarefa:\n${tarefa.descricao.trim()}`);

    linhas.push(
        '',
        'Ajuda-me a perceber porque bloqueou, que informação falta, e qual é a próxima ação mínima para retomar esta fase sem reiniciar o trabalho.',
    );

    return linhas.join('\n');
}

// ——— Timeline da corrida (#129): lógica pura do modal do double-click ———

export interface RunAgrupado {
    runId: string;
    eventos: EventoRelayLido[];
}

// Agrupa a timeline (já cronológica) por corrida — eventos consecutivos do mesmo
// run_id. A última corrida fica no fim (a UI destaca-a e colapsa as anteriores).
export function agruparEventosPorRun(eventos: EventoRelayLido[]): RunAgrupado[] {
    const runs: RunAgrupado[] = [];
    for (const e of eventos) {
        const ultimo = runs.at(-1);
        if (ultimo && ultimo.runId === e.runId) ultimo.eventos.push(e);
        else runs.push({ runId: e.runId, eventos: [e] });
    }
    return runs;
}

// Custo somado dos passos de uma corrida (estimado se algum passo o for).
export function custoDosEventos(eventos: EventoRelayLido[]): {
    total: number;
    estimado: boolean;
} {
    let total = 0;
    let estimado = false;
    for (const e of eventos) {
        if (e.tipo === 'passo' && typeof e.custoUsd === 'number') {
            total += e.custoUsd;
            if (e.custoEstimado) estimado = true;
        }
    }
    return { total, estimado };
}

export function formatarCusto(total: number, estimado: boolean): string {
    return `${estimado ? '~' : ''}$${total.toFixed(2)}`;
}

export function formatarDuracao(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

// O rótulo "quem/o quê" de cada evento na timeline.
export function rotuloEvento(e: EventoRelayLido): string {
    if (e.tipo === 'passo') return `${e.provider ?? '?'} · ${e.papel ?? 'passo'}`;
    if (e.tipo === 'testes') return 'test-gate';
    if (e.tipo === 'steering') return 'humano · steering';
    if (e.tipo === 'transicao') return 'transição';
    return 'fim';
}
