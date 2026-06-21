import type { SupabaseClient } from '@supabase/supabase-js';

import { lerDefinicoesServidorCom } from '@/modules/definicoes/definicoes.service';
import type { DefinicoesServidor } from '@/modules/definicoes/definicoes.schema';

import { executarPipeline, type ResultadoPipeline } from './relay.pipeline';

// O relay está configurado quando há pelo menos um cruzamento com provider.
export function relayConfigurado(defs: DefinicoesServidor): boolean {
    return Object.keys(defs.cruzamentos).length > 0;
}

// Trigger: corre o relay para um GOAL (a tarefa/spec). Lê o config do utilizador e
// percorre o circuito. Valida ANTES (estado conhecido = fluxo controlado): sem
// cruzamentos configurados, avisa em vez de correr vazio.
export async function correrRelayCom(db: SupabaseClient, goal: string): Promise<ResultadoPipeline> {
    const defs = await lerDefinicoesServidorCom(db);
    if (!relayConfigurado(defs)) {
        throw new Error('Relay sem cruzamentos configurados — define-os em Definições.');
    }
    return executarPipeline(defs, goal);
}
