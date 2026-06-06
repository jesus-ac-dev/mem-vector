'use server';

import {
    getNota,
    escreverNota,
    listarVersoes,
    listarKnowledge,
} from '@/modules/knowledge/knowledge.service';
import {
    getDaily,
    substituirDaily,
    listarVersoesDaily,
    listarDailies,
} from '@/modules/daily/daily.service';
import { moverNota, renomearNota } from '@/modules/knowledge/knowledge.service';
import { criarPasta, renomearPasta } from '@/modules/folders/folders.service';
import type { Versao } from '@/modules/knowledge/knowledge.schema';
import type { NotaLinkavel } from '@/modules/workspace/wikilink-autocomplete';

/** Cria uma pasta nova na raiz (usada pelo botão "Nova pasta" do explorer). */
export async function novaPasta(name: string): Promise<void> {
    await criarPasta(name);
}

/** Move uma nota (por slug) para uma pasta (folderId null = raiz). Drag-drop. */
export async function moverNotaParaPasta(slug: string, folderId: string | null): Promise<void> {
    await moverNota(slug, folderId);
}

/** Renomeia uma pasta. */
export async function renomearPastaAction(id: string, novoNome: string): Promise<void> {
    await renomearPasta(id, novoNome);
}

/** Renomeia uma nota (muda título+slug e reaponta os [[links]] das que a referenciam). */
export async function renomearNotaAction(slug: string, novoTitulo: string): Promise<void> {
    await renomearNota(slug, novoTitulo);
}

export interface ConteudoFicheiro {
    titulo: string;
    contentMd: string;
}

/**
 * Carrega o conteúdo de um ficheiro (knowledge ou daily) pelo tipo e chave.
 * Usado pelo FilePane via useEffect.
 */
export async function lerFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
): Promise<ConteudoFicheiro | null> {
    if (tipo === 'knowledge') {
        const nota = await getNota(chave);
        if (!nota) return null;
        return { titulo: nota.title, contentMd: nota.contentMd };
    }

    // tipo === 'daily'
    const daily = await getDaily(chave);
    if (!daily) return null;
    return { titulo: daily.dia, contentMd: daily.contentMd };
}

/**
 * Guarda o conteúdo editado de um ficheiro (knowledge ou daily) com author='user'.
 * Cria uma nova versão imutável e regenera os chunks de embedding.
 */
export async function guardarFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
    contentMd: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
    try {
        if (tipo === 'knowledge') {
            const nota = await getNota(chave);
            if (!nota) return { ok: false, erro: 'nota não encontrada' };
            await escreverNota(
                {
                    title: nota.title,
                    content_md: contentMd,
                    links: [],
                    reason: 'edição pelo utilizador',
                },
                'user',
            );
            return { ok: true };
        }

        // tipo === 'daily'
        const daily = await getDaily(chave);
        if (!daily) return { ok: false, erro: 'daily não encontrado' };
        await substituirDaily(chave, contentMd, 'user');
        return { ok: true };
    } catch (e) {
        return { ok: false, erro: e instanceof Error ? e.message : 'erro ao guardar' };
    }
}

/**
 * Cria uma nota knowledge nova e vazia com um título único ("Nova nota", "Nova nota 2"…)
 * e devolve a chave para a abrir numa tab. Usada pela ação "Criar Nota" da Home.
 */
export async function criarNotaVazia(): Promise<{
    tipo: 'knowledge';
    chave: string;
    titulo: string;
}> {
    const existentes = await listarKnowledge();
    const usados = new Set(existentes.map((n) => n.title));
    let titulo = 'Nova nota';
    let n = 2;
    while (usados.has(titulo)) {
        titulo = `Nova nota ${n}`;
        n += 1;
    }
    const res = await escreverNota(
        {
            title: titulo,
            content_md: `# ${titulo}\n\n`,
            links: [],
            reason: 'nota criada pelo utilizador',
        },
        'user',
    );
    return { tipo: 'knowledge', chave: res.slug, titulo: res.title };
}

function humanizarSlug(slug: string): string {
    const t = slug.replace(/-/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Nova nota';
}

/**
 * Resolve um wikilink de knowledge: se a nota existir, devolve-a; se não existir
 * (link quebrado), cria-a vazia a partir do slug e devolve-a. É o comportamento
 * Obsidian — clicar num link quebrado materializa a nota.
 */
export async function abrirOuCriarNota(
    slug: string,
): Promise<{ chave: string; titulo: string; criada: boolean }> {
    const existente = await getNota(slug);
    if (existente) return { chave: existente.slug, titulo: existente.title, criada: false };

    const titulo = humanizarSlug(slug);
    const res = await escreverNota(
        {
            title: titulo,
            content_md: `# ${titulo}\n\n`,
            links: [],
            reason: 'nota criada a partir de um wikilink',
        },
        'user',
    );
    return { chave: res.slug, titulo: res.title, criada: true };
}

/**
 * Devolve as versões de um ficheiro (knowledge ou daily), da mais recente para a mais antiga.
 * Devolve [] se o ficheiro não existir ou não tiver versões.
 */
export async function versoesFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
): Promise<Versao[]> {
    if (tipo === 'knowledge') {
        const nota = await getNota(chave);
        if (!nota) return [];
        return listarVersoes(nota.id);
    }

    // tipo === 'daily'
    const daily = await getDaily(chave);
    if (!daily) return [];
    return listarVersoesDaily(daily.id);
}

/**
 * Notas linkáveis por [[ ]]: knowledge (já filtra arquivadas via listarKnowledge)
 * + dailies. Fonte única do autocomplete; tipos futuros entram aqui.
 */
export async function listarNotasLinkaveis(): Promise<NotaLinkavel[]> {
    const [notas, dailies] = await Promise.all([listarKnowledge(), listarDailies()]);
    return [
        ...notas.map((n) => ({ tipo: 'knowledge' as const, titulo: n.title, chave: n.slug })),
        ...dailies.map((d) => ({ tipo: 'daily' as const, titulo: d.dia, chave: d.dia })),
    ];
}

/**
 * Cria (ou reabre, se já existir o mesmo slug) uma nota knowledge com o título
 * dado. Usada pela opção "Criar «termo»" do autocomplete.
 */
export async function criarNotaComTitulo(
    titulo: string,
): Promise<{ chave: string; titulo: string }> {
    const res = await escreverNota(
        {
            title: titulo,
            content_md: `# ${titulo}\n\n`,
            links: [],
            reason: 'nota criada pelo [[ autocomplete',
        },
        'user',
    );
    return { chave: res.slug, titulo: res.title };
}
