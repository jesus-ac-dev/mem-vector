import { describe, it, expect } from 'vitest';
import {
    construirArvore,
    tagsDaArvore,
    filtrarArvorePorTag,
    type Pasta,
    type NotaItem,
} from './folders.tree';

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

describe('tagsDaArvore', () => {
    it('junta tags distintas de raiz e pastas, ordenadas (pt)', () => {
        const arv = construirArvore(
            [pasta({ id: 'a', name: 'A' })],
            [
                nota({ id: 'n1', tags: ['rag', 'chat'] }),
                nota({ id: 'n2', folderId: 'a', tags: ['Chat', 'agente'] }),
                nota({ id: 'n3', folderId: 'a' }),
            ],
        );
        expect(tagsDaArvore(arv)).toEqual(['agente', 'chat', 'rag']);
    });
});

describe('filtrarArvorePorTag', () => {
    it('mantém só notas com a tag (case-insensitive) e poda pastas vazias', () => {
        const arv = construirArvore(
            [pasta({ id: 'a', name: 'A' }), pasta({ id: 'b', name: 'B' })],
            [
                nota({ id: 'n1', tags: ['RAG'] }),
                nota({ id: 'n2', folderId: 'a', tags: ['rag'] }),
                nota({ id: 'n3', folderId: 'b', tags: ['chat'] }),
            ],
        );
        const f = filtrarArvorePorTag(arv, 'rag');
        expect(f.raizNotas.map((n) => n.id)).toEqual(['n1']);
        expect(f.raizPastas.map((p) => p.pasta.id)).toEqual(['a']);
        expect(f.raizPastas[0].notas.map((n) => n.id)).toEqual(['n2']);
    });

    it('mantém pasta-pai quando só a subpasta tem notas com a tag', () => {
        const arv = construirArvore(
            [pasta({ id: 'a', name: 'A' }), pasta({ id: 'a1', name: 'A1', parentId: 'a' })],
            [nota({ id: 'n1', folderId: 'a1', tags: ['rag'] })],
        );
        const f = filtrarArvorePorTag(arv, 'rag');
        expect(f.raizPastas.map((p) => p.pasta.id)).toEqual(['a']);
        expect(f.raizPastas[0].subpastas[0].notas.map((n) => n.id)).toEqual(['n1']);
    });
});
