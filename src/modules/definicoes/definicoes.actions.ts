'use server';

import {
    DefinicoesSchema,
    EscolhaChatSchema,
    TestarProviderSchema,
    modoEfetivo,
    type AgenteServidor,
    type DefinicoesVista,
} from './definicoes.schema';
import {
    gravarDefinicoesCom,
    gravarEscolhaChatCom,
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

// Teste de ligação (#60 r3/r5/r9): valida que o provider responde (cli =
// mini-geração pelo binário; api = key provada + mini-geração) e, com sucesso,
// DESCOBRE a lista de modelos e persiste-a — as dropdowns ficam vivas ("vi um
// modelo novo nas notícias → testo a ligação → aparece"). O teste corre contra
// a config PENDENTE do form (r9): uma key ao calhas rebenta ANTES do Guardar.
export async function testarProvider(
    input: unknown,
): Promise<{ ok: boolean; detalhe: string; modelos?: string[] }> {
    const { provider, config } = TestarProviderSchema.parse(input);
    const db = await createClient();
    const defs = await lerDefinicoesServidorCom(db);
    const salvo = defs.agentes[provider] ?? { ativo: false, modo: 'cli' as const };
    // Pendente sobrepõe o gravado; apiKey undefined = usa a gravada, '' = sem key.
    const cfg: AgenteServidor = config
        ? {
              ativo: config.ativo,
              modo: modoEfetivo(provider, config.modo),
              modelo: config.modelo,
              esforco: config.esforco,
              modelos: salvo.modelos,
              apiKey: config.apiKey === undefined ? salvo.apiKey : config.apiKey || undefined,
          }
        : salvo;
    const instancia = criarProvider(provider, cfg);
    const resultado = await instancia.testar();
    if (!resultado.ok) return resultado;
    try {
        const modelos = await instancia.listarModelos();
        // r13: a lista NÃO se grava aqui — o teste corre contra config
        // PENDENTE e escrever criava meia-config fantasma na BD (modo default
        // sem key — o bug do gemini). Os modelos viajam no Guardar.
        if (modelos.length) return { ...resultado, modelos };
    } catch (e) {
        console.error('listar modelos falhou (teste ok na mesma):', e);
    }
    return resultado;
}

// A ESCOLHA do chat (mini-modal, r13): cirúrgica — nunca regrava o que a
// mini-modal não edita (modo/keys/ativo ficam intactos).
export async function gravarEscolhaChat(input: unknown): Promise<void> {
    const escolha = EscolhaChatSchema.parse(input);
    await gravarEscolhaChatCom(await createClient(), escolha);
}
