import { describe, expect, it } from 'vitest';
import { COR_FANTASMA, montarArestasGrafo } from '@/modules/knowledge/knowledge.grafo';

describe('montarArestasGrafo', () => {
    const validos = new Set(['n1', 'n2']);

    it('pendente cujo slug é um nó do grafo (ex.: daily) liga ao nó, sem fantasma', () => {
        const { links, fantasmas } = montarArestasGrafo(
            [{ fromId: 'n1', toId: null, toSlug: '2026-06-08' }],
            validos,
            new Map([['2026-06-08', 'n2']]),
        );
        expect(links).toEqual([{ source: 'n1', target: 'n2' }]);
        expect(fantasmas).toEqual([]);
    });

    it('alvo no grafo → ligação real', () => {
        const { links, fantasmas } = montarArestasGrafo(
            [{ fromId: 'n1', toId: 'n2', toSlug: 'b' }],
            validos,
        );
        expect(links).toEqual([{ source: 'n1', target: 'n2' }]);
        expect(fantasmas).toEqual([]);
    });

    it('link pendente (to_id null) → nó fantasma com aresta', () => {
        const { links, fantasmas } = montarArestasGrafo(
            [{ fromId: 'n1', toId: null, toSlug: 'sempre' }],
            validos,
        );
        expect(fantasmas).toHaveLength(1);
        expect(fantasmas[0]).toMatchObject({
            id: 'fantasma:sempre',
            group: 'fantasma',
            title: 'sempre',
            size: 0,
            color: COR_FANTASMA,
        });
        expect(links).toEqual([{ source: 'n1', target: 'fantasma:sempre' }]);
    });

    it('alvo resolvido mas fora do grafo (arquivado) → também fantasma', () => {
        const { links, fantasmas } = montarArestasGrafo(
            [{ fromId: 'n1', toId: 'arquivada-id', toSlug: 'sera' }],
            validos,
        );
        expect(fantasmas[0].id).toBe('fantasma:sera');
        expect(links).toEqual([{ source: 'n1', target: 'fantasma:sera' }]);
    });

    it('fantasmas com o mesmo slug colapsam num só nó', () => {
        const { links, fantasmas } = montarArestasGrafo(
            [
                { fromId: 'n1', toId: null, toSlug: 'sempre' },
                { fromId: 'n2', toId: null, toSlug: 'sempre' },
            ],
            validos,
        );
        expect(fantasmas).toHaveLength(1);
        expect(links).toHaveLength(2);
    });

    it('origem fora do grafo descarta a aresta; pendente sem slug ignora-se', () => {
        const { links, fantasmas } = montarArestasGrafo(
            [
                { fromId: 'desconhecido', toId: 'n2', toSlug: 'b' },
                { fromId: 'n1', toId: null, toSlug: null },
            ],
            validos,
        );
        expect(links).toEqual([]);
        expect(fantasmas).toEqual([]);
    });
});
