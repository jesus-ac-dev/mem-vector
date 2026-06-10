export interface OutlineItem {
    texto: string;
    nivel: number; // 1..6 (número de #)
    linha: number; // 1-based
    id: string; // anchor interno usado pelo Outline e pelo renderer Markdown
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function normalizarHeadingIdTexto(texto: string): string {
    const base = texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base || 'secao';
}

export function criarHeadingIdFactory(): (texto: string) => string {
    const contagem = new Map<string, number>();
    return (texto: string) => {
        const base = normalizarHeadingIdTexto(texto);
        const total = (contagem.get(base) ?? 0) + 1;
        contagem.set(base, total);
        return total === 1 ? base : `${base}-${total}`;
    };
}

// Extrai o índice (outline) de um markdown: cada heading ATX com texto, nível,
// linha 1-based e id de anchor. Linhas sem espaço a seguir aos # não são
// headings ATX válidos.
export function extrairOutline(md: string): OutlineItem[] {
    const out: OutlineItem[] = [];
    const linhas = md.split('\n');
    const headingId = criarHeadingIdFactory();
    for (let i = 0; i < linhas.length; i++) {
        const m = HEADING_RE.exec(linhas[i]);
        if (!m) continue;
        const texto = m[2].trim();
        out.push({ texto, nivel: m[1].length, linha: i + 1, id: headingId(texto) });
    }
    return out;
}
