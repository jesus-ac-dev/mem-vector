import { describe, it, expect } from 'vitest';
import { construirArvore, type Pasta, type NotaItem } from './folders.tree';

const pasta = (over: Partial<Pasta>): Pasta => ({
    id: 'f',
    name: 'Pasta',
    parentId: null,
    color: null,
    ...over,
});
const nota = (over: Partial<NotaItem>): NotaItem => ({
    id: 'n',
    slug: 's',
    title: 'Nota',
    folderId: null,
    ...over,
});

describe('construirArvore', () => {
    it('notas sem pasta e pastas sem pai vão à raiz', () => {
        const arv = construirArvore(
            [pasta({ id: 'a', name: 'A' })],
            [nota({ id: 'n1', title: 'N' })],
        );
        expect(arv.raizNotas.map((n) => n.id)).toEqual(['n1']);
        expect(arv.raizPastas.map((p) => p.pasta.id)).toEqual(['a']);
        expect(arv.raizPastas[0].notas).toEqual([]);
    });

    it('nota com folderId aninha na pasta certa', () => {
        const arv = construirArvore(
            [pasta({ id: 'a', name: 'A' })],
            [nota({ id: 'n1', folderId: 'a' }), nota({ id: 'n2', folderId: null })],
        );
        expect(arv.raizPastas[0].notas.map((n) => n.id)).toEqual(['n1']);
        expect(arv.raizNotas.map((n) => n.id)).toEqual(['n2']);
    });

    it('subpasta aninha na pasta-pai', () => {
        const arv = construirArvore(
            [pasta({ id: 'a', name: 'A' }), pasta({ id: 'b', name: 'B', parentId: 'a' })],
            [],
        );
        expect(arv.raizPastas.map((p) => p.pasta.id)).toEqual(['a']);
        expect(arv.raizPastas[0].subpastas.map((p) => p.pasta.id)).toEqual(['b']);
    });

    it('ordena pastas e notas por nome (pt)', () => {
        const arv = construirArvore(
            [pasta({ id: 'z', name: 'Zebra' }), pasta({ id: 'a', name: 'Árvore' })],
            [nota({ id: 'n2', title: 'Beta' }), nota({ id: 'n1', title: 'Alfa' })],
        );
        expect(arv.raizPastas.map((p) => p.pasta.name)).toEqual(['Árvore', 'Zebra']);
        expect(arv.raizNotas.map((n) => n.title)).toEqual(['Alfa', 'Beta']);
    });

    it('folderId órfão (pasta inexistente) cai na raiz', () => {
        const arv = construirArvore([], [nota({ id: 'n1', folderId: 'fantasma' })]);
        expect(arv.raizNotas.map((n) => n.id)).toEqual(['n1']);
    });
});
