import type { SupabaseClient } from '@supabase/supabase-js';

import {
    DEFINICOES_VISTA_DEFAULT,
    DefinicoesSchema,
    MODULOS,
    PROVIDERS,
    type AgenteServidor,
    type AgenteVista,
    type Definicoes,
    type DefinicoesServidor,
    type DefinicoesVista,
    type EscolhaChat,
    type Provider,
} from './definicoes.schema';
import { cifrar, decifrar, sufixoKey } from '@/lib/cripto';

// Serviço das definições (#60): 1 linha por utilizador; sem linha = defaults
// (o utilizador novo não precisa de seed — o default É a ausência). As API
// keys cifram-se at rest e NUNCA voltam ao browser (vista = máscara).

interface AgenteRow {
    ativo?: boolean;
    modo?: 'cli' | 'api';
    modelo?: string;
    esforco?: string;
    modelos?: string[]; // descobertos pelo Testar ligação (#60 r5)
    apiKeyCifrada?: string;
}

interface DefinicoesRow {
    metodo_destilacao: string;
    modulos_ativos: string[] | null;
    chat_provider?: string | null;
    match_count?: number | null;
    web_habilitada?: boolean | null;
    web_key_cifrada?: string | null;
    comportamento?: string | null;
    agentes: Record<string, AgenteRow> | null;
}

async function lerRowCom(db: SupabaseClient): Promise<DefinicoesRow | null> {
    const { data, error } = await db
        .from('definicoes')
        .select(
            'metodo_destilacao, modulos_ativos, chat_provider, match_count, web_habilitada, web_key_cifrada, comportamento, agentes',
        )
        .maybeSingle();
    if (error) throw new Error(`ler definições falhou: ${error.message}`);
    return data as DefinicoesRow | null;
}

function normalizar(row: DefinicoesRow): Omit<DefinicoesServidor, 'agentes' | 'webKey'> {
    const parsed = DefinicoesSchema.omit({ agentes: true, webKey: true }).safeParse({
        metodoDestilacao: row.metodo_destilacao,
        modulosAtivos: (row.modulos_ativos ?? []).filter((m: string) =>
            (MODULOS as readonly string[]).includes(m),
        ),
        chatProvider: (PROVIDERS as readonly string[]).includes(row.chat_provider ?? '')
            ? row.chat_provider
            : 'claude',
        // null/ausente → o default do schema (5). Fora dos limites é impossível
        // pela check da BD (1..50); se ocorresse, o safeParse falha e cai no
        // fallback abaixo (linha toda, não só este campo).
        matchCount: row.match_count ?? undefined,
        webHabilitada: row.web_habilitada ?? undefined,
        comportamento: row.comportamento ?? undefined,
    });
    if (!parsed.success) {
        return {
            metodoDestilacao: 'one-shot',
            modulosAtivos: [],
            chatProvider: 'claude',
            matchCount: 5,
            webHabilitada: false,
        };
    }
    return parsed.data;
}

function agentesDaRow(row: DefinicoesRow): Partial<Record<Provider, AgenteRow>> {
    const agentes: Partial<Record<Provider, AgenteRow>> = {};
    for (const p of PROVIDERS) {
        const cfg = row.agentes?.[p];
        if (cfg && typeof cfg === 'object') agentes[p] = cfg;
    }
    // Sem defaults (#40, caminho a): agentes vazios ficam vazios — não se
    // re-injeta claude/cli (era a 2.ª via para a conta da máquina).
    return agentes;
}

/** Vista do CLIENTE: keys mascaradas (temApiKey + sufixo), nunca o valor. */
export async function lerDefinicoesVistaCom(db: SupabaseClient): Promise<DefinicoesVista> {
    const row = await lerRowCom(db);
    if (!row) return DEFINICOES_VISTA_DEFAULT;
    const base = normalizar(row);
    const agentes: Partial<Record<Provider, AgenteVista>> = {};
    for (const [p, cfg] of Object.entries(agentesDaRow(row)) as [Provider, AgenteRow][]) {
        const key = cfg.apiKeyCifrada ? decifrar(cfg.apiKeyCifrada) : undefined;
        agentes[p] = {
            ativo: cfg.ativo ?? false,
            modo: cfg.modo ?? 'cli',
            modelo: cfg.modelo || undefined,
            esforco: cfg.esforco as AgenteVista['esforco'],
            modelos: cfg.modelos,
            temApiKey: Boolean(key),
            apiKeySufixo: key ? sufixoKey(key) : undefined,
        };
    }
    const webKey = row.web_key_cifrada ? decifrar(row.web_key_cifrada) : undefined;
    return {
        ...base,
        webTemKey: Boolean(webKey),
        webKeySufixo: webKey ? sufixoKey(webKey) : undefined,
        agentes,
    };
}

/** Forma do SERVIDOR (factory/postturno): key decifrada — NÃO devolver a actions. */
export async function lerDefinicoesServidorCom(db: SupabaseClient): Promise<DefinicoesServidor> {
    const row = await lerRowCom(db);
    if (!row) {
        // Sem defaults (#40, caminho a): sem row = nenhum provider ativo.
        return {
            metodoDestilacao: 'one-shot',
            modulosAtivos: [],
            chatProvider: 'claude',
            matchCount: 5,
            webHabilitada: false,
            agentes: {},
        };
    }
    const base = normalizar(row);
    const agentes: Partial<Record<Provider, AgenteServidor>> = {};
    for (const [p, cfg] of Object.entries(agentesDaRow(row)) as [Provider, AgenteRow][]) {
        agentes[p] = {
            ativo: cfg.ativo ?? false,
            modo: cfg.modo ?? 'cli',
            modelo: cfg.modelo || undefined,
            esforco: cfg.esforco as AgenteServidor['esforco'],
            modelos: cfg.modelos,
            apiKey: cfg.apiKeyCifrada ? decifrar(cfg.apiKeyCifrada) : undefined,
        };
    }
    const webKey = row.web_key_cifrada ? decifrar(row.web_key_cifrada) : undefined;
    return { ...base, webKey, agentes };
}

/** Grava o input do cliente. apiKey: undefined = manter; '' = limpar; string = cifrar. */
export async function gravarDefinicoesCom(
    db: SupabaseClient,
    definicoes: Definicoes,
): Promise<DefinicoesVista> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const row = await lerRowCom(db);
    const existentes = row ? agentesDaRow(row) : {};

    const agentes: Record<string, AgenteRow> = {};
    for (const p of PROVIDERS) {
        const novo = definicoes.agentes[p];
        if (!novo) continue;
        const anterior = existentes[p];
        let apiKeyCifrada: string | undefined;
        if (novo.apiKey === undefined) {
            // Migra plaintext legado para cifra ao regravar.
            apiKeyCifrada = anterior?.apiKeyCifrada
                ? cifrar(decifrar(anterior.apiKeyCifrada))
                : undefined;
        } else if (novo.apiKey !== '') {
            apiKeyCifrada = cifrar(novo.apiKey);
        }
        const modelos = novo.modelos ?? anterior?.modelos;
        agentes[p] = {
            ativo: novo.ativo,
            modo: novo.modo,
            modelo: novo.modelo,
            esforco: novo.esforco,
            // A lista descoberta pelo teste viaja no payload (r13) e a antiga
            // sobrevive a gravações que não a tragam.
            ...(modelos ? { modelos } : {}),
            ...(apiKeyCifrada ? { apiKeyCifrada } : {}),
        };
    }

    // Key de pesquisa web (#45, Tavily): mesmo contrato das keys dos providers —
    // undefined mantém a cifrada, '' limpa, string cifra. O upsert reescreve a
    // linha, por isso "manter" tem de re-escrever a cifrada anterior (senão limpava-a).
    let webKeyCifrada: string | undefined;
    if (definicoes.webKey === undefined) {
        webKeyCifrada = row?.web_key_cifrada ? cifrar(decifrar(row.web_key_cifrada)) : undefined;
    } else if (definicoes.webKey !== '') {
        webKeyCifrada = cifrar(definicoes.webKey);
    }

    const { error } = await db.from('definicoes').upsert({
        owner_id: user.id,
        metodo_destilacao: definicoes.metodoDestilacao,
        modulos_ativos: definicoes.modulosAtivos,
        chat_provider: definicoes.chatProvider,
        match_count: definicoes.matchCount,
        web_habilitada: definicoes.webHabilitada,
        web_key_cifrada: webKeyCifrada ?? null,
        comportamento: definicoes.comportamento?.trim() || null,
        agentes,
        updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`gravar definições falhou: ${error.message}`);
    return lerDefinicoesVistaCom(db);
}

// Compat: o pós-turno só precisa do método.
export async function lerDefinicoesCom(db: SupabaseClient): Promise<DefinicoesServidor> {
    return lerDefinicoesServidorCom(db);
}

/** A ESCOLHA do chat (mini-modal, r13): update CIRÚRGICO — muda chat_provider
 *  e modelo/esforço do escolhido, nunca toca em modo/keys/ativo nem nos outros
 *  providers. Um escritor por estado: o antecessor (gravarModelosProviderCom)
 *  escrevia durante o teste e fabricou a meia-config fantasma do gemini
 *  (modo default sem key) que o chat foi ler. */
export async function gravarEscolhaChatCom(
    db: SupabaseClient,
    escolha: EscolhaChat,
): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const row = await lerRowCom(db);
    const agentes: Record<string, AgenteRow> = { ...(row?.agentes ?? {}) };
    // Só se toca em providers JÁ parametrizados — criar entrada aqui seria a
    // meia-config fantasma outra vez (modo default sem key). Sem entrada,
    // muda só o chat_provider; parametrizar é trabalho das Definições.
    // (NOTA: read-modify-write — em corrida com o Guardar ganha o último;
    // aceitável single-user, re-avaliar em multi-tab/grupos.)
    const atual = agentes[escolha.provider];
    if (atual) {
        agentes[escolha.provider] = {
            ...atual,
            // null limpa (a chave fica undefined e o JSON descarta-a);
            // undefined mantém (a chave nem entra no spread).
            ...(escolha.modelo !== undefined ? { modelo: escolha.modelo ?? undefined } : {}),
            ...(escolha.esforco !== undefined ? { esforco: escolha.esforco ?? undefined } : {}),
        };
    }
    const { error } = await db.from('definicoes').upsert({
        owner_id: user.id,
        metodo_destilacao: row?.metodo_destilacao ?? 'one-shot',
        modulos_ativos: row?.modulos_ativos ?? [],
        chat_provider: escolha.provider,
        agentes,
        updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`gravar escolha falhou: ${error.message}`);
}
