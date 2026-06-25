import type { Tarefa } from '@/modules/tarefas/tarefas.schema';
import { motivoBloqueio } from '@/modules/relay/relay.motivo';

const FASE_LABEL: Record<string, string> = {
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
