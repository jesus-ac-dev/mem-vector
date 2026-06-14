import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { ChatTrace } from './chat.trace';
import type { Source } from './chat.prompt';

export interface ConversaResumo {
    id: string;
    titulo: string; // title ?? 'Sem título'
    criadaEm: string; // created_at ISO
    nMensagens: number;
    custoTotal: number; // sum of cost_usd
}

export interface MensagemHist {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    criadaEm: string;
    sources: Source[] | null; // só nas mensagens do assistente; religa as citações [N]
    trace: ChatTrace | null;
}

export async function listarConversasCom(db: SupabaseClient): Promise<ConversaResumo[]> {
    const { data: convs, error: convErr } = await db
        .from('conversations')
        .select('id, title, created_at')
        .order('created_at', { ascending: false });

    if (convErr) throw new Error(`listarConversas falhou: ${convErr.message}`);
    if (!convs || convs.length === 0) return [];

    const ids = convs.map((c) => c.id as string);

    const { data: msgs, error: msgErr } = await db
        .from('messages')
        .select('conversation_id, cost_usd')
        .in('conversation_id', ids);

    if (msgErr) throw new Error(`listarConversas (mensagens) falhou: ${msgErr.message}`);

    // Aggregate per conversation
    const agg: Record<string, { count: number; custo: number }> = {};
    for (const id of ids) agg[id] = { count: 0, custo: 0 };
    for (const m of msgs ?? []) {
        const id = m.conversation_id as string;
        if (agg[id]) {
            agg[id].count += 1;
            agg[id].custo += Number(m.cost_usd ?? 0);
        }
    }

    return convs.map((c) => ({
        id: c.id as string,
        titulo: (c.title as string | null) ?? 'Sem título',
        criadaEm: c.created_at as string,
        nMensagens: agg[c.id as string]?.count ?? 0,
        custoTotal: agg[c.id as string]?.custo ?? 0,
    }));
}

export async function carregarConversaCom(db: SupabaseClient, id: string): Promise<MensagemHist[]> {
    const { data, error } = await db
        .from('messages')
        .select(
            'id, role, content, created_at, sources, cost_usd, provider, model_requested, model_effective, latency_ms',
        )
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

    if (error) throw new Error(`carregarConversa falhou: ${error.message}`);

    return (data ?? []).map((m) => {
        const role = m.role as 'user' | 'assistant';
        const sources = (m.sources as Source[] | null) ?? null;
        const trace =
            role === 'assistant'
                ? {
                      provider: (m.provider as string | null) ?? null,
                      requestedModel: (m.model_requested as string | null) ?? null,
                      effectiveModel: (m.model_effective as string | null) ?? null,
                      costUsd:
                          m.cost_usd === null || m.cost_usd === undefined
                              ? null
                              : Number(m.cost_usd),
                      latencyMs:
                          m.latency_ms === null || m.latency_ms === undefined
                              ? null
                              : Number(m.latency_ms),
                      sourcesCount: sources?.length ?? 0,
                      createdAt: m.created_at as string,
                  }
                : null;
        const hasTrace =
            !!trace &&
            (trace.provider !== null ||
                trace.requestedModel !== null ||
                trace.effectiveModel !== null ||
                trace.costUsd !== null ||
                trace.latencyMs !== null);

        return {
            id: m.id as string,
            role,
            content: m.content as string,
            criadaEm: m.created_at as string,
            sources,
            trace: hasTrace ? trace : null,
        };
    });
}

// Janela de conversa para os prompts (anáfora: "eles", "deles" só se resolvem
// com o fio da conversa). Últimas `limite` mensagens, ordem cronológica,
// opcionalmente excluindo ids (o turno atual já vai explícito no prompt).
export async function ultimasMensagensCom(
    db: SupabaseClient,
    conversationId: string,
    limite = 10,
    excluirIds: string[] = [],
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    let query = db
        .from('messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limite);
    if (excluirIds.length) {
        query = query.not('id', 'in', `(${excluirIds.join(',')})`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`ultimasMensagens falhou: ${error.message}`);

    return (data ?? [])
        .reverse()
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));
}

// Cookie-session wrappers
export const listarConversas = async (): Promise<ConversaResumo[]> =>
    listarConversasCom(await createClient());

export const carregarConversa = async (id: string): Promise<MensagemHist[]> =>
    carregarConversaCom(await createClient(), id);
