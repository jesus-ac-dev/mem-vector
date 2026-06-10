import type { GrafoDados, GrafoLink, GrafoNode } from '@/modules/knowledge/knowledge.service';

// Nó como o force-graph o vê: val controla a área da bola; posições e
// velocidades são escritas pelo motor de simulação durante o layout.
export interface NoGrafoView extends GrafoNode {
    val: number;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
}

export interface GraphDataView {
    nodes: NoGrafoView[];
    links: GrafoLink[];
}

// Um extremo de link é o id (string) antes do motor processar; depois o
// force-graph substitui-o pela ref do próprio objeto nó.
function idDeExtremo(extremo: unknown): string | null {
    if (typeof extremo === 'string') return extremo;
    if (extremo && typeof extremo === 'object' && 'id' in extremo) {
        return String((extremo as { id: unknown }).id);
    }
    return null;
}

// A aresta toca o nó dado? (para iluminar as ligações do ficheiro ativo)
export function ligaAoNo(link: { source?: unknown; target?: unknown }, id: string | null): boolean {
    if (!id) return false;
    return idDeExtremo(link.source) === id || idDeExtremo(link.target) === id;
}

// Bola proporcional ao tamanho do ficheiro (nº de caracteres), em escala log:
// 200 chars ≈ 2, 10k ≈ 6.6, teto 12 para uma nota gigante não engolir o grafo.
export function valPorTamanho(chars: number): number {
    return Math.min(12, 1 + Math.log2(1 + Math.max(chars, 0) / 200));
}

// Constrói os dados do force-graph a partir do snapshot do servidor.
// Copia nós E links: o force-graph muta os objetos que recebe (posições nos
// nós, refs de nó nos links). Reutilizar os originais entre rebuilds reinicia
// o layout do zero ("explosão") e deixa arestas presas a nós antigos.
// `anterior` semeia as posições do snapshot prévio: num refetch, os nós que já
// existiam ficam onde estavam e só os novos são colocados pelo motor.
export function construirGraphData(
    dados: GrafoDados | null,
    anterior?: GraphDataView,
): GraphDataView {
    if (!dados) return { nodes: [], links: [] };
    const previos = new Map((anterior?.nodes ?? []).map((n) => [n.id, n]));
    return {
        nodes: dados.nodes.map((n) => {
            const p = previos.get(n.id);
            return {
                ...n,
                val: valPorTamanho(n.size),
                x: p?.x,
                y: p?.y,
                z: p?.z,
                vx: p?.vx,
                vy: p?.vy,
                vz: p?.vz,
            };
        }),
        links: dados.links.map((l) => ({ ...l })),
    };
}
