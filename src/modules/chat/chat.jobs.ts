import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { TurnoDestilado } from './chat.service';
import { executarDestilacaoTurnoCom } from './chat.postturno';

// #118: um 'running' cujo lock passou disto é órfão (processador morto). Alinhado
// com a condição da claim_agent_job (10 min) — bem além do timeout de 5 min da
// destilação agentic, para nunca roubar um job que ainda corre mesmo.
const LOCK_EXPIRADO_MS = 10 * 60 * 1000;
const MAX_TENTATIVAS = 5; // pára de auto-retentar um job cronicamente partido
const POLL_INTERVALO_MS = 1000;
const POLL_TIMEOUT_MS = 330_000; // > timeout da destilação agentic (5 min)

export const distillationJobPayloadSchema = z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
    conversationId: z.string().uuid(),
    userMessageId: z.string().uuid().nullable(),
    assistantMessageId: z.string().uuid().nullable(),
});
export type DistillationJobPayload = z.infer<typeof distillationJobPayloadSchema>;

const notaResultadoSchema = z.object({
    slug: z.string(),
    title: z.string(),
    criada: z.boolean(),
});

const dailyResultadoSchema = z
    .object({
        dia: z.string(),
        criado: z.boolean(),
    })
    .nullable();

const tarefasResultadoSchema = z.object({
    criadas: z.array(
        z.object({
            id: z.string(),
            titulo: z.string(),
        }),
    ),
    concluidas: z.array(
        z.object({
            id: z.string(),
            titulo: z.string(),
        }),
    ),
});

// Tolera o shape antigo {nota: {...}|null} de jobs persistidos antes do 1 bloco→N
// notas (espelha a tolerância do parseTurno), mapeando-o para {notas: [...]}.
export const distillationJobResultSchema = z.preprocess(
    (v) => {
        if (v && typeof v === 'object' && !Array.isArray(v) && 'nota' in v && !('notas' in v)) {
            const { nota, ...resto } = v as Record<string, unknown>;
            return { ...resto, notas: nota ? [nota] : [] };
        }
        return v;
    },
    z.object({
        notas: z.array(notaResultadoSchema),
        daily: dailyResultadoSchema,
        tarefas: tarefasResultadoSchema.nullable().optional(),
    }),
);

interface AgentJobRow {
    id: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    payload: unknown;
    result: unknown;
    error: string | null;
}

function normalizarJobRow(value: unknown): AgentJobRow | null {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.status !== 'string') return null;
    if (!['pending', 'running', 'done', 'failed'].includes(record.status)) return null;
    return {
        id: record.id,
        status: record.status as AgentJobRow['status'],
        payload: record.payload,
        result: record.result,
        error: typeof record.error === 'string' ? record.error : null,
    };
}

export function parseDistillationJobResult(value: unknown): TurnoDestilado {
    return distillationJobResultSchema.parse(value);
}

export async function criarDestilacaoJobCom(
    db: SupabaseClient,
    payload: DistillationJobPayload,
): Promise<string> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { data, error } = await db
        .from('agent_jobs')
        .insert({
            owner_id: user.id,
            type: 'chat_turn_distillation',
            status: 'pending',
            payload,
        })
        .select('id')
        .single();
    if (error || !data) throw new Error(`criar job de destilação falhou: ${error?.message}`);
    return String(data.id);
}

export async function reclamarDestilacaoJobCom(
    db: SupabaseClient,
    jobId: string,
): Promise<{ id: string; payload: DistillationJobPayload } | null> {
    const { data, error } = await db.rpc('claim_agent_job', { p_job_id: jobId });
    if (error) throw new Error(`reclamar job de destilação falhou: ${error.message}`);

    const row = normalizarJobRow(data);
    if (!row) return null;
    return {
        id: row.id,
        payload: distillationJobPayloadSchema.parse(row.payload),
    };
}

export async function estadoDestilacaoJobCom(
    db: SupabaseClient,
    jobId: string,
): Promise<{ status: AgentJobRow['status']; result: TurnoDestilado | null; error: string | null }> {
    const { data, error } = await db
        .from('agent_jobs')
        .select('status, result, error')
        .eq('id', jobId)
        .maybeSingle();
    if (error) throw new Error(`ler job de destilação falhou: ${error.message}`);
    if (!data) throw new Error('job de destilação não encontrado');

    const row = normalizarJobRow({ id: jobId, ...data });
    if (!row) throw new Error('job de destilação inválido');

    return {
        status: row.status,
        result: row.status === 'done' && row.result ? parseDistillationJobResult(row.result) : null,
        error: row.error,
    };
}

export async function concluirDestilacaoJobCom(
    db: SupabaseClient,
    jobId: string,
    result: TurnoDestilado,
): Promise<void> {
    const { error } = await db
        .from('agent_jobs')
        .update({
            status: 'done',
            result,
            error: null,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    if (error) throw new Error(`concluir job de destilação falhou: ${error.message}`);
}

export async function falharDestilacaoJobCom(
    db: SupabaseClient,
    jobId: string,
    errorMessage: string,
): Promise<void> {
    const { error } = await db
        .from('agent_jobs')
        .update({
            status: 'failed',
            error: errorMessage.slice(0, 1000),
            locked_at: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    if (error) throw new Error(`marcar job de destilação como falhado: ${error.message}`);
}

// #118: jobs que o sweeper server-side deve processar — os 'pending' (ainda por
// começar) e os 'running' órfãos (lock expirado, processador morto). Exclui os
// cronicamente partidos (attempts >= MAX_TENTATIVAS) para não retentar em loop.
export async function listarDestilacaoJobsPendentesCom(
    db: SupabaseClient,
    limite = 20,
): Promise<string[]> {
    const corte = new Date(Date.now() - LOCK_EXPIRADO_MS).toISOString();
    const { data, error } = await db
        .from('agent_jobs')
        .select('id')
        .eq('type', 'chat_turn_distillation')
        .lt('attempts', MAX_TENTATIVAS)
        .or(`status.eq.pending,and(status.eq.running,locked_at.lt.${corte})`)
        .order('created_at', { ascending: true })
        .limit(limite);
    if (error) throw new Error(`listar jobs pendentes falhou: ${error.message}`);
    return (data ?? []).map((r) => String((r as { id: string }).id));
}

// Espera a conclusão de um job que outro processador (o servidor via after, ou
// outra aba) já reclamou — para o chamador receber o resultado em vez de um erro
// "já está em processamento". O job é durável; isto é só a observação para a UI.
async function aguardarConclusaoJobCom(db: SupabaseClient, jobId: string): Promise<TurnoDestilado> {
    const limite = Date.now() + POLL_TIMEOUT_MS;
    for (;;) {
        const estado = await estadoDestilacaoJobCom(db, jobId);
        if (estado.status === 'done' && estado.result) return estado.result;
        if (estado.status === 'failed') throw new Error(estado.error ?? 'job de destilação falhou');
        if (Date.now() > limite) throw new Error('a destilação demorou demais');
        await new Promise((r) => setTimeout(r, POLL_INTERVALO_MS));
    }
}

// Reclama e processa um job de destilação. Se a claim falhar porque outro
// processador já o reclamou (corrida cliente/servidor), observa até concluir.
export async function processarDestilacaoJobCom(
    db: SupabaseClient,
    jobId: string,
): Promise<TurnoDestilado> {
    const job = await reclamarDestilacaoJobCom(db, jobId);
    if (!job) return aguardarConclusaoJobCom(db, jobId);

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
        const msg = e instanceof Error ? e.message : 'erro desconhecido';
        await falharDestilacaoJobCom(db, job.id, msg);
        throw new Error(msg);
    }
}

// Orquestração pura do sweeper: processa cada job, isolando falhas (uma não
// derruba as outras). Sem deps de BD — testável com mocks.
export async function varrerJobsCom(
    ids: string[],
    processar: (id: string) => Promise<unknown>,
): Promise<{ processados: number; falhados: number }> {
    let processados = 0;
    let falhados = 0;
    for (const id of ids) {
        try {
            await processar(id);
            processados += 1;
        } catch {
            falhados += 1;
        }
    }
    return { processados, falhados };
}

// O sweeper server-side: varre os jobs por processar do utilizador (o acabado de
// criar + órfãos de turnos anteriores) e processa-os. Disparado por after() a
// seguir à resposta, é a peça determinista que garante que nenhuma interação
// fica sem rasto, mesmo que a tab feche.
export async function varrerDestilacaoPendentesCom(
    db: SupabaseClient,
): Promise<{ processados: number; falhados: number }> {
    const ids = await listarDestilacaoJobsPendentesCom(db);
    return varrerJobsCom(ids, (id) => processarDestilacaoJobCom(db, id));
}
