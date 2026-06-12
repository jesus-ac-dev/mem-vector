'use server';

import { z } from 'zod';

import {
    DefinicoesSchema,
    PROVIDERS,
    type DefinicoesVista,
    type Provider,
} from './definicoes.schema';
import { gravarDefinicoesCom, lerDefinicoesVistaCom } from './definicoes.service';
import { criarProvider } from '@/lib/providers/factory';
import { lerDefinicoesServidorCom } from './definicoes.service';
import { createClient } from '@/lib/supabase/server';

// As actions devolvem SEMPRE a vista (keys mascaradas) — a key real nunca
// atravessa a fronteira do servidor.

export async function lerDefinicoes(): Promise<DefinicoesVista> {
    return lerDefinicoesVistaCom(await createClient());
}

export async function gravarDefinicoes(input: unknown): Promise<DefinicoesVista> {
    const dados = DefinicoesSchema.parse(input);
    return gravarDefinicoesCom(await createClient(), dados);
}

// Teste de ligação (#60 r3): valida que o provider selecionado responde —
// cli = binário no PATH; api = chamada barata com a key gravada.
export async function testarProvider(input: unknown): Promise<{ ok: boolean; detalhe: string }> {
    const provider = z.enum(PROVIDERS).parse(input) as Provider;
    const db = await createClient();
    const defs = await lerDefinicoesServidorCom(db);
    const cfg = defs.agentes[provider] ?? { ativo: false, modo: 'cli' as const };
    return criarProvider(provider, cfg).testar();
}
