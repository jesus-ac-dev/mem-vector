import type { SupabaseClient } from '@supabase/supabase-js';

import {
    AGENTES_DEFAULT,
    DEFINICOES_DEFAULT,
    DefinicoesSchema,
    MODULOS,
    type Definicoes,
} from './definicoes.schema';

// Serviço das definições (#60): 1 linha por utilizador; sem linha = defaults
// (o utilizador novo não precisa de seed — o default É a ausência).

export async function lerDefinicoesCom(db: SupabaseClient): Promise<Definicoes> {
    const { data, error } = await db
        .from('definicoes')
        .select('metodo_destilacao, modulos_ativos, agentes')
        .maybeSingle();
    if (error) throw new Error(`ler definições falhou: ${error.message}`);
    if (!data) return DEFINICOES_DEFAULT;
    // Valores desconhecidos (ex.: módulo removido do código) caem fora no parse
    // tolerante — preferível a rebentar a modal por causa de uma string velha.
    const parsed = DefinicoesSchema.safeParse({
        metodoDestilacao: data.metodo_destilacao,
        modulosAtivos: (data.modulos_ativos ?? []).filter((m: string) =>
            (MODULOS as readonly string[]).includes(m),
        ),
        agentes: data.agentes ?? {},
    });
    if (!parsed.success) return DEFINICOES_DEFAULT;
    // Claude/cli é o orquestrador vivo: linha gravada antes da coluna agentes
    // (ou limpa) volta ao default em vez de ficar sem nenhum provider.
    const agentes = Object.keys(parsed.data.agentes).length ? parsed.data.agentes : AGENTES_DEFAULT;
    return { ...parsed.data, agentes };
}

export async function gravarDefinicoesCom(
    db: SupabaseClient,
    definicoes: Definicoes,
): Promise<Definicoes> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { error } = await db.from('definicoes').upsert({
        owner_id: user.id,
        metodo_destilacao: definicoes.metodoDestilacao,
        modulos_ativos: definicoes.modulosAtivos,
        agentes: definicoes.agentes,
        updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`gravar definições falhou: ${error.message}`);
    return definicoes;
}
