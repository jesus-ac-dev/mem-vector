'use server';

import { z } from 'zod';
import { respond, type ChatResult, type TurnoDestilado } from './chat.service';
import { createClient } from '@/lib/supabase/server';
import { executarDestilacaoTurnoCom } from './chat.postturno';
import { garantirConversaCom, listarConversas, ultimasMensagensCom } from './chat.conversas';
import { indexarMensagensChatCom } from './chat.indexing';
import { abrirOuReusarSessaoCom, registarObservacaoCom } from '@/modules/memory/memory.service';
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

// carregarConversaAction migrou para `GET /api/conversa` (#73).

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

    // Garante uma conversa: reutiliza a recebida (após confirmar a posse, #68)
    // ou cria uma nova se a UI ainda não tem id.
    const convId = await garantirConversaCom(db, user.id, question, conversationId);
    let agentSessionId: string | undefined;
    try {
        const sessao = await abrirOuReusarSessaoCom(db, {
            conversationId: convId,
            operator: 'web',
            runner: 'chat',
        });
        agentSessionId = sessao.id;
    } catch (e) {
        console.error('abrir sessão de memória falhou:', e);
    }

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
    try {
        await registarObservacaoCom(db, {
            sessionId: agentSessionId,
            conversationId: convId,
            type: 'user-prompt',
            content: question,
            metadata: { messageId: String(userMsg.data.id) },
        });
    } catch (e) {
        console.error('observação user-prompt falhou:', e);
    }

    const result = await respond(question, historico);

    const asstMsg = await db
        .from('messages')
        .insert({
            conversation_id: convId,
            role: 'assistant',
            content: result.answer,
            cost_usd: result.costUsd,
            tokens_in: result.tokensIn,
            tokens_cache: result.tokensCache,
            tokens_out: result.tokensOut,
            provider: result.provider,
            model_requested: result.modeloPedido,
            model_effective: result.modelo,
            latency_ms: result.latencyMs,
            // Guardar as fontes religa as citações [N] quando a conversa é reaberta.
            sources: result.sources,
        })
        .select('id, created_at')
        .single();
    if (asstMsg.error || !asstMsg.data) {
        throw new Error(`guardar resposta falhou: ${asstMsg.error?.message ?? 'sem id'}`);
    }
    try {
        await registarObservacaoCom(db, {
            sessionId: agentSessionId,
            conversationId: convId,
            type: 'assistant-response',
            content: result.answer,
            metadata: {
                messageId: String(asstMsg.data.id),
                provider: result.provider,
                modeloPedido: result.modeloPedido ?? null,
                modelo: result.modelo ?? null,
                sourcesCount: result.sources.length,
                latencyMs: result.latencyMs,
            },
        });
    } catch (e) {
        console.error('observação assistant-response falhou:', e);
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
        try {
            const sessao = await abrirOuReusarSessaoCom(db, {
                conversationId: job.payload.conversationId,
                operator: 'web',
                runner: 'distillation',
            });
            await registarObservacaoCom(db, {
                sessionId: sessao.id,
                conversationId: job.payload.conversationId,
                type: 'job-result',
                content: 'Job de destilação concluído.',
                metadata: { jobId: job.id, status: 'done', result },
            });
        } catch (obsErro) {
            console.error('observação job-result falhou:', obsErro);
        }
        return result;
    } catch (e) {
        const msg = mensagemErro(e);
        await falharDestilacaoJobCom(db, job.id, msg);
        try {
            const sessao = await abrirOuReusarSessaoCom(db, {
                conversationId: job.payload.conversationId,
                operator: 'web',
                runner: 'distillation',
            });
            await registarObservacaoCom(db, {
                sessionId: sessao.id,
                conversationId: job.payload.conversationId,
                type: 'job-result',
                content: 'Job de destilação falhou.',
                metadata: { jobId: job.id, status: 'failed', error: msg },
            });
        } catch (obsErro) {
            console.error('observação job-result falhada falhou:', obsErro);
        }
        throw new Error(msg);
    }
}
