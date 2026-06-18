'use server';

import {
    getNota,
    getNotaPorId,
    escreverNota,
    escreverNotaEmPasta,
    atualizarNotaPorId,
    listarKnowledge,
    moverNota,
    moverNotaPorId,
    renomearNota,
    renomearNotaPorId,
    arquivarNota,
    arquivarNotaPorId,
    reporNota,
    listarArquivados,
    atualizarPropriedadesNota,
} from '@/modules/knowledge/knowledge.service';
import {
    getDaily,
    substituirDaily,
    substituirDailyPorId,
    listarDailies,
    definirCorDaily,
} from '@/modules/daily/daily.service';
import {
    criarPasta,
    renomearPasta,
    moverPasta,
    arquivarPasta,
    definirCorPasta,
    listarPastas,
} from '@/modules/folders/folders.service';
import type { Pasta } from '@/modules/folders/folders.tree';
import type { NotaKnowledge, AtualizarPropriedades } from '@/modules/knowledge/knowledge.schema';
import type { PropriedadesNota } from '@/modules/knowledge/knowledge.props';
import {
    primeiroTituloMarkdown,
    substituirPrimeiroTituloMarkdown,
} from '@/modules/knowledge/knowledge.title';
import type { NotaLinkavel } from '@/modules/workspace/wikilink-autocomplete';
import { lerConteudoFicheiro, type ConteudoFicheiro } from '@/modules/workspace/workspace.files';

/** Cria uma pasta nova (na raiz ou dentro da pasta selecionada no explorer). */
export async function novaPasta(name: string, parentId: string | null = null): Promise<void> {
    await criarPasta(name, parentId);
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

/** Move uma pasta para outra pasta (parentId null = raiz). Drag-drop. */
export async function moverPastaParaPasta(id: string, parentId: string | null): Promise<void> {
    await moverPasta(id, parentId);
}

/** Arquiva recursivamente as notas de uma pasta e remove a pasta da árvore ativa. */
export async function arquivarPastaAction(id: string): Promise<void> {
    await arquivarPasta(id);
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
): Promise<{ novoSlug: string }> {
    if (id) return renomearNotaPorId(id, novoTitulo, slug);
    return renomearNota(slug, novoTitulo);
}

/** Renomeia uma nota alterando o primeiro H1 do markdown e guardando por id. */
export async function renomearNotaPorH1Action(
    slug: string,
    novoTitulo: string,
    id?: string,
): Promise<{ titulo: string; chave: string }> {
    const titulo = novoTitulo.trim();
    if (!titulo) throw new Error('título vazio');

    const nota = id ? await getNotaPorId(id) : await getNota(slug);
    if (!nota) throw new Error('nota não encontrada');

    const contentMd = substituirPrimeiroTituloMarkdown(nota.contentMd!, titulo);
    const res = await guardarFicheiro('knowledge', nota.slug, contentMd, nota.id);
    if (!res.ok) throw new Error(res.erro);
    return { titulo: res.titulo ?? titulo, chave: res.chave ?? nota.slug };
}

/**
 * Carrega o conteúdo de um ficheiro (knowledge ou daily) pelo tipo e chave.
 * Mantido como Server Action para compatibilidade; o FilePane usa /api/file para leitura.
 */
export async function lerFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
    id?: string,
): Promise<ConteudoFicheiro | null> {
    return lerConteudoFicheiro(tipo, chave, id);
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
): Promise<{ ok: true; titulo?: string; chave?: string } | { ok: false; erro: string }> {
    try {
        if (tipo === 'knowledge') {
            const tituloH1 = primeiroTituloMarkdown(contentMd);
            if (!tituloH1) {
                return {
                    ok: false,
                    erro: 'o primeiro título # define o nome do ficheiro',
                };
            }

            if (id) {
                const nota = await getNotaPorId(id);
                if (!nota) return { ok: false, erro: 'nota não encontrada' };
                const renamed =
                    tituloH1 === nota.title
                        ? { novoSlug: nota.slug }
                        : await renomearNotaPorId(id, tituloH1, nota.slug);
                await atualizarNotaPorId(id, contentMd, 'user');
                return { ok: true, titulo: tituloH1, chave: renamed.novoSlug };
            }
            const nota = await getNota(chave);
            if (!nota) return { ok: false, erro: 'nota não encontrada' };
            const renamed =
                tituloH1 === nota.title
                    ? { novoSlug: nota.slug }
                    : await renomearNota(nota.slug, tituloH1);
            await escreverNota(
                {
                    title: tituloH1,
                    content_md: contentMd,
                    links: [],
                    reason: 'edição pelo utilizador',
                },
                'user',
            );
            return { ok: true, titulo: tituloH1, chave: renamed.novoSlug };
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
// O título gerado tem de fugir TAMBÉM às arquivadas: o slug delas continua
// ocupado (índice único) e o guard do #28 recusa escrever por cima — sem isto,
// uma "Nova nota" arquivada bloqueava o botão de criar para sempre.
async function titulosUsados(folderId: string | null): Promise<Set<string>> {
    const [vivas, arquivadas] = await Promise.all([listarKnowledge(), listarArquivados()]);
    return new Set(
        [...vivas, ...arquivadas]
            .filter((n) => (n.folderId ?? null) === folderId)
            .map((n) => n.title),
    );
}

export async function criarNotaVazia(): Promise<{
    tipo: 'knowledge';
    id: string;
    chave: string;
    titulo: string;
}> {
    const usados = await titulosUsados(null);
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

    const usados = await titulosUsados(folderId);
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

// dadosBarraDireita/dadosGrafo migraram para rotas GET (#73): ver
// workspace.leituras.ts (`dadosDaBarraDireita`) e `/api/grafo` (grafoDados).

function humanizarSlug(slug: string): string {
    const t = slug.replace(/-/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Nova nota';
}

export interface NotaResolvidaWikilink {
    id: string;
    chave: string;
    titulo: string;
    pasta: string;
    caminho: string;
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
function caminhoDasPastas(pastas: Pasta[]): Map<string, string> {
    const porId = new Map(pastas.map((p) => [p.id, p]));
    const memo = new Map<string, string>();

    function path(id: string): string {
        const cached = memo.get(id);
        if (cached) return cached;
        const pasta = porId.get(id);
        if (!pasta) return 'Pasta';
        const prefixo = pasta.parentId ? `${path(pasta.parentId)}/` : '';
        const valor = `${prefixo}${pasta.name}`;
        memo.set(id, valor);
        return valor;
    }

    for (const p of pastas) path(p.id);
    return memo;
}

export async function abrirOuCriarNota(
    slug: string,
    caminho?: string | null,
): Promise<AbrirOuCriarNotaResultado> {
    const [notas, pastas] = await Promise.all([listarKnowledge(), listarPastas()]);
    const matches = notas.filter((n) => n.slug === slug);
    const pathPorPasta = caminhoDasPastas(pastas);

    function mapNota(n: NotaKnowledge): NotaResolvidaWikilink {
        const pasta = n.folderId ? (pathPorPasta.get(n.folderId) ?? 'Pasta') : 'Raiz';
        return {
            id: n.id,
            chave: n.slug,
            titulo: n.title,
            pasta,
            caminho: pasta === 'Raiz' ? n.title : `${pasta}/${n.title}`,
        };
    }

    if (caminho) {
        const alvo = caminho.trim().replace(/^\/+|\/+$/g, '');
        const matchPorCaminho = matches.map(mapNota).find((n) => n.caminho === alvo);
        if (matchPorCaminho) return { ...matchPorCaminho, estado: 'existente', criada: false };
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
        caminho: res.title,
        estado: 'criada',
        criada: true,
    };
}

// versoesFicheiro migrou para `GET /api/versoes` (#73): ver
// workspace.leituras.ts (`versoesDoFicheiro`).

/**
 * Notas linkáveis por [[ ]]: knowledge (já filtra arquivadas via listarKnowledge)
 * + dailies. Fonte única do autocomplete; tipos futuros entram aqui.
 */
export async function listarNotasLinkaveis(): Promise<NotaLinkavel[]> {
    const [notas, dailies, pastas] = await Promise.all([
        listarKnowledge(),
        listarDailies(),
        listarPastas(),
    ]);
    const pathPorPasta = caminhoDasPastas(pastas);
    const contagemPorTitulo = new Map<string, number>();
    for (const n of notas) {
        const chaveTitulo = n.title.toLocaleLowerCase('pt');
        contagemPorTitulo.set(chaveTitulo, (contagemPorTitulo.get(chaveTitulo) ?? 0) + 1);
    }

    return [
        ...notas.map((n) => {
            const pasta = n.folderId ? (pathPorPasta.get(n.folderId) ?? 'Pasta') : null;
            const caminho = pasta ? `${pasta}/${n.title}` : n.title;
            const duplicado = (contagemPorTitulo.get(n.title.toLocaleLowerCase('pt')) ?? 0) > 1;
            return {
                tipo: 'knowledge' as const,
                id: n.id,
                titulo: n.title,
                chave: n.slug,
                caminho,
                linkTarget: duplicado && pasta ? caminho : n.title,
            };
        }),
        ...dailies.map((d) => ({ tipo: 'daily' as const, id: d.id, titulo: d.dia, chave: d.dia })),
    ];
}

/**
 * Cria (ou reabre, se já existir o mesmo slug) uma nota knowledge com o título
 * dado. Usada pela opção "Criar «termo»" do autocomplete.
 */
export async function criarNotaComTitulo(
    titulo: string,
    folderId: string | null = null,
): Promise<{ id: string; chave: string; titulo: string }> {
    const input = {
        title: titulo,
        content_md: `# ${titulo}\n\n`,
        links: [],
        reason: 'nota criada pelo [[ autocomplete',
    };
    const res = folderId
        ? await escreverNotaEmPasta(input, folderId, 'user')
        : await escreverNota(input, 'user');
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

// listarArquivadosAction/listarPastasAction migraram para `GET /api/arquivados`
// e `GET /api/pastas` (#73) — chamam direto os serviços planos.

/** Define a cor (hex) de uma pasta. */
export async function definirCorPastaAction(folderId: string, cor: string | null): Promise<void> {
    await definirCorPasta(folderId, cor);
}

/** Define a cor (hex) do grupo daily. */
export async function definirCorDailyAction(cor: string | null): Promise<void> {
    await definirCorDaily(cor);
}

// corDailyAction migrou para `GET /api/cor-daily` (#73).

/** Atualiza propriedades de uma nota (tags/summary no frontmatter, visibility). */
export async function atualizarPropriedadesAction(
    id: string,
    input: AtualizarPropriedades,
): Promise<PropriedadesNota> {
    return atualizarPropriedadesNota(id, input);
}
