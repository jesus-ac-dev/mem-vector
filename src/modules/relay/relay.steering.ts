import type { SupabaseClient } from '@supabase/supabase-js';

import { ownerIdCom } from './relay.owner';

// Steering a quente (#129): orientação humana escrita COM a corrida a meio. Fica
// pendente em relay_steering; o orchestrator consome as pendentes no próximo passo
// de produção (o principal integra-as com prioridade, como integra objeções) e
// deixa comentário assinado na issue. O kill-switch deixa de ser a única alavanca.

export interface SteeringPendente {
    id: string;
    texto: string;
    criadoEm: string;
}

// Grava uma orientação pendente. owner_id explícito (padrão relay_runs).
export async function guardarSteeringCom(
    db: SupabaseClient,
    opts: { repo: string; issue: number; texto: string },
): Promise<{ ok: boolean; detalhe: string }> {
    const texto = opts.texto.trim();
    if (!texto) return { ok: false, detalhe: 'Escreve a orientação primeiro.' };
    const ownerId = await ownerIdCom(db);
    if (!ownerId) return { ok: false, detalhe: 'Sessão expirada — recarrega para continuar.' };
    const { error } = await db.from('relay_steering').insert({
        owner_id: ownerId,
        repo_github: opts.repo,
        issue_github: opts.issue,
        texto,
    });
    if (error) return { ok: false, detalhe: `guardar orientação falhou: ${error.message}` };
    return {
        ok: true,
        detalhe: 'Orientação guardada — o relay integra-a no próximo passo de produção.',
    };
}

// Lista as orientações ainda não consumidas (para o modal mostrar o que espera).
export async function lerSteeringPendenteCom(
    db: SupabaseClient,
    opts: { repo: string; issue: number },
): Promise<SteeringPendente[]> {
    const { data, error } = await db
        .from('relay_steering')
        .select('id, texto, criado_em')
        .eq('repo_github', opts.repo)
        .eq('issue_github', opts.issue)
        .is('consumido_em', null)
        .order('criado_em', { ascending: true });
    if (error) throw new Error(`ler orientações pendentes falhou: ${error.message}`);
    return (data ?? []).map((r) => {
        const row = r as { id: string; texto: string; criado_em: string };
        return { id: row.id, texto: row.texto, criadoEm: row.criado_em };
    });
}

// Consumo em DOIS tempos (achado do Audit): ler as pendentes ANTES de produzir,
// marcar consumidas só DEPOIS do provider correr com elas no prompt. Marcar à
// cabeça perdia a orientação humana para sempre se o passo falhasse a seguir
// (GitHub 500, CLI a rebentar) — o retry já não a encontrava pendente.

// Lê as pendentes (id+texto) por ordem de chegada. Best-effort: erro devolve []
// — a corrida NUNCA cai por causa do steering.
export async function lerSteeringParaConsumoCom(
    db: SupabaseClient,
    opts: { repo: string; issue: number },
): Promise<{ id: string; texto: string }[]> {
    try {
        const { data, error } = await db
            .from('relay_steering')
            .select('id, texto')
            .eq('repo_github', opts.repo)
            .eq('issue_github', opts.issue)
            .is('consumido_em', null)
            .order('criado_em', { ascending: true });
        if (error) {
            console.error('ler steering pendente falhou (segue):', error.message);
            return [];
        }
        return (data ?? []) as { id: string; texto: string }[];
    } catch (e) {
        const detalhe = e instanceof Error ? e.message : String(e);
        console.error('ler steering pendente falhou (segue):', detalhe);
        return [];
    }
}

// Marca as orientações aplicadas (consumido_em + fase/ronda onde entraram).
// Best-effort: se falhar, ficam pendentes e a próxima ronda reaplica-as
// (duplicar orientação é inócuo; perdê-la não).
export async function marcarSteeringConsumidoCom(
    db: SupabaseClient,
    opts: { ids: string[]; fase: string; ronda: number },
): Promise<void> {
    if (opts.ids.length === 0) return;
    try {
        const { error } = await db
            .from('relay_steering')
            .update({
                consumido_em: new Date().toISOString(),
                consumido_fase: opts.fase,
                consumido_ronda: opts.ronda,
            })
            .in('id', opts.ids);
        if (error) console.error('marcar steering consumido falhou (segue):', error.message);
    } catch (e) {
        const detalhe = e instanceof Error ? e.message : String(e);
        console.error('marcar steering consumido falhou (segue):', detalhe);
    }
}
