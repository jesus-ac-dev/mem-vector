import type { Source } from './chat.prompt';

export interface Provenance {
    fromWorkspace: boolean;
    label: string;
}

// Tradução honesta do retrieval para a UI: sem fontes relevantes = a resposta veio
// do conhecimento geral do modelo, não do workspace (combina com o RAG-fallback).
export function provenance(sources: Source[]): Provenance {
    if (sources.length === 0) {
        return { fromWorkspace: false, label: 'Conhecimento geral — sem fontes do teu workspace' };
    }
    const n = sources.length;
    return { fromWorkspace: true, label: `${n} ${n === 1 ? 'fonte' : 'fontes'} do workspace` };
}
