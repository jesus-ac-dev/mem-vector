'use server';

import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { lerDefinicoesServidorCom } from '@/modules/definicoes/definicoes.service';
import type { DefinicoesServidor } from '@/modules/definicoes/definicoes.schema';
import { criarIssue, comentarIssue, editarLabels, numeroDoUrl } from '@/lib/github';
import { expandirHome } from '@/lib/paths';
import {
    atualizarRelayPorIssueCom,
    getTarefaCom,
    ligarIssueTarefaCom,
} from '@/modules/tarefas/tarefas.service';

import { LABELS_RELAY_REMOVER, orquestrar, relayFaseLabel } from './relay.orchestrator';
import { providersAtivos } from './relay.resolver';
import { ocuparOuEnfileirar, proximaOuLibertar } from './relay.fila';
import { guardarSteeringCom } from './relay.steering';

type DefsValidadas =
    | { erro: string }
    | { db: SupabaseClient; defs: DefinicoesServidor; path: string };

async function defsValidadas(repo: string): Promise<DefsValidadas> {
    const db = await createClient();
    const defs = await lerDefinicoesServidorCom(db);
    if (!defs.githubToken) return { erro: 'Sem token GitHub (Definições > módulo GitHub).' };
    const ligado = defs.githubRepos.find((r) => r.repo === repo);
    if (!ligado?.path) return { erro: `Repo "${repo}" sem path local — corre o Testar primeiro.` };
    return { db, defs, path: expandirHome(ligado.path) };
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
        const ativa = relayFaseLabel('erro', 'bloqueado');
        await editarLabels(opts.token, {
            repo: opts.repo,
            number: opts.issue,
            add: [ativa],
            remove: LABELS_RELAY_REMOVER.filter((label) => label !== ativa),
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
    await atualizarRelayPorIssueCom(opts.db, opts.repo, opts.issue, {
        relayEstado: 'bloqueado',
        relayFase: 'erro',
        relayProgresso: null,
    });
}

// Trigger do relay: dispara o pipeline para uma (repo, issue). Valida cedo, ENFILEIRA
// disparos concorrentes no mesmo repo (a fila drena-se sozinha), e corre o orchestrator
// em BACKGROUND (after) — fire-and-forget. O estado/progresso vive na ISSUE (comentários
// assinados + semáforos por label); acompanha-se no GitHub, não num spinner.
export async function dispararRelay(
    repo: string,
    issue: number,
): Promise<{ ok: boolean; detalhe: string; enfileirado?: boolean }> {
    if (!repo || !Number.isInteger(issue) || issue <= 0) {
        return { ok: false, detalhe: 'Indica o repo e um número de issue válido.' };
    }

    const v = await defsValidadas(repo);
    if ('erro' in v) return { ok: false, detalhe: v.erro };
    const { defs, path } = v;
    if (providersAtivos(defs).length === 0) {
        return {
            ok: false,
            detalhe: 'Sem providers ativos (Definições > Agentes).',
        };
    }
    const lugar = ocuparOuEnfileirar(path, issue);
    if (!lugar.correr) {
        if (lugar.posicao === 0) {
            return {
                ok: true,
                enfileirado: true,
                detalhe: `Relay já está a correr para ${repo} #${issue} — não foi duplicado.`,
            };
        }
        return {
            ok: true,
            enfileirado: true,
            detalhe: `Relay enfileirado para ${repo} #${issue} (posição ${lugar.posicao} na fila) — corre quando o atual terminar.`,
        };
    }

    after(async () => {
        // Drena a fila do repo: corre a issue atual e, ao terminar, a próxima
        // enfileirada até a fila esvaziar e o repo libertar. Re-valida as defs por
        // issue — numa fila longa o token Supabase do 1º disparo expirava (o mirror
        // do kanban falhava). A chave da fila é sempre o `path` do 1º disparo.
        let atual: number | null = issue;
        while (atual !== null) {
            const v2 = await defsValidadas(repo);
            if ('erro' in v2) {
                console.error(`[relay] fila: ${repo} #${atual} sem defs válidas: ${v2.erro}`);
            } else {
                try {
                    await orquestrar({ db: v2.db, defs: v2.defs, repo, issue: atual });
                } catch (e) {
                    console.error('[relay] orquestrar falhou:', e);
                    await marcarFalhaRelay({
                        db: v2.db,
                        token: v2.defs.githubToken!,
                        repo,
                        issue: atual,
                        erro: e,
                    });
                }
            }
            atual = proximaOuLibertar(path);
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

// Steering a quente (#129): guarda uma orientação humana para a corrida em curso
// (ou a próxima). O orchestrator consome-a no próximo passo de produção e deixa
// comentário assinado na issue — daí não se comentar já aqui.
export async function guiarRelay(
    repo: string,
    issue: number,
    texto: string,
): Promise<{ ok: boolean; detalhe: string }> {
    if (!repo || !Number.isInteger(issue) || issue <= 0) {
        return { ok: false, detalhe: 'Indica o repo e um número de issue válido.' };
    }
    const db = await createClient();
    return guardarSteeringCom(db, { repo, issue, texto });
}
