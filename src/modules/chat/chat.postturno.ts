import type { SupabaseClient } from '@supabase/supabase-js';

import { destilarResumirTurno, type TurnoDestiladoRaw } from './chat.turno';
import { classificarIntencao } from './chat.intencao';
import { ultimasMensagensCom } from './chat.conversas';
import type { MensagemConversa } from './chat.prompt';
import {
    aplicarDestilacao,
    aplicarDailyTurno,
    type NotaEscrita,
    type TurnoDestilado,
} from './chat.service';
import { candidatosParaFactoCom, tagsExistentesCom } from '@/modules/knowledge/knowledge.service';
import {
    listarTarefasAbertasCom,
    criarTarefaCom,
    concluirTarefaCom,
} from '@/modules/tarefas/tarefas.service';
import type { TarefaAbertaRef } from './chat.turno';
import type { TarefasDoTurno } from './chat.service';
import { escreverOuContinuarNotaCom } from '@/modules/knowledge/knowledge.continuar';
import { listarProjetosCom } from '@/modules/projetos/projetos.service';
import { lerDefinicoesCom } from '@/modules/definicoes/definicoes.service';
import type { DefinicoesServidor } from '@/modules/definicoes/definicoes.schema';
import { acrescentarAoDailyCom } from '@/modules/daily/daily.service';
import type { NotaCandidata } from '@/modules/knowledge/knowledge.schema';
import { destilarTurnoAgenticCom } from '@/agent/destilar-agentic';
import { blocoKernelCom, blocoComportamento } from '@/agent/kernel';

// Miolo do pós-turno, extraído de chat.actions (M2, #38): importável por
// scripts e pela suite de evals sem passar pelo runtime de server actions.
// As actions ficam finas; este módulo é o pipeline real.

export interface ContextoConversaJob {
    conversationId: string;
    excluirIds: string[]; // o par pergunta/resposta atual, que já vai explícito
}

export async function executarDestilacaoTurnoCom(
    db: SupabaseClient,
    question: string,
    answer: string,
    contexto?: ContextoConversaJob,
): Promise<TurnoDestilado> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) return { notas: [], daily: null };

    // Janela de conversa para a destilação resolver pronomes (não-fatal).
    let historico: MensagemConversa[] = [];
    if (contexto) {
        try {
            historico = await ultimasMensagensCom(
                db,
                contexto.conversationId,
                10,
                contexto.excluirIds,
            );
        } catch (e) {
            console.error('janela de conversa falhou:', e);
        }
    }

    // UPDATE-bias: procura notas existentes relacionadas para o agente CONTINUAR
    // a certa em vez de criar uma nova por facto. Não-fatal: sem candidatos, cai
    // no comportamento de criação.
    let candidatos: NotaCandidata[] = [];
    try {
        candidatos = await candidatosParaFactoCom(db, `${question}\n${answer}`);
    } catch (e) {
        console.error('candidatos para facto falhou:', e);
    }

    // Kernel do workspace (#34): identidade/regras do utilizador no arranque
    // da destilação (não-fatal: sem Kernel, comportamento de sempre).
    const kernelBase = await blocoKernelCom(db);

    // #122 (Ponte F): definições do utilizador, lidas UMA vez — o campo
    // Comportamento (injetado no prompt a seguir ao Kernel) e o método de
    // destilação saem daqui. Não-fatal: sem leitura, segue nos defaults.
    let definicoes: DefinicoesServidor | null = null;
    try {
        definicoes = await lerDefinicoesCom(db);
    } catch (e) {
        console.error('ler definições falhou (segue defaults):', e);
    }
    const kernel = kernelBase + blocoComportamento(definicoes?.comportamento);

    // Tarefas em aberto (#21): o agente decide criar/concluir com a lista à
    // frente (não duplica, não inventa ids). Não-fatal.
    let tarefasAbertas: TarefaAbertaRef[] = [];
    try {
        tarefasAbertas = (await listarTarefasAbertasCom(db)).map((t) => ({
            id: t.id,
            titulo: t.titulo,
            projeto: t.projeto,
        }));
    } catch (e) {
        console.error('listar tarefas abertas falhou:', e);
    }

    // Projetos reais (#47): o agente ancora ao projeto certo em vez de inventar
    // tags parecidas. Não-fatal — sem lista, o serviço resolve na mesma.
    let projetos: string[] = [];
    try {
        projetos = (await listarProjetosCom(db)).map((p) => p.nome);
    } catch (e) {
        console.error('listar projetos falhou:', e);
    }

    // Tags já em uso (#90): dadas ao agente para REUTILIZAR em vez de inventar
    // variantes do mesmo conceito. Não-fatal — sem lista, gera tags livres.
    let tagsExistentes: string[] = [];
    try {
        tagsExistentes = await tagsExistentesCom(db);
    } catch (e) {
        console.error('listar tags existentes falhou:', e);
    }

    // Método de destilação (#60): a flag do M2 virou opção por workspace —
    // one-shot é o default (decisão #38: ¼ do custo); agentic é opt-in nas
    // definições. A env flag continua como override (evals/scripts forçam o
    // caminho por célula). Não-fatal: sem leitura, default one-shot.
    const metodoAgentic =
        process.env.MEMVECTOR_AGENTIC_DISTILL === '1' || definicoes?.metodoDestilacao === 'agentic';

    // Caminho agentic (issue #27): a sessão CLI lê as candidatas e escreve via
    // tools MCP — sem fallback para o one-shot (um erro aqui falha o job,
    // visível, em vez de mascarar).
    if (metodoAgentic) {
        return destilarTurnoAgenticCom(db, {
            question,
            answer,
            candidatos,
            intencao: classificarIntencao(question),
            historico,
            kernel,
            tagsExistentes,
        });
    }

    // Uma só chamada ao CLI para o pós-turno (resumo do daily + decisão de nota).
    // A intenção é re-derivada da question (função determinística — mesma
    // classificação que guiou a resposta do chat, sem viajar no payload).
    let turno: TurnoDestiladoRaw;
    try {
        turno = await destilarResumirTurno(
            question,
            answer,
            candidatos,
            classificarIntencao(question),
            historico,
            kernel,
            tarefasAbertas,
            projetos,
            tagsExistentes,
        );
    } catch (e) {
        console.error('destilarResumirTurno falhou:', e);
        return { notas: [], daily: null };
    }
    const { resumoMd, notas: notasPropostas } = turno;

    // As escritas não chamam o CLI: injetam-se os resultados já gerados, e usam a
    // MESMA sessão `db` (não abrir uma segunda). Mantêm-se isoladas para o daily
    // sobreviver se a escrita da nota falhar.
    let notas: NotaEscrita[] = [];
    try {
        notas = await aplicarDestilacao(question, answer, {
            destilar: async () => notasPropostas,
            // "Continuar" uma candidata aterra NELA (update por id): o upsert por
            // slug escreve na raiz e duplicava candidatas dentro de pastas.
            escrever: (input) => escreverOuContinuarNotaCom(db, input, candidatos),
        });
    } catch (e) {
        console.error('escrita das notas destiladas falhou:', e);
    }

    let daily = null;
    try {
        daily = await aplicarDailyTurno(
            question,
            answer,
            notas,
            {
                resumir: async () => resumoMd,
                escrever: (linha) =>
                    acrescentarAoDailyCom(db, linha, undefined, contexto?.conversationId),
            },
            contexto?.conversationId,
        );
    } catch (e) {
        console.error('append daily falhou:', e);
    }

    // Tarefas (#21): criar as propostas (dedupe por título contra as abertas;
    // na dúvida o prompt já criou — aqui só evitamos o duplicado exato) e
    // concluir os ids válidos (a conclusão escreve o daily no serviço).
    const tarefas: TarefasDoTurno = { criadas: [], concluidas: [] };
    for (const t of turno.tarefas) {
        const duplicada = tarefasAbertas.some(
            (a) => a.titulo.trim().toLowerCase() === t.titulo.trim().toLowerCase(),
        );
        if (duplicada) continue;
        try {
            const criada = await criarTarefaCom(db, {
                titulo: t.titulo,
                projeto: t.projeto,
                prioridade: t.prioridade,
                dataFim: t.dataFim,
                visibility: 'privado',
            });
            tarefas.criadas.push({ id: criada.id, titulo: criada.titulo });
        } catch (e) {
            console.error('criar tarefa destilada falhou:', e);
        }
    }
    for (const id of turno.concluirIds) {
        if (!tarefasAbertas.some((a) => a.id === id)) continue;
        try {
            const concluida = await concluirTarefaCom(db, id);
            tarefas.concluidas.push({ id: concluida.id, titulo: concluida.titulo });
        } catch (e) {
            console.error('concluir tarefa destilada falhou:', e);
        }
    }

    return {
        notas,
        daily,
        tarefas: tarefas.criadas.length || tarefas.concluidas.length ? tarefas : null,
    };
}
