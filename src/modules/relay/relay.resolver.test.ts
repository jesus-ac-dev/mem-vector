import { describe, it, expect } from 'vitest';

import { resolverCruzamento } from './relay.resolver';
import type { DefinicoesServidor } from '@/modules/definicoes/definicoes.schema';

function defs(over: Partial<DefinicoesServidor>): DefinicoesServidor {
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

const AGENTES = {
    claude: { ativo: true, modo: 'cli' as const },
    codex: { ativo: true, modo: 'cli' as const },
};

describe('resolverCruzamento (o circuito lê o config)', () => {
    it('cross: principal e validador de linhagens diferentes', () => {
        const r = resolverCruzamento(
            defs({
                agentes: AGENTES,
                cruzamentos: { dev: { principal: 'codex', validador: 'claude' } },
            }),
            'dev',
        );
        expect(r.principal.provider).toBe('codex');
        expect(r.validador?.provider).toBe('claude');
    });

    it("validador 'none' = só principal, sem validação", () => {
        const r = resolverCruzamento(
            defs({
                agentes: AGENTES,
                cruzamentos: { analise: { principal: 'claude', validador: 'none' } },
            }),
            'analise',
        );
        expect(r.validador).toBeNull();
    });

    it("validador 'self' = o mesmo provider valida-se", () => {
        const r = resolverCruzamento(
            defs({
                agentes: AGENTES,
                cruzamentos: { dev: { principal: 'codex', validador: 'self' } },
            }),
            'dev',
        );
        expect(r.validador?.provider).toBe('codex');
    });

    it('cruzamento sem config lança', () => {
        expect(() => resolverCruzamento(defs({ agentes: AGENTES }), 'dev')).toThrow(/sem provider/);
    });

    it('provider escolhido mas não ativo lança', () => {
        expect(() =>
            resolverCruzamento(
                defs({ cruzamentos: { dev: { principal: 'codex', validador: 'none' } } }),
                'dev',
            ),
        ).toThrow(/não está ativo/);
    });
});
