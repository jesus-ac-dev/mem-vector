import type { SupabaseClient } from '@supabase/supabase-js';

import type { ResultadoOrquestracao } from './relay.orchestrator';

// Run-ledger do relay (#observability): deriva os campos consultáveis do resultado
// do orquestrador. 'bloqueado' guarda a fase onde parou; 'pr-aberto' o link do PR.
export function runDoResultado(resultado: ResultadoOrquestracao): {
    estado: string;
    fase: string | null;
    prUrl: string | null;
} {
    if (resultado.estado === 'pr-aberto') {
        return { estado: 'pr-aberto', fase: null, prUrl: resultado.prUrl };
    }
    if (resultado.estado === 'bloqueado') {
        return { estado: 'bloqueado', fase: resultado.cruzamento, prUrl: null };
    }
    return { estado: 'pronto', fase: null, prUrl: null };
}

// Persiste um run no ledger. Best-effort (a verdade do relay vive no GitHub). RLS
// scopa ao dono.
export async function registarRunRelayCom(
    db: SupabaseClient,
    opts: { repo: string; issue: number; resultado: ResultadoOrquestracao; inicio: Date },
): Promise<void> {
    const { estado, fase, prUrl } = runDoResultado(opts.resultado);
    // owner_id EXPLÍCITO (como o agent_jobs), não a depender do default auth.uid():
    // se a sessão não estiver no contexto, salta com aviso em vez de falhar mudo.
    const {
        data: { session },
    } = await db.auth.getSession();
    const ownerId = session?.user?.id;
    if (!ownerId) {
        console.error('registar run do relay: sem sessão para o owner (saltado).');
        return;
    }
    const { error } = await db.from('relay_runs').insert({
        owner_id: ownerId,
        repo_github: opts.repo,
        issue_github: opts.issue,
        estado,
        fase,
        pr_url: prUrl,
        started_em: opts.inicio.toISOString(),
    });
    if (error) console.error('registar run do relay falhou (segue):', error.message);
}

export interface RunRelay {
    repo: string;
    issue: number;
    estado: string;
    fase: string | null;
    prUrl: string | null;
    terminadoEm: string;
}

// Lê os runs recentes (todos os repos, ou de um). RLS scopa ao dono.
export async function lerRunsRelayCom(
    db: SupabaseClient,
    opts: { repo?: string; limite?: number } = {},
): Promise<RunRelay[]> {
    let q = db
        .from('relay_runs')
        .select('repo_github, issue_github, estado, fase, pr_url, ended_em')
        .order('ended_em', { ascending: false })
        .limit(opts.limite ?? 10);
    if (opts.repo) q = q.eq('repo_github', opts.repo);
    const { data, error } = await q;
    if (error) throw new Error(`ler runs do relay falhou: ${error.message}`);
    return (data ?? []).map((r) => {
        const row = r as {
            repo_github: string;
            issue_github: number;
            estado: string;
            fase: string | null;
            pr_url: string | null;
            ended_em: string;
        };
        return {
            repo: row.repo_github,
            issue: row.issue_github,
            estado: row.estado,
            fase: row.fase,
            prUrl: row.pr_url,
            terminadoEm: row.ended_em,
        };
    });
}
