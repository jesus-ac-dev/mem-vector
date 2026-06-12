'use server';

import { z } from 'zod';

import {
    DefinicoesSchema,
    PROVIDERS,
    type DefinicoesVista,
    type Provider,
} from './definicoes.schema';
import {
    gravarDefinicoesCom,
    gravarModelosProviderCom,
    lerDefinicoesServidorCom,
    lerDefinicoesVistaCom,
} from './definicoes.service';
import { criarProvider } from '@/lib/providers/factory';
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

// Teste de ligação (#60 r3/r5): valida que o provider responde (cli = binário
// no PATH; api = chamada barata com a key) e, com sucesso, DESCOBRE a lista
// de modelos e persiste-a — as dropdowns ficam vivas ("vi um modelo novo nas
// notícias → testo a ligação → aparece").
export async function testarProvider(
    input: unknown,
): Promise<{ ok: boolean; detalhe: string; modelos?: string[] }> {
    const provider = z.enum(PROVIDERS).parse(input) as Provider;
    const db = await createClient();
    const defs = await lerDefinicoesServidorCom(db);
    const cfg = defs.agentes[provider] ?? { ativo: false, modo: 'cli' as const };
    const instancia = criarProvider(provider, cfg);
    const resultado = await instancia.testar();
    if (!resultado.ok) return resultado;
    try {
        const modelos = await instancia.listarModelos();
        if (modelos.length) {
            await gravarModelosProviderCom(db, provider, modelos);
            return { ...resultado, modelos };
        }
    } catch (e) {
        console.error('listar modelos falhou (teste ok na mesma):', e);
    }
    return resultado;
}
