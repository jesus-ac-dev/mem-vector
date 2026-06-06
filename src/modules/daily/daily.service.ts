import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { embedPassage } from '@/lib/embeddings';

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
    author: string;
    createdAt: string;
}

export function hojeLisboa(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(date);
}

export async function acrescentarAoDailyCom(
    db: SupabaseClient,
    linha: string,
    dia?: string,
): Promise<ResultadoAcrescento> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const diaAlvo = dia ?? hojeLisboa();
    const linhaNormalizada = linha.trim();
    if (!linhaNormalizada) throw new Error('daily vazio');

    // Ler o daily existente para este dia (se houver).
    const existente = await db
        .from('dailies')
        .select('id, content_md')
        .eq('owner_id', user.id)
        .eq('dia', diaAlvo)
        .maybeSingle();
    if (existente.error) throw new Error(`ler daily: ${existente.error.message}`);

    const eraExistente = existente.data !== null;
    const anterior = existente.data?.content_md.trim() ?? '';
    const novoContent = anterior ? `${anterior}\n\n${linhaNormalizada}` : linhaNormalizada;
    const frontmatter = { title: diaAlvo, type: 'daily' };

    // Upsert pela constraint unique(owner_id, dia).
    const up = await db
        .from('dailies')
        .upsert(
            {
                ...(eraExistente ? { id: existente.data!.id } : {}),
                owner_id: user.id,
                dia: diaAlvo,
                content_md: novoContent,
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
        content_md: novoContent,
        frontmatter,
        author: 'agent',
    });
    if (vErr) throw new Error(`inserir versão: ${vErr.message}`);

    // Regenerar chunks: apagar os antigos deste daily, inserir novo com embedding atual.
    const { error: dChErr } = await db
        .from('chunks')
        .delete()
        .eq('owner_id', user.id)
        .eq('metadata->>entity_id', daily.id);
    if (dChErr) throw new Error(`apagar chunks: ${dChErr.message}`);

    const embedding = await embedPassage(novoContent);
    const { error: iChErr } = await db.from('chunks').insert({
        content: novoContent,
        embedding: JSON.stringify(embedding),
        source: 'daily',
        owner_id: user.id,
        metadata: { entity_type: 'daily', entity_id: daily.id, dia: daily.dia },
    });
    if (iChErr) throw new Error(`inserir chunk: ${iChErr.message}`);

    return { dia: diaAlvo, criado: !eraExistente };
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

    // Regenerar chunks: apagar os antigos deste daily, inserir novo com embedding atual.
    const { error: dChErr } = await db
        .from('chunks')
        .delete()
        .eq('owner_id', user.id)
        .eq('metadata->>entity_id', daily.id);
    if (dChErr) throw new Error(`apagar chunks: ${dChErr.message}`);

    const embedding = await embedPassage(contentNormalizado);
    const { error: iChErr } = await db.from('chunks').insert({
        content: contentNormalizado,
        embedding: JSON.stringify(embedding),
        source: 'daily',
        owner_id: user.id,
        metadata: { entity_type: 'daily', entity_id: daily.id, dia: daily.dia },
    });
    if (iChErr) throw new Error(`inserir chunk: ${iChErr.message}`);
}
export const substituirDaily = async (dia: string, contentMd: string, author: 'agent' | 'user') =>
    substituirDailyCom(await createClient(), dia, contentMd, author);

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

export async function listarVersoesDailyCom(
    db: SupabaseClient,
    entityId: string,
): Promise<Versao[]> {
    const { data, error } = await db
        .from('file_versions')
        .select('id, content_md, author, created_at')
        .eq('entity_type', 'daily')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false });
    if (error) throw new Error(`listar versões daily: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: r.id,
        contentMd: r.content_md,
        author: r.author,
        createdAt: r.created_at,
    }));
}
export const listarVersoesDaily = async (entityId: string) =>
    listarVersoesDailyCom(await createClient(), entityId);
