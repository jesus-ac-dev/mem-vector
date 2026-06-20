import { describe, expect, it } from 'vitest';

import { DefinicoesSchema } from './definicoes.schema';

// #67: o nº de fontes do retrieval era fixo (5). Passa a ser configurável, com
// um default são e limites (não faz sentido 0 nem centenas).
describe('DefinicoesSchema matchCount (#67)', () => {
    it('usa o default 5 quando ausente', () => {
        expect(DefinicoesSchema.parse({ agentes: {} }).matchCount).toBe(5);
    });

    it('aceita um valor dentro dos limites', () => {
        expect(DefinicoesSchema.parse({ agentes: {}, matchCount: 10 }).matchCount).toBe(10);
    });

    it('rejeita fora dos limites (0 ou demasiado alto) e não-inteiros', () => {
        expect(() => DefinicoesSchema.parse({ agentes: {}, matchCount: 0 })).toThrow();
        expect(() => DefinicoesSchema.parse({ agentes: {}, matchCount: 100 })).toThrow();
        expect(() => DefinicoesSchema.parse({ agentes: {}, matchCount: 3.5 })).toThrow();
    });
});

// M7 Fatia 1: connection GitHub — token (mesmo contrato das keys) + repos ligados.
describe('DefinicoesSchema github (M7)', () => {
    it('githubToken e githubRepos são opcionais (undefined = manter/ausente)', () => {
        const d = DefinicoesSchema.parse({ agentes: {} });
        expect(d.githubToken).toBeUndefined();
        expect(d.githubRepos).toBeUndefined();
    });

    it('aceita repos no formato owner/nome e o token como string', () => {
        const d = DefinicoesSchema.parse({
            agentes: {},
            githubToken: 'github_pat_x',
            githubRepos: ['jesus-ac-dev/mem-vector', 'org/repo'],
        });
        expect(d.githubToken).toBe('github_pat_x');
        expect(d.githubRepos).toEqual(['jesus-ac-dev/mem-vector', 'org/repo']);
    });

    it('rejeita repos malformados (sem barra ou com espaço)', () => {
        expect(() => DefinicoesSchema.parse({ agentes: {}, githubRepos: ['sembarra'] })).toThrow();
        expect(() =>
            DefinicoesSchema.parse({ agentes: {}, githubRepos: ['owner /repo'] }),
        ).toThrow();
    });
});
