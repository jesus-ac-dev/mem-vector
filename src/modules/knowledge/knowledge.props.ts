// Propriedades de uma nota knowledge (decisão 2026-06-06): tags + summary no
// frontmatter jsonb, visibility na coluna, created da row. Helpers puros.

export const VISIBILIDADES = ['privado', 'protected', 'publico'] as const;
export type Visibilidade = (typeof VISIBILIDADES)[number];

export interface PropriedadesNota {
    id: string;
    tags: string[];
    summary: string | null;
    visibility: Visibilidade;
    createdAt: string;
}

// Normaliza tags à Obsidian: trim, sem # inicial, espaços viram hífen,
// deduplicação case-insensitive mantendo a primeira grafia.
export function normalizarTags(tags: string[]): string[] {
    const vistas = new Set<string>();
    const out: string[] = [];
    for (const bruta of tags) {
        const tag = bruta.trim().replace(/^#+/, '').replace(/\s+/g, '-');
        if (!tag) continue;
        const chave = tag.toLowerCase();
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        out.push(tag);
    }
    return out;
}

// União aditiva de tags ao continuar uma nota (#90): preserva as existentes
// (incl. as postas pelo utilizador) e acrescenta as novas do agente, dedup à
// Obsidian. A política é acrescentar, nunca remover o que o user pôs.
export function unirTags(existentes: string[] = [], novas: string[] = []): string[] {
    return normalizarTags([...existentes, ...novas]);
}

// Patch de frontmatter das tags geradas pelo agente (#90), análogo a
// summaryDoAgente: vazio sem tags — o merge não toca no que existe.
export function tagsDoAgente(tags?: string[]): Record<string, string[]> {
    return tags && tags.length ? { tags } : {};
}

export interface PropriedadesRow {
    id: string;
    frontmatter: unknown;
    visibility: string;
    created_at: string;
}

// Leitura defensiva do frontmatter jsonb (pode vir de versões antigas sem
// tags/summary, ou malformado).
export function propriedadesDoRow(row: PropriedadesRow): PropriedadesNota {
    const fm =
        row.frontmatter && typeof row.frontmatter === 'object'
            ? (row.frontmatter as Record<string, unknown>)
            : {};
    const tags = Array.isArray(fm.tags) ? fm.tags.filter((t) => typeof t === 'string') : [];
    const summary = typeof fm.summary === 'string' && fm.summary.trim() ? fm.summary : null;
    const visibility = (VISIBILIDADES as readonly string[]).includes(row.visibility)
        ? (row.visibility as Visibilidade)
        : 'privado';
    return { id: row.id, tags, summary, visibility, createdAt: row.created_at };
}
