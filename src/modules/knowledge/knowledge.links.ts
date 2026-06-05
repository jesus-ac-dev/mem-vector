export function slugify(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function parseWikilinks(markdown: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const m of markdown.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const slug = slugify(m[1]);
        if (slug && !seen.has(slug)) {
            seen.add(slug);
            out.push(slug);
        }
    }
    return out;
}
