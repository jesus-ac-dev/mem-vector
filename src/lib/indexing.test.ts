import { describe, it, expect } from 'vitest';
import { planReindex, type HashedChunk, type ExistingChunk } from './indexing';

const hc = (over: Partial<HashedChunk>): HashedChunk => ({
    heading: null,
    content: 'x',
    startLine: 1,
    endLine: 1,
    hash: 'h',
    ...over,
});
const ec = (over: Partial<ExistingChunk>): ExistingChunk => ({
    id: 'id',
    hash: 'h',
    startLine: 1,
    endLine: 1,
    heading: null,
    ...over,
});

describe('planReindex', () => {
    it('sem chunks existentes, insere todos', () => {
        const next = [hc({ hash: 'a' }), hc({ hash: 'b' })];
        const plan = planReindex(next, []);
        expect(plan.toInsert).toEqual(next);
        expect(plan.toUpdate).toEqual([]);
        expect(plan.toDeleteIds).toEqual([]);
    });

    it('chunk inalterado (mesma hash e posição) não faz nada', () => {
        const plan = planReindex(
            [hc({ hash: 'a', startLine: 3, endLine: 4 })],
            [ec({ id: 'x1', hash: 'a', startLine: 3, endLine: 4 })],
        );
        expect(plan.toInsert).toEqual([]);
        expect(plan.toUpdate).toEqual([]);
        expect(plan.toDeleteIds).toEqual([]);
    });

    it('mesmo conteúdo mas linhas mudaram: atualiza posição, não re-insere (reusa embedding)', () => {
        const plan = planReindex(
            [hc({ hash: 'a', startLine: 10, endLine: 12, heading: 'H' })],
            [ec({ id: 'x1', hash: 'a', startLine: 3, endLine: 4, heading: 'H' })],
        );
        expect(plan.toInsert).toEqual([]);
        expect(plan.toUpdate).toEqual([{ id: 'x1', startLine: 10, endLine: 12, heading: 'H' }]);
        expect(plan.toDeleteIds).toEqual([]);
    });

    it('chunk que desapareceu é apagado', () => {
        const plan = planReindex([], [ec({ id: 'x1', hash: 'a' })]);
        expect(plan.toInsert).toEqual([]);
        expect(plan.toDeleteIds).toEqual(['x1']);
    });

    it('misto: insere o novo, apaga o stale, mantém o igual', () => {
        const novo = hc({ hash: 'novo' });
        const plan = planReindex(
            [hc({ hash: 'igual' }), novo],
            [ec({ id: 'a', hash: 'igual' }), ec({ id: 'b', hash: 'stale' })],
        );
        expect(plan.toInsert).toEqual([novo]);
        expect(plan.toUpdate).toEqual([]);
        expect(plan.toDeleteIds).toEqual(['b']);
    });
});
