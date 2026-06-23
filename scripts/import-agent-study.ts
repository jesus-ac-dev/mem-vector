/**
 * Importa o estudo de agentes (~/src/agent-study) para a DB do mem-vector,
 * numa pasta "agents", pelo fluxo normal (escreverNotaEmPastaCom → indexer deriva chunks/edges).
 *
 * Cuidados (pedido do Carlos):
 *  - PATHS: as citações `clones/<owner__repo>/ficheiro:linha` ficam relativas ao repo;
 *    cada relatório ganha uma linha `git clone <url>` para se poderem seguir (os clones não existem na DB).
 *  - WIKILINKS: os `[[...]]` dos ficheiros são refs a memórias do VAULT (não vêm para a DB) → neutralizados
 *    para texto, senão viravam edges mortos (to_id=null). O INDEX vira hub real: a coluna Report passa a
 *    `[[Título]]` apontando às notas importadas (edges vivos, resolvem por slug do título).
 *
 * Uso:
 *   DRY=1 tsx scripts/import-agent-study.ts   # pré-visualiza, não escreve nada
 *   tsx scripts/import-agent-study.ts         # escreve na DB local (autoriza: write no projeto)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { listarPastasCom, criarPastaCom } from '../src/modules/folders/folders.service';
import { escreverNotaEmPastaCom } from '../src/modules/knowledge/knowledge.service';
import { esperarAuthHealth } from './auth-health';

process.loadEnvFile('.env.local');

const STUDY_DIR = process.env.AGENT_STUDY_DIR ?? join(process.env.HOME ?? '', 'src/agent-study');
const REPORTS_DIR = join(STUDY_DIR, 'reports');
const FOLDER_NAME = 'agents';
const DRY = process.env.DRY === '1';
const EMAIL = process.env.MEMVECTOR_IMPORT_EMAIL ?? 'dev@mem-vector.local';
const PASSWORD = process.env.MEMVECTOR_IMPORT_PASSWORD ?? 'dev-password-123';

const TITLE_OVERRIDE: Record<string, string> = {
    'INDEX.md': 'Estudo de agentes — índice',
    'SYNTHESIS.md': 'Estudo de agentes — síntese transversal',
};
const META: Record<string, { summary: string; tags: string[] }> = {
    'INDEX.md': {
        summary:
            'Índice dos 14 estudos de agentes open source: tipo, veredito e top-imports por agente.',
        tags: ['agente-estudo', 'ai-software', 'indice'],
    },
    'SYNTHESIS.md': {
        summary: 'Padrões transversais dos 14 agentes e o que importar primeiro para o mem-vector.',
        tags: ['agente-estudo', 'ai-software', 'sintese'],
    },
};

interface Nota {
    file: string;
    title: string;
    summary: string;
    tags: string[];
    content_md: string;
}

function splitFrontmatter(md: string): { fm: Record<string, string>; body: string } {
    if (!md.startsWith('---')) return { fm: {}, body: md };
    const end = md.indexOf('\n---', 3);
    if (end === -1) return { fm: {}, body: md };
    const block = md.slice(3, end).trim();
    const body = md.slice(end + 4).replace(/^\s*\n/, '');
    const fm: Record<string, string> = {};
    for (const line of block.split('\n')) {
        const i = line.indexOf(':');
        if (i === -1) continue;
        fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return { fm, body };
}

function h1(md: string): string {
    const m = md.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : 'sem título';
}

// clones/<owner__repo>/ficheiro → ficheiro (path relativo ao repo)
function stripClonesPrefix(md: string): string {
    return md.replace(/clones\/[\w.-]+__[\w.-]+\//g, '');
}

// [[a|b]] -> b ; [[a]] -> a  (neutraliza refs do vault; nenhuma aponta a notas importadas)
function stripWikilinks(md: string): string {
    return md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) =>
        (alias ?? target).trim(),
    );
}

// `reports/<file>.md`, `INDEX.md`, `SYNTHESIS.md` -> [[Título da nota importada]] (hub real)
function addHubLinks(md: string, fileToTitle: Map<string, string>): string {
    let out = md.replace(/`reports\/([\w.-]+\.md)`/g, (m, f: string) => {
        const t = fileToTitle.get(f);
        return t ? `[[${t}]]` : m;
    });
    for (const f of ['SYNTHESIS.md', 'INDEX.md']) {
        const t = fileToTitle.get(f);
        if (t) out = out.replace(new RegExp('`' + f.replace('.', '\\.') + '`', 'g'), `[[${t}]]`);
    }
    return out;
}

// linha `git clone <url>` logo a seguir ao H1, para seguir as citações ficheiro:linha
function addCloneNote(body: string, repo: string, commit: string): string {
    if (!repo) return body;
    const note = `\n> 📦 Para seguir as citações \`ficheiro:linha\`: \`git clone https://github.com/${repo}\`${commit ? ` (commit ${commit})` : ''}.\n`;
    const lines = body.split('\n');
    const idx = lines.findIndex((l) => /^#\s+/.test(l));
    if (idx === -1) return note + body;
    lines.splice(idx + 1, 0, note);
    return lines.join('\n');
}

function build(): { notas: Nota[]; stats: { clones: number; wikilinks: number; hub: number } } {
    const reportFiles = readdirSync(REPORTS_DIR)
        .filter((f) => f.endsWith('.md'))
        .sort();

    const fileToTitle = new Map<string, string>();
    for (const f of reportFiles) {
        const { body } = splitFrontmatter(readFileSync(join(REPORTS_DIR, f), 'utf8'));
        fileToTitle.set(f, h1(body));
    }
    fileToTitle.set('INDEX.md', TITLE_OVERRIDE['INDEX.md']);
    fileToTitle.set('SYNTHESIS.md', TITLE_OVERRIDE['SYNTHESIS.md']);

    const stats = { clones: 0, wikilinks: 0, hub: 0 };
    const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;

    const notas: Nota[] = [];

    // relatórios primeiro
    for (const f of reportFiles) {
        const raw = readFileSync(join(REPORTS_DIR, f), 'utf8');
        const { fm, body } = splitFrontmatter(raw);
        stats.clones += count(/clones\/[\w.-]+__[\w.-]+\//g, body);
        stats.wikilinks += count(/\[\[[^\]]+\]\]/g, body);
        const content = addCloneNote(
            stripWikilinks(stripClonesPrefix(body)),
            fm.repo ?? '',
            fm.commit ?? '',
        );
        notas.push({
            file: f,
            title: h1(body),
            summary: fm.summary ?? '',
            tags: ['agente-estudo', 'ai-software'],
            content_md: content,
        });
    }

    // SYNTHESIS depois, INDEX por último (hub)
    for (const f of ['SYNTHESIS.md', 'INDEX.md']) {
        const raw = readFileSync(join(STUDY_DIR, f), 'utf8');
        const { body } = splitFrontmatter(raw);
        stats.clones += count(/clones\/[\w.-]+__[\w.-]+\//g, body);
        stats.wikilinks += count(/\[\[[^\]]+\]\]/g, body);
        const stripped = stripWikilinks(stripClonesPrefix(body));
        const content = addHubLinks(stripped, fileToTitle);
        stats.hub += count(/\[\[[^\]]+\]\]/g, content);
        notas.push({
            file: f,
            title: TITLE_OVERRIDE[f],
            summary: META[f].summary,
            tags: META[f].tags,
            content_md: content,
        });
    }

    return { notas, stats };
}

async function userDb() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon)
        throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    await esperarAuthHealth(url);
    const db = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) throw new Error(`signIn import falhou: ${error.message}`);
    return db;
}

async function main(): Promise<void> {
    const { notas, stats } = build();

    if (DRY) {
        console.log(`[DRY] pasta destino: "${FOLDER_NAME}" (get-or-create na raiz)`);
        console.log(`[DRY] ${notas.length} notas a escrever (autor=agent):\n`);
        for (const n of notas) console.log(`  - ${n.title}   [${n.tags.join(', ')}]`);
        console.log(
            `\n[DRY] transformações: ${stats.clones} prefixos clones/ removidos · ${stats.wikilinks} wikilinks do vault neutralizados · ${stats.hub} links de hub vivos no INDEX/SYNTHESIS`,
        );
        const idx = notas.find((n) => n.file === 'INDEX.md');
        console.log(`\n[DRY] ===== INDEX transformado (hub com [[Título]]) =====\n`);
        console.log(idx?.content_md.split('\n').slice(0, 26).join('\n'));
        const hermes = notas.find((n) => n.file === 'NousResearch__hermes-agent.md');
        console.log(`\n[DRY] ===== topo do relatório hermes (clone-note + paths limpos) =====\n`);
        console.log(hermes?.content_md.split('\n').slice(0, 14).join('\n'));
        return;
    }

    const db = await userDb();
    const pastas = await listarPastasCom(db);
    let folder = pastas.find((p) => p.name === FOLDER_NAME && p.parentId === null);
    if (!folder) {
        folder = await criarPastaCom(db, FOLDER_NAME, null);
        console.log(`pasta "${FOLDER_NAME}" criada: ${folder.id}`);
    } else {
        console.log(`pasta "${FOLDER_NAME}" já existia: ${folder.id} (upsert por slug)`);
    }

    for (const n of notas) {
        const r = await escreverNotaEmPastaCom(
            db,
            {
                title: n.title,
                content_md: n.content_md,
                summary: n.summary,
                tags: n.tags,
                links: [],
                reason: 'Importação do estudo de agentes (~/src/agent-study)',
            },
            folder.id,
            'agent',
        );
        console.log(`✓ ${r.title} (${r.slug})`);
    }
    console.log(`\nFeito: ${notas.length} notas na pasta "${FOLDER_NAME}".`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
