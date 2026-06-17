export interface ResultadoWeb {
    titulo: string;
    url: string;
    snippet: string;
}

// Limite atingido / bloqueio do provider sem-key — sinaliza ao agente e à UI
// para sugerir configurar uma key (Brave) nas Definições (#45, regra do Carlos).
export class LimiteWebError extends Error {
    constructor(mensagem = 'limite de pesquisa web atingido') {
        super(mensagem);
        this.name = 'LimiteWebError';
    }
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';

function limparHtml(s: string): string {
    return s
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&middot;/g, '·')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .trim();
}

// Endereços de rede interna — barra SSRF (o agente não pode ler localhost,
// metadata cloud 169.254.169.254, ranges privados) via ler_url.
const REDE_INTERNA =
    /^https?:\/\/(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[?::1\]?|\[?fd[0-9a-f]{2}:)/i;

function urlHttpValido(u: string): boolean {
    return /^https?:\/\//i.test(u) && !REDE_INTERNA.test(u);
}

function urlDeHref(href: string): string | null {
    const h = href.replace(/&amp;/g, '&');
    const m = h.match(/[?&]uddg=([^&]+)/);
    if (m) {
        try {
            const u = decodeURIComponent(m[1]);
            return urlHttpValido(u) ? u : null;
        } catch {
            return null;
        }
    }
    return urlHttpValido(h) ? h : null;
}

// Parse do SERP HTML da DuckDuckGo → resultados (título, URL real descodificada
// do parâmetro uddg, snippet). Puro/testável.
export function parseDdgHtml(html: string): ResultadoWeb[] {
    const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
        limparHtml(m[1]),
    );
    const resultados: ResultadoWeb[] = [];
    const re = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(html))) {
        const url = urlDeHref(m[1]);
        if (!url) continue;
        resultados.push({ titulo: limparHtml(m[2]), url, snippet: snippets[i] ?? '' });
        i++;
    }
    return resultados;
}

async function procurarDdg(query: string, limite: number): Promise<ResultadoWeb[]> {
    let res: Response;
    try {
        res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: { 'user-agent': UA, accept: 'text/html' },
        });
    } catch (e) {
        throw new LimiteWebError(`pesquisa web falhou: ${e instanceof Error ? e.message : 'rede'}`);
    }
    if (res.status === 429 || res.status === 202 || res.status === 403) {
        throw new LimiteWebError(
            'a DuckDuckGo bloqueou a pesquisa (limite). Configura uma key Brave em Definições.',
        );
    }
    const r = parseDdgHtml(await res.text());
    if (!r.length) {
        throw new LimiteWebError(
            'sem resultados (possível bloqueio da DuckDuckGo). Configura uma key Brave em Definições.',
        );
    }
    return r.slice(0, limite);
}

const BRAVE_BASE = 'https://api.search.brave.com/res/v1/web/search';

async function procurarBrave(query: string, key: string, limite: number): Promise<ResultadoWeb[]> {
    const res = await fetch(`${BRAVE_BASE}?q=${encodeURIComponent(query)}&count=${limite}`, {
        headers: { 'x-subscription-token': key, accept: 'application/json' },
    });
    if (res.status === 429) throw new LimiteWebError('quota da Brave Search esgotada.');
    if (!res.ok) throw new LimiteWebError(`Brave Search HTTP ${res.status}`);
    const json = (await res.json()) as {
        web?: { results?: { title?: string; url?: string; description?: string }[] };
    };
    return (json.web?.results ?? [])
        .filter((r) => r.url && urlHttpValido(r.url))
        .slice(0, limite)
        .map((r) => ({
            titulo: limparHtml(r.title ?? ''),
            url: r.url as string,
            snippet: limparHtml(r.description ?? ''),
        }));
}

// Pesquisa web (#45): Brave se houver key (robusto), senão DuckDuckGo sem-key
// (flaky → LimiteWebError quando bloqueia, para a UI lembrar a key).
export async function procurarWeb(
    query: string,
    opts: { braveKey?: string; limite?: number } = {},
): Promise<ResultadoWeb[]> {
    const limite = opts.limite ?? 5;
    return opts.braveKey ? procurarBrave(query, opts.braveKey, limite) : procurarDdg(query, limite);
}

// Lê um URL e devolve o texto (HTML limpo, truncado). Sem key.
export async function lerUrl(url: string, maxChars = 4000): Promise<string> {
    if (!/^https?:\/\//.test(url)) throw new Error('URL inválido');
    if (REDE_INTERNA.test(url)) throw new Error('URL bloqueado (rede interna)');
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`ler URL HTTP ${res.status}`);
    const html = await res.text();
    const texto = limparHtml(
        html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '),
    ).replace(/\s+/g, ' ');
    return texto.slice(0, maxChars);
}
