import type { SupabaseClient } from '@supabase/supabase-js';

import { lerDefinicoesServidorCom } from '@/modules/definicoes/definicoes.service';
import type { DefinicoesServidor } from '@/modules/definicoes/definicoes.schema';

import { executarPipeline, type ResultadoPipeline } from './relay.pipeline';
import { providersAtivos } from './relay.resolver';

// O relay está configurado quando há pelo menos um provider ativo; o orchestrator
// expande depois para as fases canónicas.
export function relayConfigurado(defs: DefinicoesServidor): boolean {
    return providersAtivos(defs).length > 0;
}

// Trigger: corre o relay para um GOAL (a tarefa/spec). Lê o config do utilizador e
// percorre o circuito. Valida ANTES (estado conhecido = fluxo controlado): sem
// providers ativos, avisa em vez de correr vazio.
export async function correrRelayCom(db: SupabaseClient, goal: string): Promise<ResultadoPipeline> {
    const defs = await lerDefinicoesServidorCom(db);
    if (!relayConfigurado(defs)) {
        throw new Error(
            'Relay sem providers ativos — ativa pelo menos um em Definições > Agentes.',
        );
    }
    return executarPipeline(defs, goal);
}
