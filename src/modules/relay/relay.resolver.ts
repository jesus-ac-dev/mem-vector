import type {
    AgenteServidor,
    Cruzamento,
    DefinicoesServidor,
    Provider,
} from '@/modules/definicoes/definicoes.schema';

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
    // null = double-tap 'none' (só principal, sem validação). 'self'/<provider> resolvem aqui.
    validador: PapelResolvido | null;
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

    let validador: PapelResolvido | null = null;
    if (cfg.validador === 'self') validador = papel(cfg.principal);
    else if (cfg.validador !== 'none') validador = papel(cfg.validador);

    return { cruzamento, principal, validador };
}
