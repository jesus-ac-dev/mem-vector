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
import { embedPassage } from '@/lib/embeddings';
import { destilarResumirTurno, type TurnoDestiladoRaw } from './chat.turno';
import { candidatosParaFactoCom } from '@/modules/knowledge/knowledge.service';
import type { NotaCandidata } from '@/modules/knowledge/knowledge.schema';
import { listarConversas, carregarConversa } from './chat.conversas';

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

// Título da conversa = a primeira pergunta, numa linha e cortada.
// Sem chamada extra ao CLI (a dívida já são 3 chamadas/turno); barato e previsível.
function tituloInicial(pergunta: string): string {
    const limpo = pergunta.replace(/\s+/g, ' ').trim();
    if (!limpo) return 'Conversa';
    return limpo.length > 80 ? `${limpo.slice(0, 77)}…` : limpo;
}

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
            .insert({ title: tituloInicial(question), owner_id: user.id })
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
        // Guardar as fontes religa as citações [N] quando a conversa é reaberta.
        sources: result.sources,
    });
    if (asstMsg.error) throw new Error(`guardar resposta falhou: ${asstMsg.error.message}`);

    return { ...result, conversationId: convId };
}

export async function destilarTurno(question: string, answer: string): Promise<TurnoDestilado> {
    // Autentica antes de destilar — garante que a sessão existe.
    const db = await createClient();
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) return { nota: null, daily: null };

    // UPDATE-bias: procura notas existentes relacionadas para o agente CONTINUAR
    // a certa em vez de criar uma nova por facto. Não-fatal: sem candidatos, cai
    // no comportamento de criação.
    let candidatos: NotaCandidata[] = [];
    try {
        candidatos = await candidatosParaFactoCom(db, `${question}\n${answer}`);
    } catch (e) {
        console.error('candidatos para facto falhou:', e);
    }

    // Uma só chamada ao CLI para o pós-turno (resumo do daily + decisão de nota).
    let turno: TurnoDestiladoRaw;
    try {
        turno = await destilarResumirTurno(question, answer, candidatos);
    } catch (e) {
        console.error('destilarResumirTurno falhou:', e);
        return { nota: null, daily: null };
    }
    const { resumoMd, nota: notaProposta } = turno;

    // As escritas não chamam o CLI: injetam-se os resultados já gerados. Mantêm-se
    // isoladas para o daily sobreviver se a escrita da nota falhar.
    let nota: NotaEscrita | null = null;
    try {
        nota = await aplicarDestilacao(question, answer, { destilar: async () => notaProposta });
    } catch (e) {
        console.error('escrita da nota destilada falhou:', e);
    }

    try {
        const daily = await aplicarDailyTurno(question, answer, nota, {
            resumir: async () => resumoMd,
        });
        return { nota, daily };
    } catch (e) {
        console.error('append daily falhou:', e);
        return { nota, daily: null };
    }
}
