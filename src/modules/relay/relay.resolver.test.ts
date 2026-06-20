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
    gemini: { ativo: true, modo: 'api' as const },
};

describe('resolverCruzamento (o circuito lê o config)', () => {
    it('cross: principal e validador de linhagem diferente', () => {
        const r = resolverCruzamento(
            defs({
                agentes: AGENTES,
                cruzamentos: { dev: { principal: 'codex', validadores: ['claude'] } },
            }),
            'dev',
        );
        expect(r.principal.provider).toBe('codex');
        expect(r.validadores.map((v) => v.provider)).toEqual(['claude']);
    });

    it('lista vazia = só principal, sem validação', () => {
        const r = resolverCruzamento(
            defs({
                agentes: AGENTES,
                cruzamentos: { analise: { principal: 'claude', validadores: [] } },
            }),
            'analise',
        );
        expect(r.validadores).toHaveLength(0);
    });

    it("'self' resolve ao principal", () => {
        const r = resolverCruzamento(
            defs({
                agentes: AGENTES,
                cruzamentos: { dev: { principal: 'codex', validadores: ['self'] } },
            }),
            'dev',
        );
        expect(r.validadores.map((v) => v.provider)).toEqual(['codex']);
    });

    it('PAINEL: N validadores de linhagens diferentes', () => {
        const r = resolverCruzamento(
            defs({
                agentes: AGENTES,
                cruzamentos: {
                    auditoria: { principal: 'codex', validadores: ['claude', 'gemini'] },
                },
            }),
            'auditoria',
        );
        expect(r.validadores.map((v) => v.provider)).toEqual(['claude', 'gemini']);
    });

    it('cruzamento sem config lança', () => {
        expect(() => resolverCruzamento(defs({ agentes: AGENTES }), 'dev')).toThrow(/sem provider/);
    });

    it('provider escolhido mas não ativo lança', () => {
        expect(() =>
            resolverCruzamento(
                defs({ cruzamentos: { dev: { principal: 'codex', validadores: [] } } }),
                'dev',
            ),
        ).toThrow(/não está ativo/);
    });
});
