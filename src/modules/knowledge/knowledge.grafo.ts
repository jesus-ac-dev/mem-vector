import type { GrafoLink, GrafoNode } from './knowledge.service';

// Cor base dos fantasmas (o componente esbate conforme o tema).
export const COR_FANTASMA = '#94a3b8';

export interface ArestaBruta {
    fromId: string;
    toId: string | null;
    toSlug: string | null;
}

// Separa as arestas do grafo à Obsidian: alvo dentro do grafo → ligação real;
// alvo fora (link por criar ou nota arquivada) → nó fantasma esbatido, um por
// slug. `idPorSlug` apanha pendentes cujo slug é um nó do grafo (ex.: wikilinks
// para dailies, que a resolução de edges nunca preenche). Arestas cuja origem
// não está no grafo descartam-se.
export function montarArestasGrafo(
    arestas: ArestaBruta[],
    idsValidos: Set<string>,
    idPorSlug: Map<string, string> = new Map(),
): { links: GrafoLink[]; fantasmas: GrafoNode[] } {
    const links: GrafoLink[] = [];
    const fantasmas = new Map<string, GrafoNode>();

    for (const a of arestas) {
        if (!idsValidos.has(a.fromId)) continue;

        if (a.toId && idsValidos.has(a.toId)) {
            links.push({ source: a.fromId, target: a.toId });
            continue;
        }

        const slug = a.toSlug?.trim();
        if (!slug) continue;

        const noPorSlug = idPorSlug.get(slug);
        if (noPorSlug) {
            links.push({ source: a.fromId, target: noPorSlug });
            continue;
        }
        const id = `fantasma:${slug}`;
        if (!fantasmas.has(id)) {
            fantasmas.set(id, {
                id,
                slug,
                title: slug,
                group: 'fantasma',
                color: COR_FANTASMA,
                size: 0,
            });
        }
        links.push({ source: a.fromId, target: id });
    }

    return { links, fantasmas: [...fantasmas.values()] };
}
