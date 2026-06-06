export interface OutlineItem {
    texto: string;
    nivel: number; // 1..6 (número de #)
    linha: number; // 1-based
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

// Extrai o índice (outline) de um markdown: cada heading ATX com texto, nível e
// linha 1-based. Linhas sem espaço a seguir aos # não são headings ATX válidos.
export function extrairOutline(md: string): OutlineItem[] {
    const out: OutlineItem[] = [];
    const linhas = md.split('\n');
    for (let i = 0; i < linhas.length; i++) {
        const m = HEADING_RE.exec(linhas[i]);
        if (!m) continue;
        out.push({ texto: m[2].trim(), nivel: m[1].length, linha: i + 1 });
    }
    return out;
}
