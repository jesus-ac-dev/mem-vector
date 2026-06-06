export interface MarkdownChunk {
    heading: string | null;
    content: string;
    startLine: number;
    endLine: number;
}

export interface ChunkOptions {
    maxChars?: number;
}

const DEFAULT_MAX_CHARS = 1200;
const HEADING_RE = /^#{1,6}\s+/;

function headingText(line: string): string {
    return line.replace(HEADING_RE, '').trim();
}

interface Section {
    start: number; // 0-based, inclusive
    end: number; // 0-based, inclusive (já aparado de linhas em branco finais)
    heading: string | null;
}

// Parte markdown em chunks por heading. O preâmbulo (antes do primeiro heading)
// é o seu próprio chunk com heading null. Secções acima de `maxChars` caem para
// um split por parágrafos (runs de linhas não-em-branco), empacotados de forma
// gananciosa até ao limite; um parágrafo isolado nunca é partido a meio. As
// linhas em branco finais de cada secção são aparadas e secções só-em-branco
// são descartadas. O `content` é a fatia literal do documento, por isso
// `startLine`/`endLine` (1-based) mapeiam sempre de volta ao original.
export function chunkMarkdown(md: string, opts: ChunkOptions = {}): MarkdownChunk[] {
    const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
    const lines = md.split('\n');
    const n = lines.length;

    // 1) Partir em secções por heading.
    const sections: Section[] = [];
    let start = 0;
    let heading: string | null = null;
    const closeSection = (endExclusive: number) => {
        let e = endExclusive - 1;
        while (e >= start && lines[e].trim() === '') e--;
        if (e >= start) sections.push({ start, end: e, heading });
    };
    for (let i = 0; i < n; i++) {
        if (!HEADING_RE.test(lines[i])) continue;
        if (i > start) closeSection(i);
        start = i;
        heading = headingText(lines[i]);
    }
    closeSection(n);

    // 2) Cada secção: 1 chunk se couber, senão pack por parágrafos.
    const chunks: MarkdownChunk[] = [];
    const lenOf = (a: number, b: number) => lines.slice(a, b + 1).join('\n').length;
    const push = (s: number, e: number, h: string | null) =>
        chunks.push({
            heading: h,
            content: lines.slice(s, e + 1).join('\n'),
            startLine: s + 1,
            endLine: e + 1,
        });

    for (const sec of sections) {
        if (lenOf(sec.start, sec.end) <= maxChars) {
            push(sec.start, sec.end, sec.heading);
            continue;
        }

        // Parágrafos = runs contíguos de linhas não-em-branco.
        const paragraphs: Array<[number, number]> = [];
        let cur = -1;
        for (let i = sec.start; i <= sec.end; i++) {
            if (lines[i].trim() === '') {
                cur = -1;
                continue;
            }
            if (cur === -1) {
                paragraphs.push([i, i]);
                cur = paragraphs.length - 1;
            } else {
                paragraphs[cur][1] = i;
            }
        }

        // Pack ganancioso: estende o chunk atual enquanto couber.
        let cs = -1;
        let ce = -1;
        for (const [ps, pe] of paragraphs) {
            if (cs === -1) {
                cs = ps;
                ce = pe;
            } else if (lenOf(cs, pe) <= maxChars) {
                ce = pe;
            } else {
                push(cs, ce, sec.heading);
                cs = ps;
                ce = pe;
            }
        }
        if (cs !== -1) push(cs, ce, sec.heading);
    }

    return chunks;
}
