import type {
    AgenteServidor,
    Cruzamento,
    DefinicoesServidor,
    Provider,
} from '@/modules/definicoes/definicoes.schema';
import { PROVIDERS } from '@/modules/definicoes/definicoes.schema';

// O circuito do relay lê o CONFIG (não código): para um cruzamento, resolve QUEM
// produz (principal) e QUEM valida (validador), a partir do mapa cruzamento→provider
// (definições) cruzado com a config de cada agente. Puro — a construção dos
// providers (factory) e a corrida ficam para o runner por cima.

export interface PapelResolvido {
    provider: Provider;
    config: AgenteServidor;
}

export interface CruzamentoResolvido {
    cruzamento: Cruzamento;
    principal: PapelResolvido;
    // [] = sem validação (lista vazia). N = painel adversarial ('self' resolve ao principal).
    validadores: PapelResolvido[];
}

export function providersAtivos(defs: DefinicoesServidor): PapelResolvido[] {
    return PROVIDERS.flatMap((provider) => {
        const config = defs.agentes[provider];
        return config?.ativo ? [{ provider, config }] : [];
    });
}

export function resolverCruzamento(
    defs: DefinicoesServidor,
    cruzamento: Cruzamento,
): CruzamentoResolvido {
    const cfg = defs.cruzamentos[cruzamento];
    if (!cfg) {
        throw new Error(`Cruzamento "${cruzamento}" sem provider configurado (Definições).`);
    }

    const papel = (p: Provider): PapelResolvido => {
        const config = defs.agentes[p];
        if (!config?.ativo) {
            throw new Error(`Provider "${p}" não está ativo (Definições > Agentes).`);
        }
        return { provider: p, config };
    };

    const principal = papel(cfg.principal);
    const validadores = cfg.validadores.map((v) => papel(v === 'self' ? cfg.principal : v));

    return { cruzamento, principal, validadores };
}
