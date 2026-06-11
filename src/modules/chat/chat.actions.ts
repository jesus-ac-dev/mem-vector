'use server';

import { z } from 'zod';
import {
    respond,
    aplicarDestilacao,
    aplicarDailyTurno,
    type ChatResult,
    type NotaEscrita,
    type TurnoDestilado,
} from './chat.service';
import { createClient } from '@/lib/supabase/server';
import { destilarResumirTurno, type TurnoDestiladoRaw } from './chat.turno';
import { destilarTurnoAgenticCom } from '@/agent/destilar-agentic';
import { classificarIntencao } from './chat.intencao';
import type { MensagemConversa } from './chat.prompt';
import { candidatosParaFactoCom } from '@/modules/knowledge/knowledge.service';
import { escreverOuContinuarNotaCom } from '@/modules/knowledge/knowledge.continuar';
import { acrescentarAoDailyCom } from '@/modules/daily/daily.service';
import type { NotaCandidata } from '@/modules/knowledge/knowledge.schema';
import { listarConversas, carregarConversa, ultimasMensagensCom } from './chat.conversas';
import { indexarMensagensChatCom } from './chat.indexing';
import { tituloInicialConversa } from './chat.titulo';
import {
    concluirDestilacaoJobCom,
    criarDestilacaoJobCom,
    estadoDestilacaoJobCom,
    falharDestilacaoJobCom,
    reclamarDestilacaoJobCom,
} from './chat.jobs';

export async function listarConversasAction() {
    return listarConversas();
}

export async function carregarConversaAction(id: string) {
    return carregarConversa(id);
}

const askSchema = z.object({
    question: z.string().min(1).max(4000),
    conversationId: z.string().uuid().optional(),
});

export async function ask(
    input: z.infer<typeof askSchema>,
): Promise<ChatResult & { conversationId: string; distillationJobId: string }> {
    const { question, conversationId } = askSchema.parse(input);
    const db = await createClient();

    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    // Garante uma conversa (cria uma se a UI ainda não tem id).
    const convId: string = await (async () => {
        if (conversationId) return conversationId;
        const { data, error } = await db
            .from('conversations')
            .insert({ title: tituloInicialConversa(question), owner_id: user.id })
            .select('id')
            .single();
        if (error || !data) throw new Error(`criar conversa falhou: ${error?.message ?? 'sem id'}`);
        return data.id as string;
    })();

    // Janela de conversa ANTES de inserir a mensagem atual (anáfora: "eles",
    // "deles" resolvem-se pelo fio; a mensagem atual vai explícita no prompt).
    const historico = await ultimasMensagensCom(db, convId, 10);

    // Bruto guardado sempre (guardrail): mensagem do utilizador antes de gerar.
    const userMsg = await db
        .from('messages')
        .insert({ conversation_id: convId, role: 'user', content: question })
        .select('id, created_at')
        .single();
    if (userMsg.error || !userMsg.data) {
        throw new Error(`guardar mensagem falhou: ${userMsg.error?.message ?? 'sem id'}`);
    }

    const result = await respond(question, historico);

    const asstMsg = await db
        .from('messages')
        .insert({
            conversation_id: convId,
            role: 'assistant',
            content: result.answer,
            cost_usd: result.costUsd,
            // Guardar as fontes religa as citações [N] quando a conversa é reaberta.
            sources: result.sources,
        })
        .select('id, created_at')
        .single();
    if (asstMsg.error || !asstMsg.data) {
        throw new Error(`guardar resposta falhou: ${asstMsg.error?.message ?? 'sem id'}`);
    }

    // Indexa o turno DEPOIS do retrieval para a pergunta não contaminar a própria
    // resposta. O chunk fica ligado à conversa/mensagem real para pruning e auditoria.
    await indexarMensagensChatCom(db, {
        ownerId: user.id,
        conversationId: convId,
        messages: [
            {
                conversationId: convId,
                messageId: String(userMsg.data.id),
                role: 'user',
                content: question,
                createdAt: String(userMsg.data.created_at),
            },
            {
                conversationId: convId,
                messageId: String(asstMsg.data.id),
                role: 'assistant',
                content: result.answer,
                createdAt: String(asstMsg.data.created_at),
            },
        ],
    });

    const distillationJobId = await criarDestilacaoJobCom(db, {
        question,
        answer: result.answer,
        conversationId: convId,
        userMessageId: String(userMsg.data.id),
        assistantMessageId: String(asstMsg.data.id),
    });

    return { ...result, conversationId: convId, distillationJobId };
}

interface ContextoConversaJob {
    conversationId: string;
    excluirIds: string[]; // o par pergunta/resposta atual, que já vai explícito
}

async function executarDestilacaoTurnoCom(
    db: Awaited<ReturnType<typeof createClient>>,
    question: string,
    answer: string,
    contexto?: ContextoConversaJob,
): Promise<TurnoDestilado> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) return { nota: null, daily: null };

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

    // Caminho agentic (issue #27, atrás de flag): a sessão CLI lê as candidatas
    // e escreve via tools MCP — sem fallback para o one-shot, para o A/B medir
    // o caminho real (um erro aqui falha o job, visível, em vez de mascarar).
    if (process.env.MEMVECTOR_AGENTIC_DISTILL === '1') {
        return destilarTurnoAgenticCom(db, {
            question,
            answer,
            candidatos,
            intencao: classificarIntencao(question),
            historico,
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
        );
    } catch (e) {
        console.error('destilarResumirTurno falhou:', e);
        return { nota: null, daily: null };
    }
    const { resumoMd, nota: notaProposta } = turno;

    // As escritas não chamam o CLI: injetam-se os resultados já gerados, e usam a
    // MESMA sessão `db` (não abrir uma segunda). Mantêm-se isoladas para o daily
    // sobreviver se a escrita da nota falhar.
    let nota: NotaEscrita | null = null;
    try {
        nota = await aplicarDestilacao(question, answer, {
            destilar: async () => notaProposta,
            // "Continuar" uma candidata aterra NELA (update por id): o upsert por
            // slug escreve na raiz e duplicava candidatas dentro de pastas.
            escrever: (input) => escreverOuContinuarNotaCom(db, input, candidatos),
        });
    } catch (e) {
        console.error('escrita da nota destilada falhou:', e);
    }

    try {
        const daily = await aplicarDailyTurno(question, answer, nota, {
            resumir: async () => resumoMd,
            escrever: (linha) => acrescentarAoDailyCom(db, linha),
        });
        return { nota, daily };
    } catch (e) {
        console.error('append daily falhou:', e);
        return { nota, daily: null };
    }
}

export async function destilarTurno(question: string, answer: string): Promise<TurnoDestilado> {
    // Compatibilidade com chamadas antigas. O caminho normal é processar por job.
    const db = await createClient();
    return executarDestilacaoTurnoCom(db, question, answer);
}

const processarJobSchema = z.object({
    jobId: z.string().uuid(),
});

function mensagemErro(e: unknown): string {
    return e instanceof Error ? e.message : 'erro desconhecido';
}

export async function processarDestilacaoJob(jobIdInput: string): Promise<TurnoDestilado> {
    const { jobId } = processarJobSchema.parse({ jobId: jobIdInput });
    const db = await createClient();

    const job = await reclamarDestilacaoJobCom(db, jobId);
    if (!job) {
        const estado = await estadoDestilacaoJobCom(db, jobId);
        if (estado.status === 'done' && estado.result) return estado.result;
        if (estado.status === 'failed') {
            throw new Error(estado.error ?? 'job de destilação falhou');
        }
        throw new Error('job de destilação já está em processamento');
    }

    try {
        const result = await executarDestilacaoTurnoCom(
            db,
            job.payload.question,
            job.payload.answer,
            {
                conversationId: job.payload.conversationId,
                excluirIds: [job.payload.userMessageId, job.payload.assistantMessageId].filter(
                    (id): id is string => Boolean(id),
                ),
            },
        );
        await concluirDestilacaoJobCom(db, job.id, result);
        return result;
    } catch (e) {
        const msg = mensagemErro(e);
        await falharDestilacaoJobCom(db, job.id, msg);
        throw new Error(msg);
    }
}
