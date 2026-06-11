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

export interface TagComNotas {
    tag: string; // primeira grafia encontrada (match case-insensitive)
    notas: NotaItem[]; // ordenadas por título (pt)
}

// Painel de tags à Obsidian (#32): todas as tags da árvore com as notas onde
// aparecem. Case-insensitive mantendo a primeira grafia; tags ordenadas por
// nº de ocorrências (desc) e depois alfabeticamente (pt).
export function tagsComNotasDaArvore(arvore: Arvore): TagComNotas[] {
    const porChave = new Map<string, TagComNotas>();
    const recolher = (notas: NotaItem[]) => {
        for (const n of notas)
            for (const t of n.tags ?? []) {
                const chave = t.toLowerCase();
                const entrada = porChave.get(chave);
                if (entrada) entrada.notas.push(n);
                else porChave.set(chave, { tag: t, notas: [n] });
            }
    };
    const visitar = (no: NoArvore) => {
        recolher(no.notas);
        no.subpastas.forEach(visitar);
    };
    recolher(arvore.raizNotas);
    arvore.raizPastas.forEach(visitar);

    const lista = [...porChave.values()];
    for (const t of lista) t.notas.sort((a, b) => a.title.localeCompare(b.title, 'pt'));
    lista.sort((a, b) => b.notas.length - a.notas.length || a.tag.localeCompare(b.tag, 'pt'));
    return lista;
}

// Kernel como secção root do explorer (#39): separa a pasta kernel da árvore
// para a UI a apresentar como par de Knowledge/Daily Notes. Só apresentação —
// os dados continuam a ser a pasta kernel (RAG, links, versões intactos).
export function separarKernel(arvore: Arvore): { kernel: NoArvore | null; resto: Arvore } {
    const idx = arvore.raizPastas.findIndex((no) => no.pasta.name.toLowerCase() === 'kernel');
    if (idx === -1) return { kernel: null, resto: arvore };
    return {
        kernel: arvore.raizPastas[idx],
        resto: {
            raizPastas: arvore.raizPastas.filter((_, i) => i !== idx),
            raizNotas: arvore.raizNotas,
        },
    };
}
