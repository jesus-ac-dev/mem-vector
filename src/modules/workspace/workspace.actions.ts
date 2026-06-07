'use server';

import {
    getNota,
    getNotaPorId,
    escreverNota,
    escreverNotaEmPasta,
    atualizarNotaPorId,
    listarVersoes,
    listarKnowledge,
    backlinksDe,
    forwardLinksDe,
    grafoDados as lerGrafo,
    moverNota,
    moverNotaPorId,
    renomearNota,
    renomearNotaPorId,
    arquivarNota,
    arquivarNotaPorId,
    reporNota,
    listarArquivados,
    type LinkNota,
    type ForwardLink,
    type GrafoDados,
} from '@/modules/knowledge/knowledge.service';
import {
    getDaily,
    getDailyPorId,
    substituirDaily,
    substituirDailyPorId,
    listarVersoesDaily,
    listarDailies,
    definirCorDaily,
    corDaily,
} from '@/modules/daily/daily.service';
import {
    criarPasta,
    renomearPasta,
    definirCorPasta,
    listarPastas,
} from '@/modules/folders/folders.service';
import type { Pasta } from '@/modules/folders/folders.tree';
import { extrairOutline, type OutlineItem } from '@/lib/outline';
import type { Versao, NotaKnowledge } from '@/modules/knowledge/knowledge.schema';
import type { NotaLinkavel } from '@/modules/workspace/wikilink-autocomplete';

/** Cria uma pasta nova na raiz (usada pelo botão "Nova pasta" do explorer). */
export async function novaPasta(name: string): Promise<void> {
    await criarPasta(name);
}

/** Move uma nota para uma pasta (folderId null = raiz). Drag-drop. */
export async function moverNotaParaPasta(
    slug: string,
    folderId: string | null,
    id?: string,
): Promise<void> {
    if (id) await moverNotaPorId(id, folderId);
    else await moverNota(slug, folderId);
}

/** Renomeia uma pasta. */
export async function renomearPastaAction(id: string, novoNome: string): Promise<void> {
    await renomearPasta(id, novoNome);
}

/** Renomeia uma nota (muda título+slug e reaponta os [[links]] das que a referenciam). */
export async function renomearNotaAction(
    slug: string,
    novoTitulo: string,
    id?: string,
): Promise<void> {
    if (id) await renomearNotaPorId(id, novoTitulo, slug);
    else await renomearNota(slug, novoTitulo);
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
    id?: string,
): Promise<ConteudoFicheiro | null> {
    if (tipo === 'knowledge') {
        const nota = id ? await getNotaPorId(id) : await getNota(chave);
        if (!nota) return null;
        return { titulo: nota.title, contentMd: nota.contentMd };
    }

    // tipo === 'daily'
    const daily = id ? await getDailyPorId(id) : await getDaily(chave);
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
    id?: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
    try {
        if (tipo === 'knowledge') {
            if (id) {
                await atualizarNotaPorId(id, contentMd, 'user');
                return { ok: true };
            }
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
        if (id) {
            await substituirDailyPorId(id, contentMd, 'user');
            return { ok: true };
        }
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
    id: string;
    chave: string;
    titulo: string;
}> {
    const existentes = await listarKnowledge();
    const usados = new Set(
        existentes.filter((n) => (n.folderId ?? null) === null).map((n) => n.title),
    );
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
    return { tipo: 'knowledge', id: res.id, chave: res.slug, titulo: res.title };
}

/**
 * Cria uma nota nova já dentro de uma pasta (folderId null = raiz). Reusa
 * criarNotaVazia + moverNota. Usada pelo "Nova nota" quando há pasta selecionada.
 */
export async function criarNotaNaPasta(folderId: string | null): Promise<{
    tipo: 'knowledge';
    id: string;
    chave: string;
    titulo: string;
}> {
    if (!folderId) return criarNotaVazia();

    const existentes = await listarKnowledge();
    const usados = new Set(
        existentes.filter((n) => (n.folderId ?? null) === folderId).map((n) => n.title),
    );
    let titulo = 'Nova nota';
    let n = 2;
    while (usados.has(titulo)) {
        titulo = `Nova nota ${n}`;
        n += 1;
    }
    const res = await escreverNotaEmPasta(
        {
            title: titulo,
            content_md: `# ${titulo}\n\n`,
            links: [],
            reason: 'nota criada pelo utilizador',
        },
        folderId,
        'user',
    );
    return { tipo: 'knowledge', id: res.id, chave: res.slug, titulo: res.title };
}

export interface DadosBarraDireita {
    outline: OutlineItem[];
    backlinks: LinkNota[];
    forwardLinks: ForwardLink[];
}

/**
 * Dados da barra da direita para o ficheiro ativo: outline (headings) sempre, e
 * backlinks/forward links para knowledge. Daily mostra só outline nesta sidebar.
 */
export async function dadosBarraDireita(
    tipo: 'knowledge' | 'daily',
    chave: string,
    id?: string,
): Promise<DadosBarraDireita> {
    const vazio: DadosBarraDireita = { outline: [], backlinks: [], forwardLinks: [] };

    if (tipo === 'knowledge') {
        const nota = id ? await getNotaPorId(id) : await getNota(chave);
        if (!nota) return vazio;
        const [backlinks, forwardLinks] = await Promise.all([
            backlinksDe(nota.slug),
            forwardLinksDe(nota.id),
        ]);
        return { outline: extrairOutline(nota.contentMd), backlinks, forwardLinks };
    }

    const daily = id ? await getDailyPorId(id) : await getDaily(chave);
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

export interface NotaResolvidaWikilink {
    id: string;
    chave: string;
    titulo: string;
    pasta: string;
}

export type AbrirOuCriarNotaResultado =
    | ({ estado: 'existente' | 'criada'; criada: boolean } & NotaResolvidaWikilink)
    | { estado: 'ambiguo'; slug: string; opcoes: NotaResolvidaWikilink[] };

/**
 * Resolve um wikilink de knowledge: se a nota existir, devolve-a; se não existir
 * (link quebrado), cria-a vazia a partir do slug e devolve-a. É o comportamento
 * Obsidian — clicar num link quebrado materializa a nota. Se houver vários
 * alvos com o mesmo slug em pastas diferentes, devolve escolha explícita.
 */
export async function abrirOuCriarNota(slug: string): Promise<AbrirOuCriarNotaResultado> {
    const [notas, pastas] = await Promise.all([listarKnowledge(), listarPastas()]);
    const matches = notas.filter((n) => n.slug === slug);
    const pastaPorId = new Map(pastas.map((p) => [p.id, p.name]));

    function mapNota(n: NotaKnowledge): NotaResolvidaWikilink {
        return {
            id: n.id,
            chave: n.slug,
            titulo: n.title,
            pasta: n.folderId ? (pastaPorId.get(n.folderId) ?? 'Pasta') : 'Raiz',
        };
    }

    if (matches.length === 1) {
        const existente = mapNota(matches[0]);
        return { ...existente, estado: 'existente', criada: false };
    }
    if (matches.length > 1) {
        return {
            estado: 'ambiguo',
            slug,
            opcoes: matches.map(mapNota).sort((a, b) => a.pasta.localeCompare(b.pasta, 'pt')),
        };
    }

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
    return {
        id: res.id,
        chave: res.slug,
        titulo: res.title,
        pasta: 'Raiz',
        estado: 'criada',
        criada: true,
    };
}

/**
 * Devolve as versões de um ficheiro (knowledge ou daily), da mais recente para a mais antiga.
 * Devolve [] se o ficheiro não existir ou não tiver versões.
 */
export async function versoesFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
    id?: string,
): Promise<Versao[]> {
    if (tipo === 'knowledge') {
        const nota = id ? await getNotaPorId(id) : await getNota(chave);
        if (!nota) return [];
        return listarVersoes(nota.id);
    }

    // tipo === 'daily'
    const daily = id ? await getDailyPorId(id) : await getDaily(chave);
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
        ...notas.map((n) => ({
            tipo: 'knowledge' as const,
            id: n.id,
            titulo: n.title,
            chave: n.slug,
        })),
        ...dailies.map((d) => ({ tipo: 'daily' as const, id: d.id, titulo: d.dia, chave: d.dia })),
    ];
}

/**
 * Cria (ou reabre, se já existir o mesmo slug) uma nota knowledge com o título
 * dado. Usada pela opção "Criar «termo»" do autocomplete.
 */
export async function criarNotaComTitulo(
    titulo: string,
): Promise<{ id: string; chave: string; titulo: string }> {
    const res = await escreverNota(
        {
            title: titulo,
            content_md: `# ${titulo}\n\n`,
            links: [],
            reason: 'nota criada pelo [[ autocomplete',
        },
        'user',
    );
    return { id: res.id, chave: res.slug, titulo: res.title };
}

/** Arquiva uma nota knowledge (sai do explorer e do RAG). */
export async function arquivarNotaAction(slug: string, id?: string): Promise<void> {
    if (id) await arquivarNotaPorId(id);
    else await arquivarNota(slug);
}

/** Repõe uma nota arquivada (volta ao explorer e ao RAG). */
export async function reporNotaAction(slug: string): Promise<void> {
    await reporNota(slug);
}

/** Lista as notas arquivadas (para a vista de arquivados do explorer). */
export async function listarArquivadosAction(): Promise<NotaKnowledge[]> {
    return listarArquivados();
}

/** Lista as pastas do utilizador (para o modal de cores do grafo). */
export async function listarPastasAction(): Promise<Pasta[]> {
    return listarPastas();
}

/** Define a cor (hex) de uma pasta. */
export async function definirCorPastaAction(folderId: string, cor: string | null): Promise<void> {
    await definirCorPasta(folderId, cor);
}

/** Define a cor (hex) do grupo daily. */
export async function definirCorDailyAction(cor: string | null): Promise<void> {
    await definirCorDaily(cor);
}

/** Cor atual do grupo daily (ou null). */
export async function corDailyAction(): Promise<string | null> {
    return corDaily();
}
