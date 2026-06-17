import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { respondStream } from '@/modules/chat/chat.service';
import { garantirConversaCom, ultimasMensagensCom } from '@/modules/chat/chat.conversas';
import { indexarMensagensChatCom } from '@/modules/chat/chat.indexing';
import { criarDestilacaoJobCom } from '@/modules/chat/chat.jobs';

// Streaming do turno (#66): a resposta sai token-a-token por ndjson, em vez de
// um único valor no fim (server actions não fazem stream). A persistência e o
// job de destilação são os MESMOS do `ask` — só a geração é que streama.
const bodySchema = z.object({
    question: z.string().min(1).max(4000),
    conversationId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return new Response(JSON.stringify({ error: 'pedido inválido' }), { status: 400 });
    }
    const { question, conversationId } = parsed.data;

    const db = await createClient();
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'sem sessão' }), { status: 401 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const enviar = (obj: unknown) =>
                controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
            try {
                const convId = await garantirConversaCom(db, user.id, question, conversationId);
                // Janela ANTES de inserir a mensagem atual (anáfora).
                const historico = await ultimasMensagensCom(db, convId, 10);

                const userMsg = await db
                    .from('messages')
                    .insert({ conversation_id: convId, role: 'user', content: question })
                    .select('id, created_at')
                    .single();
                if (userMsg.error || !userMsg.data) {
                    throw new Error(
                        `guardar mensagem falhou: ${userMsg.error?.message ?? 'sem id'}`,
                    );
                }
                enviar({ tipo: 'inicio', conversationId: convId });

                const result = await respondStream(question, historico, (texto) =>
                    enviar({ tipo: 'delta', texto }),
                );

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
                        sources: result.sources,
                    })
                    .select('id, created_at')
                    .single();
                if (asstMsg.error || !asstMsg.data) {
                    throw new Error(
                        `guardar resposta falhou: ${asstMsg.error?.message ?? 'sem id'}`,
                    );
                }

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

                enviar({
                    tipo: 'done',
                    conversationId: convId,
                    distillationJobId,
                    provider: result.provider,
                    modelo: result.modelo,
                    modeloPedido: result.modeloPedido,
                    costUsd: result.costUsd,
                    tokensIn: result.tokensIn,
                    tokensCache: result.tokensCache,
                    tokensOut: result.tokensOut,
                    latencyMs: result.latencyMs,
                    sources: result.sources,
                });
            } catch (e) {
                enviar({ tipo: 'erro', mensagem: e instanceof Error ? e.message : 'erro' });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'content-type': 'application/x-ndjson; charset=utf-8',
            'cache-control': 'no-cache',
        },
    });
}
