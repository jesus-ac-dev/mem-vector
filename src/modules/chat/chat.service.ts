import { embedQuery } from '@/lib/embeddings';
import { providerDoChatCom, type ProviderLLM, type RespostaLLM } from '@/lib/providers/factory';
import { createClient } from '@/lib/supabase/server';
import type { Provider } from '@/modules/definicoes/definicoes.schema';
import {
    buildPrompt,
    relevantSources,
    type MensagemConversa,
    type Source,
    type SourceMetadata,
} from './chat.prompt';
import { classificarIntencao } from './chat.intencao';
import { expandirFontesCom } from './chat.expand';
import { blocoKernelCom } from '@/agent/kernel';
import { responderComToolsCom } from '@/agent/responder-tools';
import { criarDetetorEscalada, INSTRUCAO_ESCALADA, SENTINELA_ESCALAR } from './escalada';
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

export interface TarefasDoTurno {
    criadas: { id: string; titulo: string }[];
    concluidas: { id: string; titulo: string }[];
}

export interface TurnoDestilado {
    notas: NotaEscrita[]; // 1 bloco → N notas escritas neste turno
    daily: DailyEscrito | null;
    // #21: tarefas criadas/concluídas pelo agente neste turno (ausente = nenhuma).
    tarefas?: TarefasDoTurno | null;
}

export interface ChatResult {
    answer: string;
    sources: Source[];
    costUsd: number | null; // providers fora do claude-cli não reportam custo
    tokensIn: number | null; // input total do turno (fresco + cache; null se não reportado)
    tokensCache: number | null; // porção de cache (só o claude reporta)
    tokensOut: number | null; // tokens de output do turno
    provider: Provider; // adapter que recebeu a chamada, não auto-relato
    latencyMs: number;
    modelo?: string; // o modelo REAL que respondeu (prova, não auto-relato)
    modeloPedido?: string; // o que foi ENVIADO ao provider — a legenda compara (r12)
    webSources?: { url: string; titulo: string }[]; // #45: fontes 🌐 quando web ON
}

interface DestilDeps {
    destilar: (q: string, a: string) => Promise<EscritaKnowledge[]>;
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
): Promise<NotaEscrita[]> {
    const {
        destilar = async (q, a) => {
            const n = await destilarReal(q, a);
            return n ? [n] : [];
        },
        escrever = escreverNotaReal,
    } = deps;
    const notas = await destilar(question, answer);
    const escritas: NotaEscrita[] = [];
    for (const nota of notas) {
        const resultado = await escrever(nota);
        escritas.push({
            slug: resultado.slug,
            title: resultado.title,
            criada: resultado.diff === null,
        });
    }
    return escritas;
}

export async function aplicarDailyTurno(
    question: string,
    answer: string,
    notas: NotaEscrita[],
    deps: Partial<DailyDeps> = {},
    conversationId?: string,
): Promise<DailyEscrito | null> {
    const { resumir = resumirTurnoParaDailyReal, escrever = acrescentarAoDailyReal } = deps;
    const resumoMd = await resumir(question, answer);
    // Turno trivial: sem resumo e sem notas, o daily não regista o nada.
    if (!resumoMd.trim() && !notas.length) return null;
    const entrada = formatDailyTurnoEntry({ resumoMd, notas, conversationId });
    const resultado = await escrever(entrada);
    return { dia: resultado.dia, criado: resultado.criado };
}

interface TurnoPreparado {
    db: Awaited<ReturnType<typeof createClient>>;
    instancia: ProviderLLM;
    modeloPedido?: string;
    sources: Source[];
    prompt: string;
    webHabilitada: boolean; // #45
    webKey?: string; // #45: key Tavily das Definições (cifrada), p/ a pesquisa web
}

// Fase do turno para o indicador dinâmico (#66): consultar → gerar. O caminho
// web não tem fase própria (r3): só se sabe se foi à net no fim (🌐 N fontes),
// por isso não se anuncia "a consultar a internet" à força.
export type FaseTurno = { fase: 'consultar' } | { fase: 'gerar'; fontes: number };

// Tudo até à geração: embed(query) → match_chunks → expand → prompt. Partilhado
// pelo respond (one-shot) e pelo respondStream (#66). O histórico (janela da
// conversa) entra no prompt para resolver anáforas. `onFase` narra o progresso.
async function prepararTurno(
    question: string,
    historico: MensagemConversa[],
    onFase?: (f: FaseTurno) => void,
): Promise<TurnoPreparado> {
    const db = await createClient();
    // #67: lê o provider + o nº de fontes ANTES do retrieval — fail-fast sem
    // provider e o match_count (configurável) vem da mesma leitura de definições.
    const { instancia, modeloPedido, matchCount, webHabilitada, webKey } =
        await providerDoChatCom(db);
    onFase?.({ fase: 'consultar' });
    const queryEmbedding = await embedQuery(question);

    const { data, error } = await db.rpc('match_chunks_hybrid', {
        query_embedding: JSON.stringify(queryEmbedding),
        query_text: question,
        match_count: matchCount,
    });
    if (error) throw new Error(`match_chunks_hybrid falhou: ${error.message}`);

    // Filtra o lixo de fundo: só fontes relevantes vão ao prompt e ao resultado
    // (sources honesto). Abaixo do corte → (sem contexto) → fallback limpo.
    const relevant = relevantSources((data ?? []) as Source[]);
    const sources = await enriquecerSourcesComMetadata(db, relevant);
    // Expand pela teia (F3): junta ao contexto as entidades vizinhas (1-hop,
    // forward+backward) das fontes recuperadas — a daily como hub para as notas
    // ligadas e vice-versa. Só atua quando há fontes com entidade (meta-perguntas
    // sem contexto não expandem → não amplifica o #62). As expandidas vão ao
    // prompt, não à proveniência (que fica honesta com o que bateu direto).
    let expandidas: Source[] = [];
    try {
        expandidas = await expandirFontesCom(db, sources);
    } catch (e) {
        console.error('expand de fontes falhou (segue sem):', e);
    }
    const contexto = [...sources, ...expandidas];
    // Declarativa sem marcas de pergunta = facto a registar (#19); a mesma
    // classificação determinística guia a destilação pós-turno.
    // Kernel do workspace (#34): identidade/regras do utilizador no arranque
    // da resposta (não-fatal: sem Kernel, prompt igual ao de sempre).
    const kernel = await blocoKernelCom(db);
    const prompt = buildPrompt(
        question,
        contexto,
        classificarIntencao(question),
        historico,
        kernel,
    );
    // Retrieval pronto: a partir daqui é o modelo a gerar (a espera longa).
    onFase?.({ fase: 'gerar', fontes: sources.length });
    return { db, instancia, modeloPedido, sources, prompt, webHabilitada, webKey };
}

function montarResultado(resp: RespostaLLM, t: TurnoPreparado, latencyMs: number): ChatResult {
    return {
        answer: resp.text,
        sources: t.sources,
        costUsd: resp.costUsd,
        tokensIn: resp.tokensIn ?? null,
        tokensCache: resp.tokensCache ?? null,
        tokensOut: resp.tokensOut ?? null,
        provider: t.instancia.nome,
        latencyMs,
        modelo: resp.model,
        modeloPedido: t.modeloPedido,
    };
}

// Pipeline one-shot: prepara o turno e gera de uma vez.
export async function respond(
    question: string,
    historico: MensagemConversa[] = [],
): Promise<ChatResult> {
    const t = await prepararTurno(question, historico);
    const startedAt = Date.now();
    const resp = await t.instancia.gerar(t.prompt);
    return montarResultado(resp, t, Date.now() - startedAt);
}

// Pipeline streaming (#66): igual, mas a resposta sai por `onTextDelta` à medida
// que é gerada. Provider sem streaming → cai no gerar (texto num bloco só).
export async function respondStream(
    question: string,
    historico: MensagemConversa[],
    onTextDelta: (texto: string) => void,
    onFase?: (f: FaseTurno) => void,
): Promise<ChatResult> {
    const t = await prepararTurno(question, historico, onFase);
    const startedAt = Date.now();

    // #85 two-phase: web ON → corre PRIMEIRO o caminho rápido (streaming, com RAG).
    // O modelo responde sozinho quando o contexto chega, ou emite o sentinela
    // [[ESCALAR]] para pedir o agente-com-tools (internet). Só nesse caso se paga o
    // cold-start agentic — perguntas do workspace respondem rápido, sem escalar. O
    // detetor segura os primeiros chars do stream para decidir sem deixar passar o
    // marcador. Web OFF (default) = caminho de sempre, intocado.
    if (t.webHabilitada) {
        const detetor = criarDetetorEscalada(SENTINELA_ESCALAR, onTextDelta);
        const promptRapido = `${t.prompt}\n\n${INSTRUCAO_ESCALADA}`;
        const respRapida = t.instancia.gerarStream
            ? await t.instancia.gerarStream(promptRapido, (d) => detetor.processar(d))
            : await t.instancia.gerar(promptRapido).then((r) => {
                  detetor.processar(r.text);
                  return r;
              });
        if (!detetor.finalizar().escalou) {
            // O caminho rápido respondeu (já streamou); sem ida à net.
            return montarResultado(respRapida, t, Date.now() - startedAt);
        }
        // Escalou: o agente-com-tools trata (loop agentic; pesquisa a internet de
        // verdade). Key Tavily das Definições; env como fallback de operação.
        const webKey = t.webKey || process.env.MEMVECTOR_AGENT_WEB_KEY;
        const r = await responderComToolsCom(t.db, t.prompt, webKey);
        onTextDelta(r.text);
        // Custo honesto (#65): a fase rápida só emitiu [[ESCALAR]], mas recebeu o
        // prompt todo — esse input paga-se. Soma-se ao custo do agente.
        const soma = (a?: number | null, b?: number | null) =>
            a == null && b == null ? null : (a ?? 0) + (b ?? 0);
        return {
            answer: r.text,
            sources: t.sources,
            costUsd: (respRapida.costUsd ?? 0) + r.costUsd,
            tokensIn: soma(respRapida.tokensIn, r.tokensIn),
            tokensCache: soma(respRapida.tokensCache, r.tokensCache),
            tokensOut: soma(respRapida.tokensOut, r.tokensOut),
            provider: t.instancia.nome,
            latencyMs: Date.now() - startedAt,
            modelo: r.model,
            modeloPedido: t.modeloPedido,
            webSources: r.webSources,
        };
    }

    const resp = t.instancia.gerarStream
        ? await t.instancia.gerarStream(t.prompt, onTextDelta)
        : await t.instancia.gerar(t.prompt).then((r) => {
              onTextDelta(r.text);
              return r;
          });
    return montarResultado(resp, t, Date.now() - startedAt);
}
