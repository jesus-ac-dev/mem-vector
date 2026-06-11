import { describe, it, expect } from 'vitest';
import { construirArvore, tagsComNotasDaArvore, type Pasta, type NotaItem } from './folders.tree';

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

describe('tagsComNotasDaArvore', () => {
    it('agrupa case-insensitive mantendo a primeira grafia, com notas de raiz e pastas', () => {
        const arv = construirArvore(
            [pasta({ id: 'a', name: 'A' })],
            [
                nota({ id: 'n1', title: 'Beta', tags: ['rag', 'chat'] }),
                nota({ id: 'n2', title: 'Alfa', folderId: 'a', tags: ['Chat', 'agente'] }),
                nota({ id: 'n3', folderId: 'a' }),
            ],
        );
        const tags = tagsComNotasDaArvore(arv);
        const chat = tags.find((t) => t.tag === 'chat');
        expect(chat?.notas.map((n) => n.id)).toEqual(['n2', 'n1']); // ordenadas por título
        expect(tags.map((t) => t.tag)).not.toContain('Chat'); // 1ª grafia ganha
    });

    it('ordena por nº de ocorrências desc e desempata alfabeticamente (pt)', () => {
        const arv = construirArvore(
            [],
            [
                nota({ id: 'n1', tags: ['zebra', 'rag'] }),
                nota({ id: 'n2', tags: ['rag', 'agente'] }),
                nota({ id: 'n3', tags: ['rag'] }),
            ],
        );
        expect(tagsComNotasDaArvore(arv).map((t) => [t.tag, t.notas.length])).toEqual([
            ['rag', 3],
            ['agente', 1],
            ['zebra', 1],
        ]);
    });

    it('árvore sem tags devolve lista vazia', () => {
        const arv = construirArvore([], [nota({ id: 'n1' })]);
        expect(tagsComNotasDaArvore(arv)).toEqual([]);
    });
});

describe('separarKernel', () => {
    it('extrai a pasta kernel (case-insensitive) e devolve o resto intacto', async () => {
        const { separarKernel } = await import('./folders.tree');
        const arv = construirArvore(
            [pasta({ id: 'k', name: 'Kernel' }), pasta({ id: 'a', name: 'A' })],
            [
                nota({ id: 'n1', title: 'Sobre mim', folderId: 'k' }),
                nota({ id: 'n2', title: 'Solta' }),
            ],
        );
        const { kernel, resto } = separarKernel(arv);
        expect(kernel?.pasta.id).toBe('k');
        expect(kernel?.notas.map((n) => n.id)).toEqual(['n1']);
        expect(resto.raizPastas.map((p) => p.pasta.id)).toEqual(['a']);
        expect(resto.raizNotas.map((n) => n.id)).toEqual(['n2']);
    });

    it('sem pasta kernel devolve kernel null e a árvore original', async () => {
        const { separarKernel } = await import('./folders.tree');
        const arv = construirArvore([pasta({ id: 'a', name: 'A' })], [nota({ id: 'n1' })]);
        const { kernel, resto } = separarKernel(arv);
        expect(kernel).toBeNull();
        expect(resto).toEqual(arv);
    });
});
