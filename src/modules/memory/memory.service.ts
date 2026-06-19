import type { SupabaseClient } from '@supabase/supabase-js';

import { blocoKernelCom } from '@/agent/kernel';
import { createClient } from '@/lib/supabase/server';
import {
    AbrirSessaoInputSchema,
    CriarHandoffInputSchema,
    RegistarObservacaoInputSchema,
    type AbrirSessaoInput,
    type EstadoHandoffAgente,
    type HandoffAgente,
    type JsonMemoria,
    type ObservacaoAgente,
    type RegistarObservacaoInput,
    type SessaoAgente,
    type CriarHandoffInput,
} from './memory.schema';

const OBSERVATION_CONTENT_LIMIT = 12000;

interface SessionRow {
    id: string;
    conversation_id: string | null;
    operator: string;
    runner: string;
    status: 'active' | 'closed';
    started_at: string;
    ended_at: string | null;
}

interface ObservationRow {
    id: string;
    session_id: string | null;
    conversation_id: string | null;
    type: ObservacaoAgente['type'];
    content: string | null;
    metadata: JsonMemoria;
    occurred_at: string;
}

interface HandoffRow {
    id: string;
    session_id: string | null;
    conversation_id: string | null;
    summary: string;
    open_questions: string[];
    next_steps: string[];
    entities_touched: JsonMemoria[];
    status: EstadoHandoffAgente;
    accepted_by: string | null;
    accepted_at: string | null;
    expired_at: string | null;
    created_at: string;
    updated_at: string;
}

interface ConversationScope {
    visibility: 'privado' | 'protected';
    group_id: string | null;
}

export interface ContagensMemoria {
    mensagens7d: number;
    mensagens30d: number;
    observacoes7d: number;
    observacoes30d: number;
    escritas7d: number;
    escritas30d: number;
    tarefas7d: number;
    tarefas30d: number;
}

export interface ItemRecenteMemoria {
    tipo: 'knowledge' | 'daily' | 'tarefa';
    id: string;
    titulo: string;
    updatedAt: string;
}

export interface BriefingMemoria {
    contagens: ContagensMemoria;
    handoffsAbertos: HandoffAgente[];
    recentes: ItemRecenteMemoria[];
    kernel: string;
    texto: string;
}

export function sanitizarTextoMemoria(input: string): string {
    return input
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redigido]')
        .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{10,}/g, '[chave-openai-redigida]')
        .replace(/\b(A3T|AKIA|ASIA)[A-Z0-9]{12,}/g, '[chave-aws-redigida]')
        .replace(
            /\b(api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*["']?[^"'\s,;]+/gi,
            '$1=[redigido]',
        )
        .replace(/\b([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+):([^@\s/]+)@/gi, '$1:[redigido]@')
        .replace(
            /(?:~|\/[A-Za-z0-9._-]+)*(\/\.(?:ssh|aws|kube))(?:\/[^\s'")\]]*)?/g,
            '[caminho-sensivel-redigido]',
        );
}

export function sanitizarJsonMemoria(value: unknown): JsonMemoria {
    if (typeof value === 'string') return sanitizarTextoMemoria(value);
    if (Array.isArray(value)) return value.map((item) => sanitizarJsonMemoria(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, sanitizarJsonMemoria(item)]),
        );
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
    if (value === undefined) return null;
    return String(value);
}

function toSessao(row: SessionRow): SessaoAgente {
    return {
        id: row.id,
        conversationId: row.conversation_id,
        operator: row.operator,
        runner: row.runner,
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
    };
}

function toObservacao(row: ObservationRow): ObservacaoAgente {
    return {
        id: row.id,
        sessionId: row.session_id,
        conversationId: row.conversation_id,
        type: row.type,
        content: row.content,
        metadata: row.metadata,
        occurredAt: row.occurred_at,
    };
}

function toHandoff(row: HandoffRow): HandoffAgente {
    return {
        id: row.id,
        sessionId: row.session_id,
        conversationId: row.conversation_id,
        summary: row.summary,
        openQuestions: row.open_questions,
        nextSteps: row.next_steps,
        entitiesTouched: row.entities_touched,
        status: row.status,
        acceptedBy: row.accepted_by,
        acceptedAt: row.accepted_at,
        expiredAt: row.expired_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function inicioJanela(dias: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - dias);
    return d.toISOString();
}

async function utilizadorAtual(db: SupabaseClient): Promise<string> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    return user.id;
}

async function scopeDaConversa(
    db: SupabaseClient,
    conversationId?: string,
): Promise<ConversationScope | null> {
    if (!conversationId) return null;
    const { data, error } = await db
        .from('conversations')
        .select('visibility, group_id')
        .eq('id', conversationId)
        .maybeSingle();
    if (error) throw new Error(`ler âmbito da conversa: ${error.message}`);
    if (!data) throw new Error('conversa não encontrada');
    return {
        visibility: (data.visibility as 'privado' | 'protected') ?? 'privado',
        group_id: (data.group_id as string | null) ?? null,
    };
}

function scopeComFallback(
    input: { visibility: 'privado' | 'protected'; groupId?: string },
    scope: ConversationScope | null,
): { visibility: 'privado' | 'protected'; groupId: string | null } {
    const visibility = scope?.visibility ?? input.visibility;
    const groupId = scope?.group_id ?? input.groupId ?? null;
    if (visibility === 'protected' && !groupId) {
        throw new Error('memória protected precisa de grupo');
    }
    return { visibility, groupId };
}

export async function abrirOuReusarSessaoCom(
    db: SupabaseClient,
    input: AbrirSessaoInput = {},
): Promise<SessaoAgente> {
    const dados = AbrirSessaoInputSchema.parse(input);
    const ownerId = await utilizadorAtual(db);
    const scope = await scopeDaConversa(db, dados.conversationId);
    const vis = scopeComFallback(dados, scope);

    let query = db
        .from('agent_sessions')
        .select('id, conversation_id, operator, runner, status, started_at, ended_at')
        .eq('owner_id', ownerId)
        .eq('status', 'active')
        .eq('operator', dados.operator)
        .eq('runner', dados.runner)
        .order('started_at', { ascending: false })
        .limit(1);

    query = dados.conversationId
        ? query.eq('conversation_id', dados.conversationId)
        : query.is('conversation_id', null);

    const existente = await query.maybeSingle();
    if (existente.error) throw new Error(`reusar sessão de agente: ${existente.error.message}`);
    if (existente.data) return toSessao(existente.data as SessionRow);

    const metadata = dados.metadata === undefined ? {} : sanitizarJsonMemoria(dados.metadata);
    const { data, error } = await db
        .from('agent_sessions')
        .insert({
            owner_id: ownerId,
            conversation_id: dados.conversationId ?? null,
            operator: dados.operator,
            runner: dados.runner,
            status: 'active',
            metadata,
            visibility: vis.visibility,
            group_id: vis.groupId,
        })
        .select('id, conversation_id, operator, runner, status, started_at, ended_at')
        .single();
    if (error || !data) throw new Error(`abrir sessão de agente: ${error?.message ?? 'sem dados'}`);
    return toSessao(data as SessionRow);
}

export async function registarObservacaoCom(
    db: SupabaseClient,
    input: RegistarObservacaoInput,
): Promise<ObservacaoAgente> {
    const dados = RegistarObservacaoInputSchema.parse(input);
    const ownerId = await utilizadorAtual(db);
    const scope = await scopeDaConversa(db, dados.conversationId);
    const vis = scopeComFallback(dados, scope);
    const content = dados.content
        ? sanitizarTextoMemoria(dados.content).slice(0, OBSERVATION_CONTENT_LIMIT)
        : null;
    const metadata = dados.metadata === undefined ? {} : sanitizarJsonMemoria(dados.metadata);

    const { data, error } = await db
        .from('agent_observations')
        .insert({
            owner_id: ownerId,
            session_id: dados.sessionId ?? null,
            conversation_id: dados.conversationId ?? null,
            type: dados.type,
            content,
            metadata,
            visibility: vis.visibility,
            group_id: vis.groupId,
        })
        .select('id, session_id, conversation_id, type, content, metadata, occurred_at')
        .single();
    if (error || !data) throw new Error(`registar observação: ${error?.message ?? 'sem dados'}`);
    return toObservacao(data as ObservationRow);
}

export async function fecharSessaoCom(
    db: SupabaseClient,
    sessionId: string,
    metadata: JsonMemoria = {},
): Promise<SessaoAgente> {
    await utilizadorAtual(db);
    const now = new Date().toISOString();
    const { data, error } = await db
        .from('agent_sessions')
        .update({
            status: 'closed',
            ended_at: now,
            updated_at: now,
            metadata: sanitizarJsonMemoria(metadata),
        })
        .eq('id', sessionId)
        .select('id, conversation_id, operator, runner, status, started_at, ended_at')
        .single();
    if (error || !data)
        throw new Error(`fechar sessão de agente: ${error?.message ?? 'sem dados'}`);
    const sessao = toSessao(data as SessionRow);
    await registarObservacaoCom(db, {
        sessionId: sessao.id,
        conversationId: sessao.conversationId ?? undefined,
        type: 'session-end',
        metadata,
    });
    return sessao;
}

export async function criarHandoffCom(
    db: SupabaseClient,
    input: CriarHandoffInput,
): Promise<HandoffAgente> {
    const dados = CriarHandoffInputSchema.parse(input);
    const ownerId = await utilizadorAtual(db);
    const scope = await scopeDaConversa(db, dados.conversationId);
    const vis = scopeComFallback(dados, scope);
    const { data, error } = await db
        .from('agent_handoffs')
        .insert({
            owner_id: ownerId,
            session_id: dados.sessionId ?? null,
            conversation_id: dados.conversationId ?? null,
            summary: sanitizarTextoMemoria(dados.summary),
            open_questions: sanitizarJsonMemoria(dados.openQuestions) as string[],
            next_steps: sanitizarJsonMemoria(dados.nextSteps) as string[],
            entities_touched: sanitizarJsonMemoria(dados.entitiesTouched) as JsonMemoria[],
            metadata: dados.metadata === undefined ? {} : sanitizarJsonMemoria(dados.metadata),
            visibility: vis.visibility,
            group_id: vis.groupId,
        })
        .select(
            'id, session_id, conversation_id, summary, open_questions, next_steps, entities_touched, status, accepted_by, accepted_at, expired_at, created_at, updated_at',
        )
        .single();
    if (error || !data) throw new Error(`criar handoff: ${error?.message ?? 'sem dados'}`);
    return toHandoff(data as HandoffRow);
}

async function mudarEstadoHandoffCom(
    db: SupabaseClient,
    id: string,
    destino: Exclude<EstadoHandoffAgente, 'open'>,
): Promise<HandoffAgente> {
    const userId = await utilizadorAtual(db);
    const { data: atual, error: leituraErro } = await db
        .from('agent_handoffs')
        .select(
            'id, session_id, conversation_id, summary, open_questions, next_steps, entities_touched, status, accepted_by, accepted_at, expired_at, created_at, updated_at',
        )
        .eq('id', id)
        .maybeSingle();
    if (leituraErro) throw new Error(`ler handoff: ${leituraErro.message}`);
    if (!atual) throw new Error('handoff não encontrado');

    const handoffAtual = toHandoff(atual as HandoffRow);
    if (handoffAtual.status === destino) return handoffAtual;
    if (handoffAtual.status !== 'open') {
        throw new Error(`handoff já está ${handoffAtual.status}`);
    }

    const now = new Date().toISOString();
    const patch =
        destino === 'accepted'
            ? { status: destino, accepted_by: userId, accepted_at: now, updated_at: now }
            : { status: destino, expired_at: now, updated_at: now };

    const { data, error } = await db
        .from('agent_handoffs')
        .update(patch)
        .eq('id', id)
        .eq('status', 'open')
        .select(
            'id, session_id, conversation_id, summary, open_questions, next_steps, entities_touched, status, accepted_by, accepted_at, expired_at, created_at, updated_at',
        )
        .single();
    if (error || !data)
        throw new Error(`mudar estado do handoff: ${error?.message ?? 'sem dados'}`);
    return toHandoff(data as HandoffRow);
}

export async function aceitarHandoffCom(db: SupabaseClient, id: string): Promise<HandoffAgente> {
    return mudarEstadoHandoffCom(db, id, 'accepted');
}

export async function expirarHandoffCom(db: SupabaseClient, id: string): Promise<HandoffAgente> {
    return mudarEstadoHandoffCom(db, id, 'expired');
}

async function contarDesde(
    db: SupabaseClient,
    tabela: string,
    colunaData: string,
    desde: string,
): Promise<number> {
    const { count, error } = await db
        .from(tabela)
        .select('id', { count: 'exact', head: true })
        .gte(colunaData, desde);
    if (error) throw new Error(`contar ${tabela}: ${error.message}`);
    return count ?? 0;
}

export function montarTextoBriefingMemoria(input: Omit<BriefingMemoria, 'texto'>): string {
    const linhas = [
        'BRIEFING DE MEMÓRIA OPERACIONAL',
        `Mensagens: ${input.contagens.mensagens7d} em 7d / ${input.contagens.mensagens30d} em 30d`,
        `Observações: ${input.contagens.observacoes7d} em 7d / ${input.contagens.observacoes30d} em 30d`,
        `Escritas: ${input.contagens.escritas7d} em 7d / ${input.contagens.escritas30d} em 30d`,
        `Tarefas: ${input.contagens.tarefas7d} em 7d / ${input.contagens.tarefas30d} em 30d`,
    ];

    if (input.handoffsAbertos.length) {
        linhas.push(
            'Handoffs abertos:',
            ...input.handoffsAbertos.slice(0, 5).map((h) => `- ${h.summary}`),
        );
    }
    if (input.recentes.length) {
        linhas.push(
            'Itens recentes:',
            ...input.recentes.slice(0, 10).map((r) => `- ${r.tipo}: ${r.titulo}`),
        );
    }
    if (input.kernel.trim()) linhas.push(input.kernel.trim());
    return linhas.join('\n');
}

export async function briefingMemoriaCom(db: SupabaseClient): Promise<BriefingMemoria> {
    await utilizadorAtual(db);
    const desde7d = inicioJanela(7);
    const desde30d = inicioJanela(30);

    const [
        mensagens7d,
        mensagens30d,
        observacoes7d,
        observacoes30d,
        escritas7d,
        escritas30d,
        tarefas7d,
        tarefas30d,
        handoffs,
        knowledge,
        dailies,
        tarefas,
        kernel,
    ] = await Promise.all([
        contarDesde(db, 'messages', 'created_at', desde7d),
        contarDesde(db, 'messages', 'created_at', desde30d),
        contarDesde(db, 'agent_observations', 'occurred_at', desde7d),
        contarDesde(db, 'agent_observations', 'occurred_at', desde30d),
        contarDesde(db, 'file_versions', 'created_at', desde7d),
        contarDesde(db, 'file_versions', 'created_at', desde30d),
        contarDesde(db, 'tarefas', 'created_at', desde7d),
        contarDesde(db, 'tarefas', 'created_at', desde30d),
        db
            .from('agent_handoffs')
            .select(
                'id, session_id, conversation_id, summary, open_questions, next_steps, entities_touched, status, accepted_by, accepted_at, expired_at, created_at, updated_at',
            )
            .eq('status', 'open')
            .order('created_at', { ascending: false })
            .limit(10),
        db
            .from('knowledge')
            .select('id, title, updated_at')
            .eq('archived', false)
            .order('updated_at', { ascending: false })
            .limit(5),
        db
            .from('dailies')
            .select('id, dia, updated_at')
            .order('updated_at', { ascending: false })
            .limit(5),
        db
            .from('tarefas')
            .select('id, titulo, created_at')
            .order('created_at', { ascending: false })
            .limit(5),
        blocoKernelCom(db),
    ]);

    if (handoffs.error) throw new Error(`listar handoffs: ${handoffs.error.message}`);
    if (knowledge.error) throw new Error(`listar knowledge recente: ${knowledge.error.message}`);
    if (dailies.error) throw new Error(`listar dailies recentes: ${dailies.error.message}`);
    if (tarefas.error) throw new Error(`listar tarefas recentes: ${tarefas.error.message}`);

    const briefingSemTexto = {
        contagens: {
            mensagens7d,
            mensagens30d,
            observacoes7d,
            observacoes30d,
            escritas7d,
            escritas30d,
            tarefas7d,
            tarefas30d,
        },
        handoffsAbertos: ((handoffs.data ?? []) as HandoffRow[]).map(toHandoff),
        recentes: [
            ...(knowledge.data ?? []).map((r) => ({
                tipo: 'knowledge' as const,
                id: String(r.id),
                titulo: String(r.title),
                updatedAt: String(r.updated_at),
            })),
            ...(dailies.data ?? []).map((r) => ({
                tipo: 'daily' as const,
                id: String(r.id),
                titulo: String(r.dia),
                updatedAt: String(r.updated_at),
            })),
            ...(tarefas.data ?? []).map((r) => ({
                tipo: 'tarefa' as const,
                id: String(r.id),
                titulo: String(r.titulo),
                updatedAt: String(r.created_at),
            })),
        ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
        kernel,
    };

    return {
        ...briefingSemTexto,
        texto: montarTextoBriefingMemoria(briefingSemTexto),
    };
}

export const abrirOuReusarSessao = async (input?: AbrirSessaoInput) =>
    abrirOuReusarSessaoCom(await createClient(), input);
export const registarObservacao = async (input: RegistarObservacaoInput) =>
    registarObservacaoCom(await createClient(), input);
export const fecharSessao = async (sessionId: string, metadata?: JsonMemoria) =>
    fecharSessaoCom(await createClient(), sessionId, metadata);
export const criarHandoff = async (input: CriarHandoffInput) =>
    criarHandoffCom(await createClient(), input);
export const aceitarHandoff = async (id: string) => aceitarHandoffCom(await createClient(), id);
export const briefingMemoria = async () => briefingMemoriaCom(await createClient());
