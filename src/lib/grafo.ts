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

// ── Timelapse cronológico (à Obsidian: o grafo cresce com a data de criação) ──

interface NoCronologia {
    id: string;
    createdAt?: string;
}

// Nascimento de cada nó (epoch ms). Nó com createdAt usa-a; fantasma (sem
// data própria) nasce com a PRIMEIRA origem que o liga; sem data nem origens
// nasce em 0 (sempre visível).
export function nascimentosDoGrafo(data: {
    nodes: NoCronologia[];
    links: { source: unknown; target: unknown }[];
}): Map<string, number> {
    const nascimentos = new Map<string, number>();
    const semData: string[] = [];
    for (const n of data.nodes) {
        const t = n.createdAt ? Date.parse(n.createdAt) : NaN;
        if (Number.isFinite(t)) nascimentos.set(n.id, t);
        else semData.push(n.id);
    }
    for (const id of semData) {
        let primeiro = Infinity;
        for (const l of data.links) {
            if (idDeExtremo(l.target) !== id) continue;
            const origem = idDeExtremo(l.source);
            const t = origem ? nascimentos.get(origem) : undefined;
            if (t !== undefined && t < primeiro) primeiro = t;
        }
        nascimentos.set(id, Number.isFinite(primeiro) ? primeiro : 0);
    }
    return nascimentos;
}

// A aresta nasce quando os DOIS extremos existem.
export function nascimentoDeLink(
    link: { source?: unknown; target?: unknown },
    nascimentos: Map<string, number>,
): number {
    const a = idDeExtremo(link.source);
    const b = idDeExtremo(link.target);
    const ta = a != null ? (nascimentos.get(a) ?? 0) : 0;
    const tb = b != null ? (nascimentos.get(b) ?? 0) : 0;
    return Math.max(ta, tb);
}

// Instantes do timelapse: nascimentos ordenados, sem duplicados.
export function instantesDoGrafo(nascimentos: Map<string, number>): number[] {
    return [...new Set(nascimentos.values())].sort((x, y) => x - y);
}
