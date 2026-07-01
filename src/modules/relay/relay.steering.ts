import type { SupabaseClient } from '@supabase/supabase-js';

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
    const {
        data: { session },
    } = await db.auth.getSession();
    const ownerId = session?.user?.id;
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

// Consome as pendentes (marca consumido_em + fase/ronda onde entraram) e devolve
// os textos por ordem de chegada. Best-effort: um erro aqui devolve [] — a corrida
// NUNCA cai por causa do steering.
export async function consumirSteeringCom(
    db: SupabaseClient,
    opts: { repo: string; issue: number; fase: string; ronda: number },
): Promise<string[]> {
    try {
        const { data, error } = await db
            .from('relay_steering')
            .select('id, texto')
            .eq('repo_github', opts.repo)
            .eq('issue_github', opts.issue)
            .is('consumido_em', null)
            .order('criado_em', { ascending: true });
        if (error) {
            console.error('consumir steering falhou (segue):', error.message);
            return [];
        }
        const pendentes = (data ?? []) as { id: string; texto: string }[];
        if (pendentes.length === 0) return [];
        const { error: erroUpdate } = await db
            .from('relay_steering')
            .update({
                consumido_em: new Date().toISOString(),
                consumido_fase: opts.fase,
                consumido_ronda: opts.ronda,
            })
            .in(
                'id',
                pendentes.map((p) => p.id),
            );
        if (erroUpdate) {
            // Não conseguiu marcar: NÃO entrega os textos (senão repetiam-se em
            // cada ronda até o update passar).
            console.error('marcar steering consumido falhou (segue):', erroUpdate.message);
            return [];
        }
        return pendentes.map((p) => p.texto);
    } catch (e) {
        const detalhe = e instanceof Error ? e.message : String(e);
        console.error('consumir steering falhou (segue):', detalhe);
        return [];
    }
}
