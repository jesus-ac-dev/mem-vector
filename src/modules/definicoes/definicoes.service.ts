import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFINICOES_DEFAULT, DefinicoesSchema, type Definicoes } from './definicoes.schema';

// Serviço das definições (#60): 1 linha por utilizador; sem linha = defaults
// (o utilizador novo não precisa de seed — o default É a ausência).

export async function lerDefinicoesCom(db: SupabaseClient): Promise<Definicoes> {
    const { data, error } = await db
        .from('definicoes')
        .select('metodo_destilacao, modulos_ativos')
        .maybeSingle();
    if (error) throw new Error(`ler definições falhou: ${error.message}`);
    if (!data) return DEFINICOES_DEFAULT;
    // Valores desconhecidos (ex.: módulo removido do código) caem fora no parse
    // tolerante — preferível a rebentar a modal por causa de uma string velha.
    const parsed = DefinicoesSchema.safeParse({
        metodoDestilacao: data.metodo_destilacao,
        modulosAtivos: (data.modulos_ativos ?? []).filter((m: string) =>
            ['github', 'emails'].includes(m),
        ),
    });
    return parsed.success ? parsed.data : DEFINICOES_DEFAULT;
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
        updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`gravar definições falhou: ${error.message}`);
    return definicoes;
}
