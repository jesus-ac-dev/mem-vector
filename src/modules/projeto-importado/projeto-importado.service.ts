import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';

import { escreverNotaEmPastaCom } from '@/modules/knowledge/knowledge.service';
import { resolverProjetoCom } from '@/modules/projetos/projetos.service';
import { expandirHome } from '@/lib/paths';

// Import de um repo ligado para o vault: o projeto vira uma PASTA real (reusa a
// máquina de projetos = pasta) com uma NOTA DE RESUMO dentro — header com o path
// remoto e o local + a descrição (roubada do README do repo). A nota leva tags
// (#projeto + #<nome>) e é vectorizada como as outras → RAG + wikilinks.

/** "owner/nome" → "nome" (o título curto do projeto/pasta). */
export function nomeCurtoDoRepo(repo: string): string {
    return repo.split('/')[1] ?? repo;
}

const CAP_README = 6000;

/** Lê o README do working copy (best-effort; o path pode levar `~`). Trunca para
 *  não inchar a nota. null quando não há path ou README. */
export async function lerReadmeDoRepo(path?: string): Promise<string | null> {
    if (!path?.trim()) return null;
    const raiz = expandirHome(path);
    for (const nome of ['README.md', 'readme.md', 'Readme.md', 'README.MD']) {
        try {
            const txt = (await readFile(join(raiz, nome), 'utf8')).trim();
            if (txt) {
                return txt.length > CAP_README
                    ? `${txt.slice(0, CAP_README)}\n\n_(README truncado)_`
                    : txt;
            }
        } catch {
            // tenta o próximo nome
        }
    }
    return null;
}

/** Resumo de 1 linha: a 1ª linha "de conteúdo" do README (sem #, badges, links). */
function resumoDoReadme(readme: string, repo: string): string {
    const linha = readme
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith('#') && !l.startsWith('!') && !l.startsWith('['));
    const base = linha || `Working copy local do repo ${repo}.`;
    return base.length > 200 ? `${base.slice(0, 197)}…` : base;
}

/** Markdown da nota de resumo (puro — testável). Header = path remoto + local;
 *  corpo = o README do repo (ou placeholder); tags = #projeto + #<nome>. */
export function construirNotaResumo(p: { repo: string; pathLocal?: string; readme?: string }): {
    title: string;
    content_md: string;
    summary: string;
    tags: string[];
} {
    const title = nomeCurtoDoRepo(p.repo);
    const tags = ['projeto', title];
    const pathLocal = p.pathLocal?.trim() || '(por definir)';
    const corpo =
        p.readme?.trim() ||
        'Resumo do projeto por preencher — o que faz, para servir nas conversas e nos wikilinks.';
    const content_md = [
        `# ${title}`,
        '',
        `- **Repositório:** \`${p.repo}\` — https://github.com/${p.repo}`,
        `- **Path local:** \`${pathLocal}\``,
        '',
        corpo,
    ].join('\n');
    const summary = p.readme?.trim()
        ? resumoDoReadme(p.readme, p.repo)
        : `Working copy local do repo ${p.repo}.`;
    return { title, content_md, summary, tags };
}

/** Importa o projeto: garante a pasta (via projetos) e escreve a nota de resumo
 *  lá dentro (vectorizada), com o README como descrição. Idempotente — re-importar
 *  reaproveita a pasta e reescreve a nota (versão nova, sem duplicar). */
export async function importarProjetoCom(
    db: SupabaseClient,
    p: { repo: string; path?: string },
): Promise<{ projetoId: string; folderId: string; notaId: string }> {
    const projeto = await resolverProjetoCom(db, nomeCurtoDoRepo(p.repo));
    if (!projeto.folderId) throw new Error('projeto importado ficou sem pasta');
    const readme = (await lerReadmeDoRepo(p.path)) ?? undefined;
    const { title, content_md, summary, tags } = construirNotaResumo({
        repo: p.repo,
        pathLocal: p.path,
        readme,
    });
    const nota = await escreverNotaEmPastaCom(
        db,
        { title, content_md, summary, tags, links: [], reason: 'Importação de projeto GitHub' },
        projeto.folderId,
        'user',
    );
    return { projetoId: projeto.id, folderId: projeto.folderId, notaId: nota.id };
}
