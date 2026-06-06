'use server';

import {
    getNota,
    escreverNota,
    listarVersoes,
    listarKnowledge,
    backlinksDe,
    forwardLinksDe,
    grafoDados as lerGrafo,
    moverNota,
    renomearNota,
    arquivarNota,
    reporNota,
    listarArquivados,
    type LinkNota,
    type ForwardLink,
    type GrafoDados,
} from '@/modules/knowledge/knowledge.service';
import {
    getDaily,
    substituirDaily,
    listarVersoesDaily,
    listarDailies,
} from '@/modules/daily/daily.service';
import { criarPasta, renomearPasta } from '@/modules/folders/folders.service';
import { extrairOutline, type OutlineItem } from '@/lib/outline';
import type { Versao, NotaKnowledge } from '@/modules/knowledge/knowledge.schema';
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

export interface DadosBarraDireita {
    outline: OutlineItem[];
    backlinks: LinkNota[];
    forwardLinks: ForwardLink[];
}

/**
 * Dados da barra da direita para o ficheiro ativo: outline (headings) sempre, e
 * backlinks/forward links para knowledge (o daily não escreve edges).
 */
export async function dadosBarraDireita(
    tipo: 'knowledge' | 'daily',
    chave: string,
): Promise<DadosBarraDireita> {
    const vazio: DadosBarraDireita = { outline: [], backlinks: [], forwardLinks: [] };

    if (tipo === 'knowledge') {
        const nota = await getNota(chave);
        if (!nota) return vazio;
        const [backlinks, forwardLinks] = await Promise.all([
            backlinksDe(nota.slug),
            forwardLinksDe(nota.id),
        ]);
        return { outline: extrairOutline(nota.contentMd), backlinks, forwardLinks };
    }

    const daily = await getDaily(chave);
    if (!daily) return vazio;
    return { ...vazio, outline: extrairOutline(daily.contentMd) };
}

/** Dados do grafo do conhecimento (nós = notas, arestas = wikilinks). */
export async function dadosGrafo(): Promise<GrafoDados> {
    return lerGrafo();
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

/** Arquiva uma nota knowledge (sai do explorer e do RAG). */
export async function arquivarNotaAction(slug: string): Promise<void> {
    await arquivarNota(slug);
}

/** Repõe uma nota arquivada (volta ao explorer e ao RAG). */
export async function reporNotaAction(slug: string): Promise<void> {
    await reporNota(slug);
}

/** Lista as notas arquivadas (para a vista de arquivados do explorer). */
export async function listarArquivadosAction(): Promise<NotaKnowledge[]> {
    return listarArquivados();
}
