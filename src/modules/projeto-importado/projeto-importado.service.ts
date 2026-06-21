import type { SupabaseClient } from '@supabase/supabase-js';

import { escreverNotaEmPastaCom } from '@/modules/knowledge/knowledge.service';
import { resolverProjetoCom } from '@/modules/projetos/projetos.service';

// Import de um repo ligado para o vault: o projeto vira uma PASTA real (reusa a
// máquina de projetos = pasta) com uma NOTA DE RESUMO dentro — header com o path
// remoto e o local + o que o projeto faz. A nota é vectorizada como as outras
// (projector pós-escrita), logo entra no RAG e nos wikilinks.

/** "owner/nome" → "nome" (o título curto do projeto/pasta). */
export function nomeCurtoDoRepo(repo: string): string {
    return repo.split('/')[1] ?? repo;
}

/** Markdown da nota de resumo (puro — testável). Header = path remoto + local;
 *  corpo = o resumo do que o projeto faz (placeholder até alguém o preencher). */
export function construirNotaResumo(p: { repo: string; pathLocal?: string; resumo?: string }): {
    title: string;
    content_md: string;
    summary: string;
} {
    const title = nomeCurtoDoRepo(p.repo);
    const pathLocal = p.pathLocal?.trim() || '(por definir)';
    const corpo =
        p.resumo?.trim() ||
        'Resumo do projeto por preencher — o que faz, para servir nas conversas e nos wikilinks.';
    const content_md = [
        `# ${title}`,
        '',
        `- **Repositório:** \`${p.repo}\` — https://github.com/${p.repo}`,
        `- **Path local:** \`${pathLocal}\``,
        '',
        corpo,
    ].join('\n');
    const summary = p.resumo?.trim() || `Working copy local do repo ${p.repo}.`;
    return { title, content_md, summary };
}

/** Importa o projeto: garante a pasta (via projetos) e escreve a nota de resumo
 *  lá dentro (vectorizada). Idempotente — re-importar reaproveita a pasta e
 *  reescreve a nota (uma versão nova, sem duplicar). */
export async function importarProjetoCom(
    db: SupabaseClient,
    p: { repo: string; path?: string; resumo?: string },
): Promise<{ projetoId: string; folderId: string; notaId: string }> {
    const projeto = await resolverProjetoCom(db, nomeCurtoDoRepo(p.repo));
    if (!projeto.folderId) throw new Error('projeto importado ficou sem pasta');
    const { title, content_md, summary } = construirNotaResumo({
        repo: p.repo,
        pathLocal: p.path,
        resumo: p.resumo,
    });
    const nota = await escreverNotaEmPastaCom(
        db,
        { title, content_md, summary, links: [], reason: 'Importação de projeto GitHub' },
        projeto.folderId,
        'user',
    );
    return { projetoId: projeto.id, folderId: projeto.folderId, notaId: nota.id };
}
