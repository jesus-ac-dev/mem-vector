import { describe, it, expect } from 'vitest';

import { relayConfigurado } from './relay.service';
import type { DefinicoesServidor } from '@/modules/definicoes/definicoes.schema';

function defs(over: Partial<DefinicoesServidor> = {}): DefinicoesServidor {
    return {
        metodoDestilacao: 'one-shot',
        modulosAtivos: [],
        chatProvider: 'claude',
        matchCount: 5,
        webHabilitada: false,
        githubRepos: [],
        cruzamentos: {},
        agentes: {},
        ...over,
    };
}

describe('relayConfigurado', () => {
    it('false sem providers ativos', () => {
        expect(relayConfigurado(defs())).toBe(false);
    });

    it('true com ao menos um provider ativo', () => {
        expect(relayConfigurado(defs({ agentes: { codex: { ativo: true, modo: 'cli' } } }))).toBe(
            true,
        );
    });
});
