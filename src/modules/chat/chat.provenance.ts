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

export function sourceHref(source: Source): string | null {
    const metadata = source.metadata;
    if (metadata?.entity_type === 'daily' && metadata.dia) {
        return `/daily/${encodeURIComponent(metadata.dia)}`;
    }
    if (metadata?.entity_type === 'knowledge' && metadata.slug) {
        return `/knowledge/${encodeURIComponent(metadata.slug)}`;
    }
    return null;
}

export function sourceLabel(source: Source, index: number): string {
    const metadata = source.metadata;
    if (metadata?.entity_type === 'daily' && metadata.dia) {
        return `[${index + 1}] Daily ${metadata.dia}`;
    }
    if (metadata?.entity_type === 'knowledge') {
        return `[${index + 1}] ${metadata.title ?? metadata.slug ?? 'knowledge'}`;
    }
    return `[${index + 1}] ${source.source ?? 'workspace'}`;
}

export function linkCitations(content: string, sources: Source[]): string {
    return content.replace(/\[(\d+)\](?!\()/g, (match, rawIndex: string) => {
        const index = Number(rawIndex) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= sources.length) return match;

        const href = sourceHref(sources[index]);
        return href ? `[${rawIndex}](${href})` : match;
    });
}
