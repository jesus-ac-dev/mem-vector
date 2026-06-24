import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { reindexEntity } from '@/lib/indexing';
import { regenerarEdgesCom, reconciliarEdgesPendentesCom } from '@/modules/knowledge/edges';
import { parseWikilinkTargets } from '@/modules/knowledge/knowledge.links';
import { varrerJobsCom } from '@/lib/jobs-sweep';

export const derivedIndexPayloadSchema = z.object({
    entityType: z.enum(['knowledge', 'daily']),
    entityId: z.string().uuid(),
});
export type DerivedIndexPayload = z.infer<typeof derivedIndexPayloadSchema>;

const derivedIndexResultSchema = z.object({
    entityType: z.enum(['knowledge', 'daily']),
    entityId: z.string().uuid(),
    skipped: z.enum(['not_found', 'archived']).nullable(),
});
export type DerivedIndexResult = z.infer<typeof derivedIndexResultSchema>;

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

function mensagemErro(e: unknown): string {
    return e instanceof Error ? e.message : 'erro desconhecido';
}

export async function criarDerivedIndexJobCom(
    db: SupabaseClient,
    payload: DerivedIndexPayload,
): Promise<string> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { data, error } = await db
        .from('agent_jobs')
        .insert({
            owner_id: user.id,
            type: 'derived_index_entity',
            status: 'pending',
            payload,
        })
        .select('id')
        .single();
    if (error || !data) throw new Error(`criar job de índices falhou: ${error?.message}`);
    return String(data.id);
}

export async function reclamarDerivedIndexJobCom(
    db: SupabaseClient,
    jobId: string,
): Promise<{ id: string; payload: DerivedIndexPayload } | null> {
    const { data, error } = await db.rpc('claim_agent_job', { p_job_id: jobId });
    if (error) throw new Error(`reclamar job de índices falhou: ${error.message}`);

    const row = normalizarJobRow(data);
    if (!row) return null;
    return {
        id: row.id,
        payload: derivedIndexPayloadSchema.parse(row.payload),
    };
}

async function concluirDerivedIndexJobCom(
    db: SupabaseClient,
    jobId: string,
    result: DerivedIndexResult,
): Promise<void> {
    const now = new Date().toISOString();
    const validResult = derivedIndexResultSchema.parse(result);
    const { error } = await db
        .from('agent_jobs')
        .update({
            status: 'done',
            result: validResult,
            error: null,
            finished_at: now,
            updated_at: now,
        })
        .eq('id', jobId);
    if (error) throw new Error(`concluir job de índices falhou: ${error.message}`);
}

async function falharDerivedIndexJobCom(
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
    if (error) throw new Error(`marcar job de índices como falhado: ${error.message}`);
}

export async function projectarIndicesEntityCom(
    db: SupabaseClient,
    payloadInput: DerivedIndexPayload,
): Promise<DerivedIndexResult> {
    const payload = derivedIndexPayloadSchema.parse(payloadInput);
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    if (payload.entityType === 'knowledge') {
        const { data: nota, error } = await db
            .from('knowledge')
            .select('id, slug, title, content_md, archived')
            .eq('owner_id', user.id)
            .eq('id', payload.entityId)
            .maybeSingle();
        if (error) throw new Error(`projectar knowledge: ${error.message}`);
        if (!nota) return { ...payload, skipped: 'not_found' };
        if (nota.archived) return { ...payload, skipped: 'archived' };

        await reindexEntity(db, {
            ownerId: user.id,
            entityType: 'knowledge',
            entityId: nota.id,
            source: 'knowledge',
            contentMd: nota.content_md,
            metadata: { slug: nota.slug, title: nota.title },
        });
        await regenerarEdgesCom(db, {
            ownerId: user.id,
            fromType: 'knowledge',
            fromId: nota.id,
            alvos: parseWikilinkTargets(nota.content_md),
        });
        // #121: resolve os links-fantasma que apontavam para este slug.
        await reconciliarEdgesPendentesCom(db, user.id, nota.slug, nota.id);
        return { ...payload, skipped: null };
    }

    const { data: daily, error } = await db
        .from('dailies')
        .select('id, dia, content_md')
        .eq('owner_id', user.id)
        .eq('id', payload.entityId)
        .maybeSingle();
    if (error) throw new Error(`projectar daily: ${error.message}`);
    if (!daily) return { ...payload, skipped: 'not_found' };

    await reindexEntity(db, {
        ownerId: user.id,
        entityType: 'daily',
        entityId: daily.id,
        source: 'daily',
        contentMd: daily.content_md,
        metadata: { dia: daily.dia },
    });
    await regenerarEdgesCom(db, {
        ownerId: user.id,
        fromType: 'daily',
        fromId: daily.id,
        alvos: parseWikilinkTargets(daily.content_md),
    });
    return { ...payload, skipped: null };
}

export async function processarDerivedIndexJobCom(
    db: SupabaseClient,
    jobId: string,
): Promise<DerivedIndexResult> {
    const job = await reclamarDerivedIndexJobCom(db, jobId);
    if (!job) throw new Error('job de índices já está em processamento ou concluído');

    try {
        const result = await projectarIndicesEntityCom(db, job.payload);
        await concluirDerivedIndexJobCom(db, job.id, result);
        return result;
    } catch (e) {
        const msg = mensagemErro(e);
        await falharDerivedIndexJobCom(db, job.id, msg);
        throw new Error(msg);
    }
}

export async function projectarIndicesAposEscritaCom(
    db: SupabaseClient,
    payload: DerivedIndexPayload,
): Promise<DerivedIndexResult> {
    const jobId = await criarDerivedIndexJobCom(db, payload);
    return processarDerivedIndexJobCom(db, jobId);
}

// Best-effort: a nota/daily já está gravada (RPC) — a projeção é derivada e
// retryable. Se falhar, o job fica durável (failed) e o sweeper retoma; NÃO
// rebenta a escrita por um blip de projeção (embeddings/DB). Torna verdadeiro o
// "Projector retryable... processado já".
export async function projectarIndicesBestEffortCom(
    db: SupabaseClient,
    payload: DerivedIndexPayload,
): Promise<void> {
    try {
        await projectarIndicesAposEscritaCom(db, payload);
    } catch {
        // Deixa o job (failed/durável) para varrerDerivedIndexPendentesCom retomar.
    }
}

const MAX_TENTATIVAS = 5; // pára de auto-retentar um job cronicamente partido
const LOCK_EXPIRADO_MS = 10 * 60 * 1000; // running com lock mais velho = órfão

// Jobs de projeção a (re)processar: pending, FAILED (≠ destilação — aqui a falha
// é transitória, ex. blip de embeddings, e a projeção converge por hash) e
// running órfão (processador morto). O cap de tentativas trava jobs partidos.
export async function listarDerivedIndexJobsPendentesCom(
    db: SupabaseClient,
    limite = 20,
): Promise<string[]> {
    const corte = new Date(Date.now() - LOCK_EXPIRADO_MS).toISOString();
    const { data, error } = await db
        .from('agent_jobs')
        .select('id')
        .eq('type', 'derived_index_entity')
        .lt('attempts', MAX_TENTATIVAS)
        .or(`status.eq.pending,status.eq.failed,and(status.eq.running,locked_at.lt.${corte})`)
        .order('created_at', { ascending: true })
        .limit(limite);
    if (error) throw new Error(`listar jobs de índices pendentes falhou: ${error.message}`);
    return (data ?? []).map((r) => String((r as { id: string }).id));
}

// Sweeper: varre e reprocessa os jobs de projeção presos. Idempotente (re-projetar
// converge por hash). Disparado por after() pós-resposta, ao lado do da destilação.
export async function varrerDerivedIndexPendentesCom(
    db: SupabaseClient,
): Promise<{ processados: number; falhados: number }> {
    const ids = await listarDerivedIndexJobsPendentesCom(db);
    return varrerJobsCom(ids, (id) => processarDerivedIndexJobCom(db, id));
}
