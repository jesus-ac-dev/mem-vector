'use server';

import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { lerDefinicoesServidorCom } from '@/modules/definicoes/definicoes.service';
import type { DefinicoesServidor } from '@/modules/definicoes/definicoes.schema';
import { criarIssue, comentarIssue, editarLabels, numeroDoUrl, verIssue } from '@/lib/github';
import {
    atualizarRelayEstadoPorIssueCom,
    getTarefaCom,
    ligarIssueTarefaCom,
} from '@/modules/tarefas/tarefas.service';

import { orquestrar, SEMAFORO_LABEL } from './relay.orchestrator';
import { providersAtivos } from './relay.resolver';

// Lock de um-relay-por-repo (working copy partilhado): dois disparos no mesmo
// path pisavam-se. Um Set em memória trava o segundo até o primeiro terminar.
const relaysAtivos = new Set<string>();

type DefsValidadas =
    | { erro: string }
    | { db: SupabaseClient; defs: DefinicoesServidor; path: string };

async function defsValidadas(repo: string): Promise<DefsValidadas> {
    const db = await createClient();
    const defs = await lerDefinicoesServidorCom(db);
    if (!defs.githubToken) return { erro: 'Sem token GitHub (Definições > módulo GitHub).' };
    const ligado = defs.githubRepos.find((r) => r.repo === repo);
    if (!ligado?.path) return { erro: `Repo "${repo}" sem path local — corre o Testar primeiro.` };
    return { db, defs, path: ligado.path };
}

async function marcarFalhaRelay(opts: {
    db: SupabaseClient;
    token: string;
    repo: string;
    issue: number;
    erro: unknown;
}): Promise<void> {
    const detalhe = opts.erro instanceof Error ? opts.erro.message : String(opts.erro);
    try {
        await editarLabels(opts.token, {
            repo: opts.repo,
            number: opts.issue,
            add: [SEMAFORO_LABEL.bloqueado],
            remove: [SEMAFORO_LABEL.processando, SEMAFORO_LABEL.pronto],
        });
    } catch (e) {
        console.error('[relay] marcar 🔴 falhou:', e);
    }
    try {
        await comentarIssue(opts.token, {
            repo: opts.repo,
            number: opts.issue,
            body:
                '🔴 Relay falhou antes de concluir.\n\n' +
                `Erro:\n\`\`\`\n${detalhe.slice(0, 2000)}\n\`\`\``,
        });
    } catch (e) {
        console.error('[relay] comentar falha falhou:', e);
    }
    await atualizarRelayEstadoPorIssueCom(opts.db, opts.repo, opts.issue, 'bloqueado');
}

// Trigger do relay: dispara o pipeline para uma (repo, issue). Valida cedo, trava
// disparos concorrentes no mesmo repo, e corre o orchestrator em BACKGROUND
// (after) — fire-and-forget. O estado/progresso vive na ISSUE (comentários
// assinados + semáforos por label); acompanha-se no GitHub, não num spinner.
export async function dispararRelay(
    repo: string,
    issue: number,
): Promise<{ ok: boolean; detalhe: string }> {
    if (!repo || !Number.isInteger(issue) || issue <= 0) {
        return { ok: false, detalhe: 'Indica o repo e um número de issue válido.' };
    }

    const v = await defsValidadas(repo);
    if ('erro' in v) return { ok: false, detalhe: v.erro };
    const { db, defs, path } = v;
    if (providersAtivos(defs).length === 0) {
        return {
            ok: false,
            detalhe: 'Sem providers ativos (Definições > Agentes).',
        };
    }
    if (relaysAtivos.has(path)) {
        return { ok: false, detalhe: 'Já corre um relay neste repo — espera que termine.' };
    }

    relaysAtivos.add(path);
    after(async () => {
        try {
            await orquestrar({ db, defs, repo, issue });
        } catch (e) {
            console.error('[relay] orquestrar falhou:', e);
            await marcarFalhaRelay({ db, token: defs.githubToken!, repo, issue, erro: e });
        } finally {
            relaysAtivos.delete(path);
        }
    });

    return { ok: true, detalhe: `Relay disparado para ${repo} #${issue} — acompanha na issue.` };
}

// Promoção assistida (cartão → issue): cria a issue a partir do título+descrição
// da tarefa e LIGA o cartão a ela (repo + número). É o "confirma" da promoção; o
// cartão fica pronto para o trigger por arrasto (Backlog→Análise).
export async function promoverTarefa(
    tarefaId: string,
    repo: string,
): Promise<{ ok: boolean; detalhe: string; issue?: number }> {
    const v = await defsValidadas(repo);
    if ('erro' in v) return { ok: false, detalhe: v.erro };
    const { db, defs } = v;

    const tarefa = await getTarefaCom(db, tarefaId);
    if (!tarefa) return { ok: false, detalhe: 'Tarefa não encontrada.' };
    if (tarefa.issueGithub) {
        return { ok: false, detalhe: `Já ligada à issue #${tarefa.issueGithub}.` };
    }

    try {
        const corpo =
            (tarefa.descricao?.trim() || '_(sem descrição — completa na issue)_') +
            `\n\n— promovida do MythosEngine (tarefa ${tarefaId.slice(0, 8)})`;
        const url = await criarIssue(defs.githubToken!, {
            repo,
            title: tarefa.titulo,
            body: corpo,
        });
        const numero = numeroDoUrl(url);
        if (!numero) return { ok: false, detalhe: `Issue criada mas sem número legível: ${url}` };
        await ligarIssueTarefaCom(db, tarefaId, repo, numero);
        return { ok: true, detalhe: `Issue #${numero} criada e ligada.`, issue: numero };
    } catch (e) {
        return { ok: false, detalhe: e instanceof Error ? e.message : 'promoção falhou' };
    }
}

// Retoma pós-🔴 (a junta humano-máquina): comenta a correção na issue e re-dispara
// o relay. O pipeline relê os comentários humanos (montarSpec) e integra. É o
// miolo do "chat-under-kanban" — sem UI nova de chat, reusa a issue como canal.
export async function comentarERetomar(
    repo: string,
    issue: number,
    texto: string,
): Promise<{ ok: boolean; detalhe: string }> {
    if (!texto.trim()) return { ok: false, detalhe: 'Escreve a correção antes de retomar.' };
    const v = await defsValidadas(repo);
    if ('erro' in v) return { ok: false, detalhe: v.erro };
    try {
        await comentarIssue(v.defs.githubToken!, {
            repo,
            number: issue,
            body: `— Carlos · humano\n\n${texto.trim()}`,
        });
    } catch (e) {
        return { ok: false, detalhe: e instanceof Error ? e.message : 'comentar falhou' };
    }
    return dispararRelay(repo, issue);
}

// Os comentários da issue (o trace do relay + as correções), para o painel de
// retoma mostrar o que se passou antes de o humano comentar.
export async function lerComentariosRelay(
    repo: string,
    issue: number,
): Promise<{ autor: string; corpo: string }[]> {
    const v = await defsValidadas(repo);
    if ('erro' in v) return [];
    try {
        const d = await verIssue(v.defs.githubToken!, { repo, number: issue });
        return d.comentarios;
    } catch {
        return [];
    }
}
