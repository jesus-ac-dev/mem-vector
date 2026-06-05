'use server';

import { z } from 'zod';
import { respond, aplicarDestilacao, type ChatResult, type NotaEscrita } from './chat.service';
import { createClient } from '@/lib/supabase/server';
import { embedPassage } from '@/lib/embeddings';
import { acrescentarAoDaily } from '@/modules/daily/daily.service';

const askSchema = z.object({
    question: z.string().min(1).max(4000),
    conversationId: z.string().uuid().optional(),
});

export async function ask(
    input: z.infer<typeof askSchema>,
): Promise<ChatResult & { conversationId: string }> {
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
            .insert({ title: 'ping-pong', owner_id: user.id })
            .select('id')
            .single();
        if (error || !data) throw new Error(`criar conversa falhou: ${error?.message ?? 'sem id'}`);
        return data.id as string;
    })();

    // Bruto guardado sempre (guardrail): mensagem do utilizador antes de gerar.
    const userMsg = await db
        .from('messages')
        .insert({ conversation_id: convId, role: 'user', content: question });
    if (userMsg.error) throw new Error(`guardar mensagem falhou: ${userMsg.error.message}`);

    const result = await respond(question);

    // Indexa a pergunta DEPOIS de recuperar — senão ela contamina o próprio
    // retrieval (similaridade ~1.0 consigo mesma) e apareceria como "fonte" da
    // sua resposta. v1 ingénuo (indexa tudo); julgar o que vale a pena é o próximo degrau.
    const said = await embedPassage(question);
    const chunkIns = await db.from('chunks').insert({
        content: question,
        embedding: JSON.stringify(said),
        source: 'chat',
        owner_id: user.id,
    });
    if (chunkIns.error) throw new Error(`indexar chunk falhou: ${chunkIns.error.message}`);

    const asstMsg = await db.from('messages').insert({
        conversation_id: convId,
        role: 'assistant',
        content: result.answer,
        cost_usd: result.costUsd,
    });
    if (asstMsg.error) throw new Error(`guardar resposta falhou: ${asstMsg.error.message}`);

    return { ...result, conversationId: convId };
}

export async function destilarTurno(question: string, answer: string): Promise<NotaEscrita | null> {
    // Autentica antes de destilar — garante que a sessão existe.
    const db = await createClient();
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) return null;

    try {
        const escrita = await aplicarDestilacao(question, answer);
        if (escrita) {
            try {
                const acao = escrita.criada ? 'Nota criada' : 'Nota atualizada';
                await acrescentarAoDaily(`- ${acao}: [[${escrita.slug}]]`);
            } catch (e) {
                console.error('append daily falhou:', e);
            }
        }
        return escrita;
    } catch (e) {
        console.error('destilarTurno falhou:', e);
        return null;
    }
}
