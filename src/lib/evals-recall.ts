// Métricas puras dos evals de recall (battle-plan Fase 4). Sem deps de BD —
// o harness (scripts/evals-recall.ts) alimenta os ResultadoQuery.

export interface ResultadoQuery {
    query: string;
    notaEsperada: string | null; // título da nota esperada; null = query irrelevante
    rank: number | null; // 1-indexed no top-k; null = não recuperada
    simEsperada: number | null; // similaridade da nota esperada (ou do topo, nas irrelevantes)
    topSim: number | null; // similaridade do 1º resultado
    mantida: boolean; // o threshold tratou bem: relevante sobrevive / irrelevante nada sobrevive
}

// Fração das queries RELEVANTES (notaEsperada !== null) cuja nota esperada caiu no top-k.
export function recallAtK(resultados: ResultadoQuery[], k: number): number {
    const relevantes = resultados.filter((r) => r.notaEsperada !== null);
    if (!relevantes.length) return 0;
    const cobertas = relevantes.filter((r) => r.rank !== null && r.rank <= k).length;
    return cobertas / relevantes.length;
}

export interface JanelaSeparacao {
    minRel: number;
    maxIrr: number;
    janela: number;
    corteSugerido: number;
}

// Separação entre o pior relevante e o melhor irrelevante. Assume arrays não-vazios
// (o dataset garante-o). janela > 0 = corte limpo possível; < 0 = sobreposição.
export function janelaSeparacao(
    simsRelevantes: number[],
    simsIrrelevantes: number[],
): JanelaSeparacao {
    const minRel = Math.min(...simsRelevantes);
    const maxIrr = Math.max(...simsIrrelevantes);
    return { minRel, maxIrr, janela: minRel - maxIrr, corteSugerido: (minRel + maxIrr) / 2 };
}
