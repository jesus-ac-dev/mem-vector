import type { SupabaseClient } from '@supabase/supabase-js';

// Event-stream por corrida do relay (#129): cada passo gravado NO MOMENTO em que
// acontece — não um resumo no fim. É o "ver o CLI" do double-click: quem correu,
// em que fase/ronda, com que veredito, quanto custou e quanto demorou. O texto
// COMPLETO continua nos comentários da issue (o GitHub é a verdade auditável);
// aqui vive a timeline consultável na app. Sem FK para relay_runs de propósito:
// se o processo morrer, os eventos sobrevivem e contam a história.

export type TipoEventoRelay = 'passo' | 'testes' | 'transicao' | 'steering' | 'fim';

// O evento como o orchestrator o emite (sem o contexto da corrida — a IO junta
// runId/repo/issue ao gravar).
export interface EventoRelayBase {
    tipo: TipoEventoRelay;
    fase?: string | null;
    ronda?: number | null;
    provider?: string | null;
    papel?: 'principal' | 'validador' | null;
    veredito?: 'ok' | 'rejeitado' | null;
    detalhe?: string;
    modelo?: string | null;
    custoUsd?: number | null;
    custoEstimado?: boolean | null;
    duracaoMs?: number | null;
}

export interface EventoRelay extends EventoRelayBase {
    runId: string;
    repo: string;
    issue: number;
}

export interface EventoRelayLido extends EventoRelayBase {
    runId: string;
    criadoEm: string;
}

// Resumo curto para a timeline (uma linha; o texto completo vive na issue).
export function resumoEvento(texto: string, max = 400): string {
    const limpo = texto.replace(/\s+/g, ' ').trim();
    if (limpo.length <= max) return limpo;
    return `${limpo.slice(0, max - 1).trimEnd()}…`;
}

// Persiste um evento. Best-effort como o run-ledger: a corrida NUNCA cai por
// causa da observabilidade. owner_id explícito (padrão do agent_jobs/relay_runs).
export async function registarEventoRelayCom(
    db: SupabaseClient,
    evento: EventoRelay,
): Promise<void> {
    try {
        const {
            data: { session },
        } = await db.auth.getSession();
        const ownerId = session?.user?.id;
        if (!ownerId) {
            console.error('registar evento do relay: sem sessão para o owner (saltado).');
            return;
        }
        const { error } = await db.from('relay_eventos').insert({
            owner_id: ownerId,
            run_id: evento.runId,
            repo_github: evento.repo,
            issue_github: evento.issue,
            tipo: evento.tipo,
            fase: evento.fase ?? null,
            ronda: evento.ronda ?? null,
            provider: evento.provider ?? null,
            papel: evento.papel ?? null,
            veredito: evento.veredito ?? null,
            detalhe: evento.detalhe ?? '',
            modelo: evento.modelo ?? null,
            custo_usd: evento.custoUsd ?? null,
            custo_estimado: evento.custoEstimado ?? null,
            duracao_ms: evento.duracaoMs == null ? null : Math.round(evento.duracaoMs),
        });
        if (error) console.error('registar evento do relay falhou (segue):', error.message);
    } catch (e) {
        const detalhe = e instanceof Error ? e.message : String(e);
        console.error('registar evento do relay falhou (segue):', detalhe);
    }
}

// Lê os eventos mais recentes de uma (repo, issue) e devolve-os em ordem
// cronológica (timeline pronta a renderizar). RLS scopa ao dono.
export async function lerEventosRelayCom(
    db: SupabaseClient,
    opts: { repo: string; issue: number; limite?: number },
): Promise<EventoRelayLido[]> {
    const limite = Math.min(Math.max(Math.trunc(opts.limite ?? 200), 1), 500);
    const { data, error } = await db
        .from('relay_eventos')
        .select(
            'run_id, tipo, fase, ronda, provider, papel, veredito, detalhe, modelo, custo_usd, custo_estimado, duracao_ms, criado_em',
        )
        .eq('repo_github', opts.repo)
        .eq('issue_github', opts.issue)
        .order('criado_em', { ascending: false })
        .limit(limite);
    if (error) throw new Error(`ler eventos do relay falhou: ${error.message}`);
    return (data ?? [])
        .map((r) => {
            const row = r as {
                run_id: string;
                tipo: TipoEventoRelay;
                fase: string | null;
                ronda: number | null;
                provider: string | null;
                papel: 'principal' | 'validador' | null;
                veredito: 'ok' | 'rejeitado' | null;
                detalhe: string;
                modelo: string | null;
                custo_usd: number | null;
                custo_estimado: boolean | null;
                duracao_ms: number | null;
                criado_em: string;
            };
            return {
                runId: row.run_id,
                tipo: row.tipo,
                fase: row.fase,
                ronda: row.ronda,
                provider: row.provider,
                papel: row.papel,
                veredito: row.veredito,
                detalhe: row.detalhe,
                modelo: row.modelo,
                custoUsd: row.custo_usd,
                custoEstimado: row.custo_estimado,
                duracaoMs: row.duracao_ms,
                criadoEm: row.criado_em,
            };
        })
        .reverse();
}
