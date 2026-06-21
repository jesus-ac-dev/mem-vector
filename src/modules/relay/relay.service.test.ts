import { describe, it, expect } from 'vitest';

import { relayConfigurado } from './relay.service';
import type { DefinicoesServidor } from '@/modules/definicoes/definicoes.schema';

function defs(cruzamentos: DefinicoesServidor['cruzamentos']): DefinicoesServidor {
    return {
        metodoDestilacao: 'one-shot',
        modulosAtivos: [],
        chatProvider: 'claude',
        matchCount: 5,
        webHabilitada: false,
        githubRepos: [],
        cruzamentos,
        agentes: {},
    };
}

describe('relayConfigurado', () => {
    it('false sem cruzamentos', () => {
        expect(relayConfigurado(defs({}))).toBe(false);
    });

    it('true com ao menos um cruzamento', () => {
        expect(relayConfigurado(defs({ dev: { principal: 'codex', validadores: [] } }))).toBe(true);
    });
});
