import { embedQuery } from '@/lib/embeddings';
import { generate } from '@/lib/claude';
import { createClient } from '@/lib/supabase/server';
import {
    buildPrompt,
    relevantSources,
    type MensagemConversa,
    type Source,
    type SourceMetadata,
} from './chat.prompt';
import { classificarIntencao } from './chat.intencao';
import { destilar as destilarReal } from '@/modules/knowledge/knowledge.destilar';
import {
    escreverNota as escreverNotaReal,
    type ResultadoEscrita,
} from '@/modules/knowledge/knowledge.service';
import type { EscritaKnowledge } from '@/modules/knowledge/knowledge.schema';
import {
    formatDailyTurnoEntry,
    resumirTurnoParaDaily as resumirTurnoParaDailyReal,
} from '@/modules/daily/daily.capture';
import {
    acrescentarAoDaily as acrescentarAoDailyReal,
    type ResultadoAcrescento,
} from '@/modules/daily/daily.service';

export type { Source };

export interface NotaEscrita {
    slug: string;
    title: string;
    criada: boolean;
}

export interface DailyEscrito {
    dia: string;
    criado: boolean;
}

export interface TurnoDestilado {
    nota: NotaEscrita | null;
    daily: DailyEscrito | null;
}

export interface ChatResult {
    answer: string;
    sources: Source[];
    costUsd: number;
}

interface DestilDeps {
    destilar: (q: string, a: string) => Promise<EscritaKnowledge | null>;
    escrever: (input: EscritaKnowledge) => Promise<ResultadoEscrita>;
}

interface DailyDeps {
    resumir: (q: string, a: string) => Promise<string>;
    escrever: (linha: string) => Promise<ResultadoAcrescento>;
}

function normalizarMetadata(value: unknown): SourceMetadata | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return {
        ...record,
        entity_type: typeof record.entity_type === 'string' ? record.entity_type : undefined,
        entity_id: typeof record.entity_id === 'string' ? record.entity_id : undefined,
        dia: typeof record.dia === 'string' ? record.dia : undefined,
        slug: typeof record.slug === 'string' ? record.slug : undefined,
        title: typeof record.title === 'string' ? record.title : undefined,
    };
}

async function completarMetadataDasEntidades(
    db: Awaited<ReturnType<typeof createClient>>,
    metadatas: SourceMetadata[],
): Promise<{
    knowledgePorId: Map<string, Pick<SourceMetadata, 'slug' | 'title'>>;
    dailyPorId: Map<string, Pick<SourceMetadata, 'dia'>>;
}> {
    const knowledgeIds = [
        ...new Set(
            metadatas
                .filter((m) => m.entity_type === 'knowledge' && m.entity_id && !m.slug)
                .map((m) => m.entity_id!),
        ),
    ];
    const dailyIds = [
        ...new Set(
            metadatas
                .filter((m) => m.entity_type === 'daily' && m.entity_id && !m.dia)
                .map((m) => m.entity_id!),
        ),
    ];

    const knowledgePorId = new Map<string, Pick<SourceMetadata, 'slug' | 'title'>>();
    const dailyPorId = new Map<string, Pick<SourceMetadata, 'dia'>>();

    if (knowledgeIds.length) {
        const { data, error } = await db
            .from('knowledge')
            .select('id, slug, title')
            .in('id', knowledgeIds);
        if (error) throw new Error(`resolver fontes knowledge falhou: ${error.message}`);
        for (const row of data ?? []) {
            knowledgePorId.set(String(row.id), { slug: row.slug, title: row.title });
        }
    }

    if (dailyIds.length) {
        const { data, error } = await db.from('dailies').select('id, dia').in('id', dailyIds);
        if (error) throw new Error(`resolver fontes daily falhou: ${error.message}`);
        for (const row of data ?? []) {
            dailyPorId.set(String(row.id), { dia: row.dia });
        }
    }

    return { knowledgePorId, dailyPorId };
}

function completarMetadata(
    metadata: SourceMetadata | null,
    refs: Awaited<ReturnType<typeof completarMetadataDasEntidades>>,
): SourceMetadata | null {
    if (!metadata?.entity_id) return metadata;

    if (metadata.entity_type === 'knowledge') {
        const knowledge = refs.knowledgePorId.get(metadata.entity_id);
        return knowledge ? { ...metadata, ...knowledge } : metadata;
    }

    if (metadata.entity_type === 'daily') {
        const daily = refs.dailyPorId.get(metadata.entity_id);
        return daily ? { ...metadata, ...daily } : metadata;
    }

    return metadata;
}

async function enriquecerSourcesComMetadata(
    db: Awaited<ReturnType<typeof createClient>>,
    sources: Source[],
): Promise<Source[]> {
    const ids = sources.map((s) => s.id).filter((id): id is string => Boolean(id));
    if (!ids.length) return sources;

    const { data, error } = await db.from('chunks').select('id, metadata').in('id', ids);
    if (error) throw new Error(`ler metadata de chunks falhou: ${error.message}`);

    const metadataPorId = new Map(
        (data ?? []).map((row) => [String(row.id), normalizarMetadata(row.metadata)]),
    );
    const refs = await completarMetadataDasEntidades(
        db,
        [...metadataPorId.values()].filter((m): m is SourceMetadata => m !== null),
    );

    return sources.map((source) => {
        if (!source.id || !metadataPorId.has(source.id)) return source;
        return {
            ...source,
            metadata: completarMetadata(metadataPorId.get(source.id) ?? null, refs),
        };
    });
}

export async function aplicarDestilacao(
    question: string,
    answer: string,
    deps: Partial<DestilDeps> = {},
): Promise<NotaEscrita | null> {
    const { destilar = destilarReal, escrever = escreverNotaReal } = deps;
    const nota = await destilar(question, answer);
    if (!nota) return null;
    const resultado = await escrever(nota);
    return { slug: resultado.slug, title: resultado.title, criada: resultado.diff === null };
}

export async function aplicarDailyTurno(
    question: string,
    answer: string,
    nota: NotaEscrita | null,
    deps: Partial<DailyDeps> = {},
): Promise<DailyEscrito> {
    const { resumir = resumirTurnoParaDailyReal, escrever = acrescentarAoDailyReal } = deps;
    const resumoMd = await resumir(question, answer);
    const entrada = formatDailyTurnoEntry({ resumoMd, nota });
    const resultado = await escrever(entrada);
    return { dia: resultado.dia, criado: resultado.criado };
}

// Pipeline do ping-pong: embed(query) → match_chunks → prompt → claude.
// O histórico (janela da conversa) entra no prompt para resolver anáforas.
export async function respond(
    question: string,
    historico: MensagemConversa[] = [],
): Promise<ChatResult> {
    const db = await createClient();
    const queryEmbedding = await embedQuery(question);

    const { data, error } = await db.rpc('match_chunks_hybrid', {
        query_embedding: JSON.stringify(queryEmbedding),
        query_text: question,
        match_count: 5,
    });
    if (error) throw new Error(`match_chunks_hybrid falhou: ${error.message}`);

    // Filtra o lixo de fundo: só fontes relevantes vão ao prompt e ao resultado
    // (sources honesto). Abaixo do corte → (sem contexto) → fallback limpo.
    const relevant = relevantSources((data ?? []) as Source[]);
    const sources = await enriquecerSourcesComMetadata(db, relevant);
    // Declarativa sem marcas de pergunta = facto a registar (#19); a mesma
    // classificação determinística guia a destilação pós-turno.
    const { text, costUsd } = await generate(
        buildPrompt(question, sources, classificarIntencao(question), historico),
    );

    return { answer: text, sources, costUsd };
}
