export function slugify(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;

export interface WikilinkParts {
    target: string;
    label: string;
    hasAlias: boolean;
}

export function partesWikilink(raw: string): WikilinkParts {
    const pipe = raw.indexOf('|');
    if (pipe === -1) {
        const target = raw.trim();
        return { target, label: target, hasAlias: false };
    }

    const target = raw.slice(0, pipe).trim();
    const alias = raw.slice(pipe + 1).trim();
    return { target, label: alias || target, hasAlias: true };
}

// Resolve o alvo de um [[wikilink]] para um href interno. Alvos com cara de data
// (YYYY-MM-DD) apontam para o daily desse dia; o resto para uma nota knowledge.
export function alvoParaHref(target: string): string {
    const t = target.trim();
    if (PADRAO_DATA.test(t)) return `/daily/${t}`;
    return `/knowledge/${slugify(t)}`;
}

export function parseWikilinks(markdown: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const m of markdown.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const { target } = partesWikilink(m[1]);
        const slug = slugify(target);
        if (slug && !seen.has(slug)) {
            seen.add(slug);
            out.push(slug);
        }
    }
    return out;
}

// Reescreve [[wikilinks]] cujo alvo slugifica para `oldSlug`, apontando-os para
// `novoTitulo`. Usado ao renomear uma nota, para os links não partirem.
export function reescreverWikilinks(markdown: string, oldSlug: string, novoTitulo: string): string {
    return markdown.replace(/\[\[([^\]]+)\]\]/g, (m, inner: string) => {
        const parts = partesWikilink(inner);
        if (slugify(parts.target) !== oldSlug) return m;
        return parts.hasAlias ? `[[${novoTitulo}|${parts.label}]]` : `[[${novoTitulo}]]`;
    });
}
