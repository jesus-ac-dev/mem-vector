// #101: ingestão de vídeos do YouTube → conhecimento. O fetch do transcript é
// via yt-dlp (binário): o YouTube bloqueia o scraping direto do timedtext
// (200-vazio, anti-bot 2024+), provado por probe. O yt-dlp trata disso. Dívida
// declarada: em deploy (Vercel, IP datacenter) o yt-dlp pode ser bloqueado →
// proxy/API ao lançar. Local (o 1.º utilizador) funciona já.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const execFileP = promisify(execFile);

// O yt-dlp lança um Node para o EJS (extração do YouTube); o NODE_OPTIONS da app
// (tuning de memória / loader do tsx) herdado parte esse Node em silêncio → sem
// legendas. Apagar a chave (não pôr a '') é o que liberta o subprocesso.
function envLimpo(): NodeJS.ProcessEnv {
    const e = { ...process.env };
    delete e.NODE_OPTIONS;
    return e;
}

export interface SegmentoTranscript {
    text: string;
    offsetMs: number;
}

export interface VideoYoutube {
    videoId: string;
    title: string;
    author: string;
    url: string;
    transcript: string;
}

export class YoutubeError extends Error {}

const RE_ID = /^[\w-]{11}$/;

// Aceita watch?v=, youtu.be/, m.youtube, /shorts/. Devolve null se não for YouTube.
export function parseVideoId(url: string): string | null {
    let u: URL;
    try {
        u = new URL(url.trim());
    } catch {
        return null;
    }
    const host = u.hostname.replace(/^(www\.|m\.)/, '');
    const valido = (id: string) => (RE_ID.test(id) ? id : null);

    if (host === 'youtu.be') return valido(u.pathname.slice(1).split('/')[0] ?? '');
    if (host === 'youtube.com') {
        if (u.pathname === '/watch') return valido(u.searchParams.get('v') ?? '');
        if (u.pathname.startsWith('/shorts/'))
            return valido(u.pathname.slice('/shorts/'.length).split('/')[0] ?? '');
    }
    return null;
}

export function formatTimestamp(ms: number): string {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Remove anotações de não-fala das auto-legendas ([Music], [Applause],
// [Aplausos], [Laughter]…) — ruído que polui o conhecimento e o RAG. NÃO mexe nas
// âncoras de tempo [mm:ss] (essas são dígitos e são adicionadas DEPOIS, no join).
const RE_ANOTACAO =
    /\[(?:music|música|applause|aplausos|laughter|risos|cheering|cheers[^\]]*|inaudible|impercet[íi]vel|crosstalk|silence|sil[êe]ncio|background noise|ru[íi]do[^\]]*)\]/gi;
function semAnotacoes(t: string): string {
    return t.replace(RE_ANOTACAO, ' ');
}

// Texto corrido (sem timestamp por-segmento) com uma âncora [mm:ss] no início e a
// cada bucket de 30s — legível, mas ainda dá para saltar a um momento.
const BUCKET_MS = 30_000;
export function limparTranscript(segmentos: SegmentoTranscript[]): string {
    let out = '';
    let bucketAnterior = -1;
    for (const seg of segmentos) {
        const texto = semAnotacoes(seg.text).replace(/\s+/g, ' ').trim();
        if (!texto) continue;
        const bucket = Math.floor(seg.offsetMs / BUCKET_MS);
        if (bucket !== bucketAnterior) {
            if (out) out += '\n\n';
            out += `[${formatTimestamp(bucket * BUCKET_MS)}] `;
            bucketAnterior = bucket;
        } else if (!out.endsWith(' ')) {
            out += ' ';
        }
        out += texto;
    }
    return out.trim();
}

interface Json3Event {
    tStartMs?: number;
    segs?: { utf8?: string }[];
}

// O formato json3 do YouTube: events[] com tStartMs + segs[].utf8.
export function parseJson3(data: { events?: Json3Event[] }): SegmentoTranscript[] {
    return (data.events ?? [])
        .filter((e) => Array.isArray(e.segs))
        .map((e) => ({
            text: (e.segs ?? []).map((s) => s.utf8 ?? '').join(''),
            offsetMs: e.tStartMs ?? 0,
        }))
        .filter((s) => s.text.trim());
}

const YTDLP_BIN = process.env.YTDLP_BIN || join(homedir(), '.local', 'bin', 'yt-dlp');
// Preferência: a legenda ORIGINAL da fonte (`-orig`, melhor que uma
// auto-tradução), depois manual/EN. Para um vídeo inglês escolhe en-orig; para
// um PT escolhe pt-orig; senão cai no inglês.
const SUB_LANGS = 'en-orig,pt-orig,en,pt';
const ORDEM_FICHEIRO = ['en-orig', 'pt-orig', 'en', 'pt'];

// Busca metadados (título/autor) + transcript via yt-dlp. Lança YoutubeError com
// mensagem amigável (URL inválido, sem legendas, indisponível).
export async function buscarVideo(url: string): Promise<VideoYoutube> {
    const videoId = parseVideoId(url);
    if (!videoId) throw new YoutubeError('Não reconheci um link de vídeo do YouTube.');

    const watch = `https://www.youtube.com/watch?v=${videoId}`;
    const dir = await mkdtemp(join(tmpdir(), 'memvector-yt-'));
    try {
        let stdout: string;
        let stderr = '';
        try {
            ({ stdout, stderr } = await execFileP(
                YTDLP_BIN,
                [
                    '--no-playlist',
                    '--skip-download',
                    // `--print` ativa simulação no yt-dlp; sem isto obtemos
                    // título/autor mas nenhum ficheiro de legenda.
                    '--no-simulate',
                    // O yt-dlp exige um runtime JS para extrair o YouTube (EJS,
                    // anti-bot). Reusamos o Node que já corre a app — sem deno.
                    '--js-runtimes',
                    `node:${process.execPath}`,
                    // Uma língua que falhe (429, indisponível) não aborta as
                    // outras — fica-se com a que vier.
                    '--ignore-errors',
                    '--retries',
                    '3',
                    // Pedimos manuais + auto: vídeos grandes/curados tendem a
                    // ter legendas manuais; vídeos pequenos dependem das auto.
                    '--write-subs',
                    '--write-auto-subs',
                    '--sub-format',
                    'json3',
                    '--sub-langs',
                    SUB_LANGS,
                    '--print',
                    'TITLE:%(title)s',
                    '--print',
                    'AUTHOR:%(uploader)s',
                    '-o',
                    join(dir, '%(id)s'),
                    watch,
                ],
                { timeout: 90_000, maxBuffer: 16 * 1024 * 1024, env: envLimpo() },
            ));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/ENOENT/.test(msg)) {
                throw new YoutubeError('O yt-dlp não está instalado (YTDLP_BIN).');
            }
            if (/private|unavailable|not available|sign in|age/i.test(msg)) {
                throw new YoutubeError('Vídeo privado, indisponível ou com restrição.');
            }
            throw new YoutubeError('Não consegui buscar o vídeo (yt-dlp falhou).');
        }

        const title = /^TITLE:(.*)$/m.exec(stdout)?.[1]?.trim() || videoId;
        const author = /^AUTHOR:(.*)$/m.exec(stdout)?.[1]?.trim() || 'YouTube';

        const ficheiros = await readdir(dir);
        const escolhido =
            ORDEM_FICHEIRO.map((l) => `${videoId}.${l}.json3`).find((f) => ficheiros.includes(f)) ??
            ficheiros.find((f) => f.endsWith('.json3'));
        if (!escolhido) {
            if (/429|too many requests/i.test(stderr)) {
                throw new YoutubeError(
                    'O YouTube limitou os pedidos (429). Tenta daqui a uns minutos.',
                );
            }
            throw new YoutubeError('Este vídeo não tem transcrição/legendas disponíveis.');
        }

        const data = JSON.parse(await readFile(join(dir, escolhido), 'utf8')) as {
            events?: Json3Event[];
        };
        const segmentos = parseJson3(data);
        if (!segmentos.length) throw new YoutubeError('A transcrição veio vazia.');

        return { videoId, title, author, url: watch, transcript: limparTranscript(segmentos) };
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}
