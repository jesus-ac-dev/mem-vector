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
    agentes: Record<string, AgenteRow> | null;
}

async function lerRowCom(db: SupabaseClient): Promise<DefinicoesRow | null> {
    const { data, error } = await db
        .from('definicoes')
        .select('metodo_destilacao, modulos_ativos, chat_provider, agentes')
        .maybeSingle();
    if (error) throw new Error(`ler definições falhou: ${error.message}`);
    return data as DefinicoesRow | null;
}

function normalizar(row: DefinicoesRow): Omit<DefinicoesServidor, 'agentes'> {
    const parsed = DefinicoesSchema.omit({ agentes: true }).safeParse({
        metodoDestilacao: row.metodo_destilacao,
        modulosAtivos: (row.modulos_ativos ?? []).filter((m: string) =>
            (MODULOS as readonly string[]).includes(m),
        ),
        chatProvider: (PROVIDERS as readonly string[]).includes(row.chat_provider ?? '')
            ? row.chat_provider
            : 'claude',
    });
    if (!parsed.success) {
        return {
            metodoDestilacao: 'one-shot',
            modulosAtivos: [],
            chatProvider: 'claude',
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
    // Claude/cli é o orquestrador vivo: sem nenhum provider gravado, volta ao
    // default em vez de ficar a zero.
    if (Object.keys(agentes).length === 0) agentes.claude = { ativo: true, modo: 'cli' };
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
    return { ...base, agentes };
}

/** Forma do SERVIDOR (factory/postturno): key decifrada — NÃO devolver a actions. */
export async function lerDefinicoesServidorCom(db: SupabaseClient): Promise<DefinicoesServidor> {
    const row = await lerRowCom(db);
    if (!row) {
        return {
            metodoDestilacao: 'one-shot',
            modulosAtivos: [],
            chatProvider: 'claude',
            agentes: { claude: { ativo: true, modo: 'cli' } },
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
    return { ...base, agentes };
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
        agentes[p] = {
            ativo: novo.ativo,
            modo: novo.modo,
            modelo: novo.modelo,
            esforco: novo.esforco,
            // A lista descoberta pelo teste sobrevive às gravações do cliente.
            ...(anterior?.modelos ? { modelos: anterior.modelos } : {}),
            ...(apiKeyCifrada ? { apiKeyCifrada } : {}),
        };
    }

    const { error } = await db.from('definicoes').upsert({
        owner_id: user.id,
        metodo_destilacao: definicoes.metodoDestilacao,
        modulos_ativos: definicoes.modulosAtivos,
        chat_provider: definicoes.chatProvider,
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

/** O Testar ligação descobriu modelos (#60 r5): persiste-os no provider. */
export async function gravarModelosProviderCom(
    db: SupabaseClient,
    provider: Provider,
    modelos: string[],
): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const row = await lerRowCom(db);
    const agentes: Record<string, AgenteRow> = row ? { ...(row.agentes ?? {}) } : {};
    agentes[provider] = { ...(agentes[provider] ?? { ativo: true, modo: 'cli' }), modelos };
    const { error } = await db.from('definicoes').upsert({
        owner_id: user.id,
        metodo_destilacao: row?.metodo_destilacao ?? 'one-shot',
        modulos_ativos: row?.modulos_ativos ?? [],
        chat_provider: row?.chat_provider ?? 'claude',
        agentes,
        updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`gravar modelos falhou: ${error.message}`);
}
