import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { TurnoDestilado } from './chat.service';

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
