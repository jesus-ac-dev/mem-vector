export interface Pasta {
    id: string;
    name: string;
    parentId: string | null;
    color: string | null;
}
export interface NotaItem {
    id: string;
    slug: string;
    title: string;
    folderId: string | null;
    tags?: string[];
}
export interface NoArvore {
    pasta: Pasta;
    subpastas: NoArvore[];
    notas: NotaItem[];
}
export interface Arvore {
    raizPastas: NoArvore[]; // pastas de topo
    raizNotas: NotaItem[]; // notas sem pasta
}

// Monta a árvore do explorer a partir das pastas e notas (planas). Pastas
// aninham por parentId, notas por folderId; referências órfãs (pasta-pai ou
// pasta inexistente) caem na raiz. Pastas e notas ordenadas por nome (pt).
export function construirArvore(pastas: Pasta[], notas: NotaItem[]): Arvore {
    const nos = new Map<string, NoArvore>();
    for (const p of pastas) nos.set(p.id, { pasta: p, subpastas: [], notas: [] });

    const raizPastas: NoArvore[] = [];
    for (const p of pastas) {
        const no = nos.get(p.id)!;
        const pai = p.parentId ? nos.get(p.parentId) : undefined;
        if (pai) pai.subpastas.push(no);
        else raizPastas.push(no);
    }

    const raizNotas: NotaItem[] = [];
    for (const n of notas) {
        const dono = n.folderId ? nos.get(n.folderId) : undefined;
        if (dono) dono.notas.push(n);
        else raizNotas.push(n);
    }

    const porNome = (a: string, b: string) => a.localeCompare(b, 'pt');
    const ordenar = (no: NoArvore) => {
        no.subpastas.sort((a, b) => porNome(a.pasta.name, b.pasta.name));
        no.notas.sort((a, b) => porNome(a.title, b.title));
        no.subpastas.forEach(ordenar);
    };
    raizPastas.sort((a, b) => porNome(a.pasta.name, b.pasta.name));
    raizPastas.forEach(ordenar);
    raizNotas.sort((a, b) => porNome(a.title, b.title));

    return { raizPastas, raizNotas };
}

// Tags distintas de toda a árvore (para a barra de filtro), case-insensitive
// mantendo a primeira grafia, ordenadas (pt).
export function tagsDaArvore(arvore: Arvore): string[] {
    const porChave = new Map<string, string>();
    const recolher = (notas: NotaItem[]) => {
        for (const n of notas)
            for (const t of n.tags ?? []) {
                const chave = t.toLowerCase();
                if (!porChave.has(chave)) porChave.set(chave, t);
            }
    };
    const visitar = (no: NoArvore) => {
        recolher(no.notas);
        no.subpastas.forEach(visitar);
    };
    recolher(arvore.raizNotas);
    arvore.raizPastas.forEach(visitar);
    return [...porChave.values()].sort((a, b) => a.localeCompare(b, 'pt'));
}

// Filtra a árvore para as notas com a tag (case-insensitive). Pastas sem
// notas nem subpastas com match são podadas; pastas-pai de um match ficam.
export function filtrarArvorePorTag(arvore: Arvore, tag: string): Arvore {
    const alvo = tag.toLowerCase();
    const temTag = (n: NotaItem) => (n.tags ?? []).some((t) => t.toLowerCase() === alvo);

    const filtrarNo = (no: NoArvore): NoArvore | null => {
        const notas = no.notas.filter(temTag);
        const subpastas = no.subpastas.map(filtrarNo).filter((s): s is NoArvore => s !== null);
        if (!notas.length && !subpastas.length) return null;
        return { pasta: no.pasta, subpastas, notas };
    };

    return {
        raizPastas: arvore.raizPastas.map(filtrarNo).filter((s): s is NoArvore => s !== null),
        raizNotas: arvore.raizNotas.filter(temTag),
    };
}
