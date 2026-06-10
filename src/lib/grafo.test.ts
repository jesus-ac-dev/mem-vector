import { describe, expect, it } from 'vitest';
import { construirGraphData, ligaAoNo, valPorTamanho } from '@/lib/grafo';
import type { GrafoDados } from '@/modules/knowledge/knowledge.service';

describe('valPorTamanho', () => {
    it('nota vazia fica no val mínimo', () => {
        expect(valPorTamanho(0)).toBe(1);
    });

    it('cresce com o tamanho do ficheiro', () => {
        expect(valPorTamanho(500)).toBeGreaterThan(valPorTamanho(50));
        expect(valPorTamanho(10_000)).toBeGreaterThan(valPorTamanho(500));
    });

    it('satura no teto: uma nota gigante não engole o grafo', () => {
        expect(valPorTamanho(100_000_000)).toBe(12);
    });

    it('tamanho negativo não rebenta (trata como vazio)', () => {
        expect(valPorTamanho(-5)).toBe(1);
    });
});

describe('construirGraphData', () => {
    const dados: GrafoDados = {
        nodes: [
            { id: '1', slug: 'a', title: 'A', group: 'knowledge', color: '#abc', size: 1000 },
            { id: '2', slug: 'b', title: 'B', group: 'daily', color: '#def', size: 0 },
        ],
        links: [{ source: '1', target: '2' }],
    };

    it('atribui val a partir do tamanho', () => {
        const g = construirGraphData(dados);
        expect(g.nodes[0].val).toBe(valPorTamanho(1000));
        expect(g.nodes[1].val).toBe(1);
    });

    it('copia nós E links — o force-graph muta os objetos que recebe', () => {
        const g = construirGraphData(dados);
        expect(g.nodes[0]).not.toBe(dados.nodes[0]);
        expect(g.links[0]).not.toBe(dados.links[0]);
        expect(g.links[0]).toEqual(dados.links[0]);
    });

    it('sem dados → grafo vazio', () => {
        expect(construirGraphData(null)).toEqual({ nodes: [], links: [] });
    });

    it('preserva posições do snapshot anterior (refetch não re-explode o layout)', () => {
        const anterior = construirGraphData(dados);
        anterior.nodes[0].x = 10;
        anterior.nodes[0].y = -4;
        anterior.nodes[0].z = 2;

        const g = construirGraphData(dados, anterior);
        expect(g.nodes[0].x).toBe(10);
        expect(g.nodes[0].y).toBe(-4);
        expect(g.nodes[0].z).toBe(2);
        // nó novo (sem posição anterior) entra sem posição: o motor coloca-o
        expect(g.nodes[1].x).toBeUndefined();
    });
});

describe('ligaAoNo', () => {
    it('extremos como string (antes do motor processar)', () => {
        expect(ligaAoNo({ source: '1', target: '2' }, '1')).toBe(true);
        expect(ligaAoNo({ source: '1', target: '2' }, '2')).toBe(true);
        expect(ligaAoNo({ source: '1', target: '2' }, '3')).toBe(false);
    });

    it('extremos como objeto nó (depois do motor substituir as refs)', () => {
        const link = { source: { id: '1' }, target: { id: '2' } };
        expect(ligaAoNo(link, '2')).toBe(true);
        expect(ligaAoNo(link, '9')).toBe(false);
    });

    it('sem nó ativo → nunca liga', () => {
        expect(ligaAoNo({ source: '1', target: '2' }, null)).toBe(false);
    });
});
