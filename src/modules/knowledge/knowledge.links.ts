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

// Namespace dos wikilinks que apontam para uma conversa do chat (não uma nota
// knowledge): [[conversa:<id>]] resolve para a vista da conversa e é ignorado
// pelo parser de edges — a ligação daily→conversa é estrutural, não derivada do texto.
const PREFIXO_CONVERSA = 'conversa:';

export interface WikilinkParts {
    target: string;
    label: string;
    hasAlias: boolean;
}

export interface WikilinkTarget {
    target: string;
    slug: string;
    path: string | null;
}

interface ReescreverWikilinksOptions {
    oldTargetPath?: string | null;
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

function ultimoSegmento(target: string): string {
    const partes = target
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean);
    return partes.at(-1) ?? target;
}

function segmentosTarget(target: string): string[] {
    return target
        .trim()
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean);
}

function normalizarTargetPath(target: string): string {
    return segmentosTarget(target).map(slugify).join('/');
}

function substituirUltimoSegmento(target: string, novoTitulo: string): string {
    const partes = segmentosTarget(target);
    if (partes.length <= 1) return novoTitulo;
    return [...partes.slice(0, -1), novoTitulo].join('/');
}

function substituirPrefixoPath(
    target: string,
    oldFolderPath: string,
    newFolderPath: string,
): string | null {
    const targetParts = segmentosTarget(target);
    const oldParts = segmentosTarget(oldFolderPath);
    if (!oldParts.length || targetParts.length <= oldParts.length) return null;

    const targetPrefix = targetParts.slice(0, oldParts.length).map(slugify);
    const oldPrefix = oldParts.map(slugify);
    const match = oldPrefix.every((part, i) => targetPrefix[i] === part);
    if (!match) return null;

    return [...segmentosTarget(newFolderPath), ...targetParts.slice(oldParts.length)].join('/');
}

// Resolve o alvo de um [[wikilink]] para um href interno. Alvos com cara de data
// (YYYY-MM-DD) apontam para o daily desse dia; o resto para uma nota knowledge.
export function alvoParaHref(target: string): string {
    const t = target.trim();
    if (t.startsWith(PREFIXO_CONVERSA)) return `/chat/${t.slice(PREFIXO_CONVERSA.length)}`;
    if (PADRAO_DATA.test(t)) return `/daily/${t}`;
    const slug = slugify(ultimoSegmento(t));
    if (t.includes('/')) return `/knowledge/${slug}?path=${encodeURIComponent(t)}`;
    return `/knowledge/${slug}`;
}

export function parseWikilinks(markdown: string): string[] {
    return [...new Set(parseWikilinkTargets(markdown).map((link) => link.slug))];
}

export function parseWikilinkTargets(markdown: string): WikilinkTarget[] {
    const out: WikilinkTarget[] = [];
    const seen = new Set<string>();
    for (const m of markdown.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const { target } = partesWikilink(m[1]);
        const alvo = target.trim().replace(/^\/+|\/+$/g, '');
        if (alvo.startsWith(PREFIXO_CONVERSA)) continue;
        const slug = slugify(ultimoSegmento(alvo));
        const path = alvo.includes('/') ? alvo : null;
        const key = path ? `${slug}:${path}` : slug;
        if (slug && !seen.has(key)) {
            seen.add(key);
            out.push({ target: alvo, slug, path });
        }
    }
    return out;
}

// Reescreve [[wikilinks]] cujo alvo slugifica para `oldSlug`, apontando-os para
// `novoTitulo`. Usado ao renomear uma nota, para os links não partirem.
export function reescreverWikilinks(
    markdown: string,
    oldSlug: string,
    novoTitulo: string,
    options: ReescreverWikilinksOptions = {},
): string {
    const oldPath = options.oldTargetPath ? normalizarTargetPath(options.oldTargetPath) : null;

    return markdown.replace(/\[\[([^\]]+)\]\]/g, (m, inner: string) => {
        const parts = partesWikilink(inner);
        const targetTemPath = segmentosTarget(parts.target).length > 1;
        const targetSlug = slugify(ultimoSegmento(parts.target));
        const targetPath = normalizarTargetPath(parts.target);
        const matchPorPath = oldPath && targetTemPath ? targetPath === oldPath : false;
        const matchPorSlug = !oldPath || !targetTemPath ? targetSlug === oldSlug : false;
        if (!matchPorPath && !matchPorSlug) return m;

        const novoTarget = substituirUltimoSegmento(parts.target, novoTitulo);
        const aliasSegueTituloAntigo = slugify(ultimoSegmento(parts.label)) === oldSlug;
        if (!parts.hasAlias) return `[[${novoTarget}]]`;
        if (aliasSegueTituloAntigo) {
            return targetTemPath ? `[[${novoTarget}|${novoTitulo}]]` : `[[${novoTarget}]]`;
        }
        return `[[${novoTarget}|${parts.label}]]`;
    });
}

export function reescreverWikilinkPaths(
    markdown: string,
    oldFolderPath: string,
    newFolderPath: string,
): string {
    return markdown.replace(/\[\[([^\]]+)\]\]/g, (m, inner: string) => {
        const parts = partesWikilink(inner);
        const novoTarget = substituirPrefixoPath(parts.target, oldFolderPath, newFolderPath);
        if (!novoTarget) return m;
        return parts.hasAlias ? `[[${novoTarget}|${parts.label}]]` : `[[${novoTarget}]]`;
    });
}
