import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { nomesDosAutoresCom } from '@/modules/knowledge/versoes-nomes';
import { projectarIndicesAposEscritaCom } from '@/modules/workspace/index-projector';
import { registarEdgeConversaCom } from '@/modules/knowledge/edges';

export interface ResultadoAcrescento {
    dia: string;
    criado: boolean;
}

export interface DailyListItem {
    id: string;
    dia: string;
    updatedAt: string;
}

export interface Daily {
    id: string;
    dia: string;
    contentMd: string;
    updatedAt: string;
}

export interface Versao {
    id: string;
    contentMd: string;
    author: string; // 'agent' | 'user' (quem: autorNome)
    autorNome: string | null; // display name/email do author_id (null = desconhecido)
    createdAt: string;
}

interface AppendDailyEntryRow {
    id: string;
    dia: string;
    content_md: string;
    updated_at: string;
    criado: boolean;
}

interface ReplaceDailyEntryByIdRow {
    id: string;
    dia: string;
    content_md: string;
    updated_at: string;
}

export function hojeLisboa(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(date);
}

export async function acrescentarAoDailyCom(
    db: SupabaseClient,
    linha: string,
    dia?: string,
    conversationId?: string,
): Promise<ResultadoAcrescento> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const diaAlvo = dia ?? hojeLisboa();
    const linhaNormalizada = linha.trim();
    if (!linhaNormalizada) throw new Error('daily vazio');

    // Append atómico no Postgres: serializa por (user,dia), atualiza/cria o daily
    // e grava a versão imutável no mesmo statement transacional.
    const up = await db
        .rpc('append_daily_entry', { p_dia: diaAlvo, p_linha: linhaNormalizada })
        .single();
    if (up.error || !up.data) throw new Error(`append daily: ${up.error?.message}`);
    const daily = up.data as AppendDailyEntryRow;

    // Versão imutável do conteúdo desta escrita.
    // Criada pela RPC `append_daily_entry`, no mesmo statement que atualiza o daily.

    // Projector retryable: chunks/embeddings/edges ficam num job durável, processado já.
    await projectarIndicesAposEscritaCom(db, {
        entityType: 'daily',
        entityId: daily.id,
    });

    // Edge estrutural daily→conversa (teia de memória): liga o recap à conversa-
    // fonte para o grafo/expand, sem passar pelo markdown nem pelo regenerar.
    if (conversationId) {
        await registarEdgeConversaCom(db, {
            ownerId: user.id,
            dailyId: daily.id,
            conversationId,
        });
    }

    return { dia: daily.dia, criado: Boolean(daily.criado) };
}
export const acrescentarAoDaily = async (linha: string, dia?: string) =>
    acrescentarAoDailyCom(await createClient(), linha, dia);

export async function substituirDailyCom(
    db: SupabaseClient,
    dia: string,
    contentMd: string,
    author: 'agent' | 'user',
): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const contentNormalizado = contentMd.trim();
    if (!contentNormalizado) throw new Error('daily vazio');

    const frontmatter = { title: dia, type: 'daily' };

    // Upsert pela constraint unique(owner_id, dia) — substitui o content completo.
    const up = await db
        .from('dailies')
        .upsert(
            {
                owner_id: user.id,
                dia,
                content_md: contentNormalizado,
                frontmatter,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'owner_id,dia' },
        )
        .select('id, dia, content_md, updated_at')
        .single();
    if (up.error || !up.data) throw new Error(`upsert daily: ${up.error?.message}`);
    const daily = up.data;

    // Versão imutável do conteúdo desta escrita.
    const { error: vErr } = await db.from('file_versions').insert({
        owner_id: user.id,
        entity_type: 'daily',
        entity_id: daily.id,
        content_md: contentNormalizado,
        frontmatter,
        author,
    });
    if (vErr) throw new Error(`inserir versão: ${vErr.message}`);

    await projectarIndicesAposEscritaCom(db, {
        entityType: 'daily',
        entityId: daily.id,
    });
}
export const substituirDaily = async (dia: string, contentMd: string, author: 'agent' | 'user') =>
    substituirDailyCom(await createClient(), dia, contentMd, author);

export async function substituirDailyPorIdCom(
    db: SupabaseClient,
    id: string,
    contentMd: string,
    author: 'agent' | 'user',
): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const contentNormalizado = contentMd.trim();
    if (!contentNormalizado) throw new Error('daily vazio');

    const up = await db
        .rpc('replace_daily_entry_by_id', {
            p_id: id,
            p_content_md: contentNormalizado,
            p_author: author,
        })
        .single();
    if (up.error || !up.data) throw new Error(`substituir daily por id: ${up.error?.message}`);
    const daily = up.data as ReplaceDailyEntryByIdRow;

    await projectarIndicesAposEscritaCom(db, {
        entityType: 'daily',
        entityId: daily.id,
    });
}
export const substituirDailyPorId = async (
    id: string,
    contentMd: string,
    author: 'agent' | 'user',
) => substituirDailyPorIdCom(await createClient(), id, contentMd, author);

// Cor (hex) do grupo daily, guardada no profile do utilizador. null limpa.
export async function definirCorDailyCom(db: SupabaseClient, cor: string | null): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const { error } = await db
        .from('profiles')
        .upsert({ id: user.id, daily_color: cor }, { onConflict: 'id' });
    if (error) throw new Error(`definir cor daily: ${error.message}`);
}
export const definirCorDaily = async (cor: string | null) =>
    definirCorDailyCom(await createClient(), cor);

export async function corDailyCom(db: SupabaseClient): Promise<string | null> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) return null;
    const { data } = await db
        .from('profiles')
        .select('daily_color')
        .eq('id', user.id)
        .maybeSingle();
    return data?.daily_color ?? null;
}
export const corDaily = async () => corDailyCom(await createClient());

export async function listarDailiesCom(db: SupabaseClient): Promise<DailyListItem[]> {
    const { data, error } = await db
        .from('dailies')
        .select('id, dia, updated_at')
        .order('dia', { ascending: false });
    if (error) throw new Error(`listar dailies: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: r.id,
        dia: r.dia,
        updatedAt: r.updated_at,
    }));
}
export const listarDailies = async () => listarDailiesCom(await createClient());

export async function getDailyCom(db: SupabaseClient, dia: string): Promise<Daily | null> {
    const { data, error } = await db
        .from('dailies')
        .select('id, dia, content_md, updated_at')
        .eq('dia', dia)
        .maybeSingle();
    if (error) throw new Error(`get daily: ${error.message}`);
    return data
        ? {
              id: data.id,
              dia: data.dia,
              contentMd: data.content_md,
              updatedAt: data.updated_at,
          }
        : null;
}
export const getDaily = async (dia: string) => getDailyCom(await createClient(), dia);

export async function getDailyPorIdCom(db: SupabaseClient, id: string): Promise<Daily | null> {
    const { data, error } = await db
        .from('dailies')
        .select('id, dia, content_md, updated_at')
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error(`get daily por id: ${error.message}`);
    return data
        ? {
              id: data.id,
              dia: data.dia,
              contentMd: data.content_md,
              updatedAt: data.updated_at,
          }
        : null;
}
export const getDailyPorId = async (id: string) => getDailyPorIdCom(await createClient(), id);

export async function listarVersoesDailyCom(
    db: SupabaseClient,
    entityId: string,
): Promise<Versao[]> {
    const { data, error } = await db
        .from('file_versions')
        .select('id, content_md, author, author_id, created_at')
        .eq('entity_type', 'daily')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });
    if (error) throw new Error(`listar versões daily: ${error.message}`);
    const nomes = await nomesDosAutoresCom(
        db,
        (data ?? []).map((r) => r.author_id),
    );
    return (data ?? []).map((r) => ({
        id: r.id,
        contentMd: r.content_md,
        author: r.author,
        autorNome: (r.author_id && nomes.get(String(r.author_id))) || null,
        createdAt: r.created_at,
    }));
}
export const listarVersoesDaily = async (entityId: string) =>
    listarVersoesDailyCom(await createClient(), entityId);
