'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { WorkspaceProvider, useWorkspace } from '@/components/layout/workspace-context';
import {
    ListTodo,
    MessageSquare,
    Users,
    FolderTree,
    MessagesSquare,
    PanelLeftClose,
    PanelLeftOpen,
    PanelRightClose,
    PanelRightOpen,
    List,
    CornerDownLeft,
    CornerUpRight,
    Share2,
    SquareKanban,
    Tag,
    FilePlus,
    FolderPlus,
    Loader2,
    Archive,
    Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { dataPt } from '@/lib/datas';
import { runClientAction } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    DRAG_NOTA_ID,
    DRAG_NOTA_SLUG,
    DRAG_PASTA_ID,
    FileExplorer,
} from '@/components/layout/file-explorer';
import type { DailyItem } from '@/components/layout/file-explorer';
import { ArquivadosLista } from '@/components/layout/arquivados-lista';
import { ConversasPanel } from '@/components/layout/conversas-panel';
import { TarefasPanel } from '@/components/layout/tarefas-panel';
import { WorkspaceGraph } from '@/components/layout/workspace-graph';
import { ClientErrorListener } from '@/components/layout/client-error-listener';
import {
    criarNotaNaPasta,
    novaPasta,
    abrirOuCriarNota,
    arquivarNotaAction,
    arquivarPastaAction,
    type NotaResolvidaWikilink,
} from '@/modules/workspace/workspace.actions';
import { getJson } from '@/lib/api-get';
import { type DadosBarraDireita } from '@/modules/workspace/workspace.leituras';
import { tabKey } from '@/components/layout/workspace-context';
import {
    tagsComNotasDaArvore,
    type Arvore,
    type NoArvore,
    type NotaItem,
} from '@/modules/folders/folders.tree';
import type { NotaKnowledge } from '@/modules/knowledge/knowledge.schema';

// ──────────────────────────────────────────────
// Ribbon — icons that commute the left panel
// ──────────────────────────────────────────────
type LeftPanel = 'explorer' | 'chats' | 'tarefas';

// Em cima só Explorador e Conversas (#53); o botão Tarefas (também comuta o
// painel) vive na secção de baixo, junto das rotas.
const panelItems: { id: LeftPanel; label: string; Icon: React.ElementType }[] = [
    { id: 'explorer', label: 'Explorador', Icon: FolderTree },
    { id: 'chats', label: 'Conversas', Icon: MessagesSquare },
];

// Route nav items (Knowledge e Daily vivem no file-explorer, não no ribbon).
// Ordem por importância de uso (#55): chat → kanban → tarefas → grupos.
const navItems = [
    { href: '/chat', label: 'Chat', Icon: MessageSquare },
    { href: '/kanban', label: 'Kanban', Icon: SquareKanban },
    { href: '/grupos', label: 'Grupos', Icon: Users },
];

function ordenarNotas(notas: NotaItem[]): NotaItem[] {
    return [...notas].sort((a, b) => a.title.localeCompare(b.title, 'pt'));
}

function inserirNotaNaArvore(arvore: Arvore, nota: NotaItem): Arvore {
    const inserirNo = (no: NoArvore): NoArvore => {
        if (no.pasta.id === nota.folderId) {
            return {
                ...no,
                notas: ordenarNotas([...no.notas.filter((n) => n.id !== nota.id), nota]),
            };
        }
        return { ...no, subpastas: no.subpastas.map(inserirNo) };
    };

    if (!nota.folderId) {
        return {
            ...arvore,
            raizNotas: ordenarNotas([...arvore.raizNotas.filter((n) => n.id !== nota.id), nota]),
        };
    }

    return { ...arvore, raizPastas: arvore.raizPastas.map(inserirNo) };
}

function removerPastaDaArvore(arvore: Arvore, pastaId: string): Arvore {
    function remover(nos: NoArvore[]): NoArvore[] {
        const restantes: NoArvore[] = [];
        for (const no of nos) {
            if (no.pasta.id === pastaId) continue;
            restantes.push({ ...no, subpastas: remover(no.subpastas) });
        }
        return restantes;
    }

    return {
        ...arvore,
        raizPastas: remover(arvore.raizPastas),
    };
}

function Ribbon({
    activePanel,
    onPanelChange,
    leftCollapsed,
    onOpenLeft,
}: {
    activePanel: LeftPanel;
    onPanelChange: (p: LeftPanel) => void;
    leftCollapsed: boolean;
    onOpenLeft: () => void;
}) {
    const pathname = usePathname();
    const { abrirChat, chatAberto } = useWorkspace();

    return (
        <nav
            className="flex w-14 shrink-0 flex-col items-center gap-1 border-r py-3"
            aria-label="Ribbon"
        >
            {/* Panel-commute icons */}
            {panelItems.map(({ id, label, Icon }) => (
                <Button
                    key={id}
                    variant="ghost"
                    size="icon"
                    aria-label={label}
                    title={label}
                    onClick={() => onPanelChange(id)}
                    className={cn(
                        'h-10 w-10 text-muted-foreground',
                        activePanel === id && 'bg-accent text-accent-foreground',
                    )}
                >
                    <Icon className="h-5 w-5" />
                </Button>
            ))}

            {/* Divider */}
            <div className="my-1 w-8 border-t" />

            {/* Secção de baixo por importância de uso (#55): chat → kanban
                (quase a chegar) → tarefas → emails (há de vir) → grupos. */}
            {navItems.map(({ href, label, Icon }) => {
                // Chat só acende na própria página (#58: no kanban o chat vive
                // no rodapé — o ícone não deve parecer selecionado).
                const active =
                    href === '/chat'
                        ? chatAberto && pathname.startsWith('/chat')
                        : pathname.startsWith(href);
                const link = (
                    <Link
                        key={href}
                        href={href}
                        aria-label={label}
                        title={label}
                        // O ícone Chat reabre o painel do chat (caso esteja fechado).
                        onClick={href === '/chat' ? () => abrirChat() : undefined}
                        className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                            active && 'bg-accent text-accent-foreground',
                        )}
                    >
                        <Icon className="h-5 w-5" />
                    </Link>
                );
                if (href !== '/grupos') return link;
                // Tarefas (comuta o painel esquerdo) entra antes de Grupos.
                return (
                    <Fragment key={href}>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Tarefas"
                            title="Tarefas"
                            onClick={() => onPanelChange('tarefas')}
                            className={cn(
                                'h-10 w-10 text-muted-foreground',
                                activePanel === 'tarefas' && 'bg-accent text-accent-foreground',
                            )}
                        >
                            <ListTodo className="h-5 w-5" />
                        </Button>
                        {link}
                    </Fragment>
                );
            })}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Re-open left sidebar button (only visible when collapsed) */}
            {leftCollapsed && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onOpenLeft}
                    title="Abrir explorador"
                    aria-label="Abrir explorador"
                    className="h-10 w-10 text-muted-foreground"
                >
                    <PanelLeftOpen className="h-5 w-5" />
                </Button>
            )}
        </nav>
    );
}

// ──────────────────────────────────────────────
// Left sidebar
// ──────────────────────────────────────────────
function LeftSidebar({
    arvore,
    dailies,
    projetos,
    activePanel,
    collapsed,
    onToggle,
}: {
    arvore: Arvore;
    dailies: DailyItem[];
    projetos: ProjetoItem[];
    activePanel: LeftPanel;
    collapsed: boolean;
    onToggle: () => void;
}) {
    const router = useRouter();
    const { abrirConversa, abrirFicheiro, notificarWorkspaceMudou } = useWorkspace();
    const [arvoreState, setArvoreState] = useState<{ source: Arvore; atual: Arvore }>({
        source: arvore,
        atual: arvore,
    });
    const arvoreAtual = arvoreState.source === arvore ? arvoreState.atual : arvore;
    const [verArquivados, setVerArquivados] = useState(false);
    const [arquivados, setArquivados] = useState<NotaKnowledge[]>([]);
    const [archiveOver, setArchiveOver] = useState(false);
    const [pastaSelecionada, setPastaSelecionada] = useState<string | null>(null);
    const [knowledgeOpen, setKnowledgeOpen] = useState(true);
    const [forceOpenFolderIds, setForceOpenFolderIds] = useState<string[]>([]);
    const [criandoPasta, setCriandoPasta] = useState(false);
    // Anti-duplo-clique: a criação da nota tem latência de servidor e sem
    // feedback nasciam ficheiros a dobrar (relato do Carlos, #47).
    const [criandoNota, setCriandoNota] = useState(false);
    // Painel de tarefas (#21): o "+" do header abre o input de criação.
    const [criarTarefaAberto, setCriarTarefaAberto] = useState(false);

    function atualizarArvoreLocal(updater: (atual: Arvore) => Arvore) {
        setArvoreState((state) => {
            const atual = state.source === arvore ? state.atual : arvore;
            return { source: arvore, atual: updater(atual) };
        });
    }

    useEffect(() => {
        if (!verArquivados) return;
        let cancelado = false;
        void runClientAction({ area: 'left-sidebar', action: 'listarArquivados' }, () =>
            getJson<NotaKnowledge[]>('/api/arquivados'),
        ).then((notas) => {
            if (!cancelado && notas) setArquivados(notas);
        });
        return () => {
            cancelado = true;
        };
    }, [verArquivados]);

    async function carregarArquivados() {
        const notas = await runClientAction(
            { area: 'left-sidebar', action: 'carregarArquivados' },
            () => getJson<NotaKnowledge[]>('/api/arquivados'),
        );
        if (notas) setArquivados(notas);
    }

    function toggleArquivados() {
        setVerArquivados((v) => !v);
    }

    async function handleNovaNota() {
        if (criandoNota) return;
        setCriandoNota(true);
        try {
            if (pastaSelecionada === null) {
                setKnowledgeOpen(true);
            } else {
                setForceOpenFolderIds((ids) =>
                    ids.includes(pastaSelecionada) ? ids : [...ids, pastaSelecionada],
                );
            }
            const nota = await criarNotaNaPasta(pastaSelecionada);
            atualizarArvoreLocal((atual) =>
                inserirNotaNaArvore(atual, {
                    id: nota.id,
                    slug: nota.chave,
                    title: nota.titulo,
                    folderId: pastaSelecionada,
                }),
            );
            abrirFicheiro({
                tipo: nota.tipo,
                id: nota.id,
                chave: nota.chave,
                titulo: nota.titulo,
                vistaInicial: 'editor',
            });
            notificarWorkspaceMudou();
            router.push('/chat');
        } finally {
            setCriandoNota(false);
        }
    }

    function handleNovaPasta() {
        if (pastaSelecionada === null) setKnowledgeOpen(true);
        setCriandoPasta(true); // mostra o input inline no topo da árvore
    }

    async function handleDropArquivo(e: React.DragEvent<HTMLButtonElement>) {
        e.preventDefault();
        setArchiveOver(false);

        const pastaId = e.dataTransfer.getData(DRAG_PASTA_ID);
        if (pastaId) {
            await arquivarPastaAction(pastaId);
            setPastaSelecionada(null);
            setKnowledgeOpen(true);
            setForceOpenFolderIds((ids) => ids.filter((id) => id !== pastaId));
            atualizarArvoreLocal((atual) => removerPastaDaArvore(atual, pastaId));
            notificarWorkspaceMudou();
            if (verArquivados) await carregarArquivados();
            return;
        }

        const slug = e.dataTransfer.getData(DRAG_NOTA_SLUG);
        if (!slug) return;
        const id = e.dataTransfer.getData(DRAG_NOTA_ID) || undefined;
        await arquivarNotaAction(slug, id);
        notificarWorkspaceMudou();
        router.refresh();
        if (verArquivados) await carregarArquivados();
    }

    async function confirmarCriarPasta(nome: string) {
        setCriandoPasta(false);
        await novaPasta(nome, pastaSelecionada);
        router.refresh(); // mostra a pasta nova no explorer (server)
    }

    if (collapsed) {
        return null;
    }

    return (
        <aside className="flex w-60 shrink-0 flex-col overflow-hidden border-r">
            {/* Header — action icons (por painel) + collapse button */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b px-2">
                <div className="flex items-center gap-0.5">
                    {activePanel === 'explorer' ? (
                        <>
                            {!verArquivados && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title="Nova pasta"
                                        aria-label="Nova pasta"
                                        onClick={handleNovaPasta}
                                        className="h-6 w-6 text-muted-foreground"
                                    >
                                        <FolderPlus className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        title={criandoNota ? 'A criar…' : 'Nova nota'}
                                        aria-label="Nova nota"
                                        disabled={criandoNota}
                                        onClick={() =>
                                            void runClientAction(
                                                {
                                                    area: 'left-sidebar',
                                                    action: 'novaNota',
                                                    meta: { pastaSelecionada },
                                                },
                                                handleNovaNota,
                                            )
                                        }
                                        className="h-6 w-6 text-muted-foreground"
                                    >
                                        {criandoNota ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <FilePlus className="h-3.5 w-3.5" />
                                        )}
                                    </Button>
                                </>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                title={
                                    verArquivados
                                        ? 'Ver notas'
                                        : 'Ver arquivados · arrasta nota ou pasta para arquivar'
                                }
                                aria-label="Ver arquivados"
                                aria-pressed={verArquivados}
                                onClick={toggleArquivados}
                                onDragOver={(e) => {
                                    if (
                                        e.dataTransfer.types.includes(DRAG_NOTA_SLUG) ||
                                        e.dataTransfer.types.includes(DRAG_PASTA_ID)
                                    ) {
                                        e.preventDefault();
                                        setArchiveOver(true);
                                    }
                                }}
                                onDragLeave={() => setArchiveOver(false)}
                                onDrop={(e) =>
                                    void runClientAction(
                                        { area: 'left-sidebar', action: 'dropArquivo' },
                                        () => handleDropArquivo(e),
                                    )
                                }
                                className={cn(
                                    'h-6 w-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                                    (verArquivados || archiveOver) &&
                                        'bg-destructive/10 text-destructive',
                                    archiveOver && 'ring-1 ring-destructive/50',
                                )}
                            >
                                <Archive className="h-3.5 w-3.5" />
                            </Button>
                        </>
                    ) : activePanel === 'tarefas' ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            title="Nova tarefa"
                            aria-label="Nova tarefa"
                            onClick={() => setCriarTarefaAberto(true)}
                            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Tarefa
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            title="Nova conversa"
                            aria-label="Nova conversa"
                            onClick={() => {
                                abrirConversa(null);
                                router.push('/chat');
                            }}
                            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Nova conversa
                        </Button>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    title="Colapsar sidebar"
                    aria-label="Colapsar sidebar"
                    className="h-6 w-6 text-muted-foreground"
                >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Main panel content */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {activePanel === 'explorer' ? (
                    verArquivados ? (
                        <ArquivadosLista arquivados={arquivados} onMudou={carregarArquivados} />
                    ) : (
                        <FileExplorer
                            arvore={arvoreAtual}
                            dailies={dailies}
                            projetos={projetos}
                            pastaSelecionada={pastaSelecionada}
                            onSelecionarPasta={setPastaSelecionada}
                            knowledgeOpen={knowledgeOpen}
                            onKnowledgeOpenChange={setKnowledgeOpen}
                            forceOpenFolderIds={forceOpenFolderIds}
                            onFolderManualToggle={(id) =>
                                setForceOpenFolderIds((ids) =>
                                    ids.filter((openId) => openId !== id),
                                )
                            }
                            criandoPasta={criandoPasta}
                            onCriarPasta={(nome) =>
                                void runClientAction(
                                    {
                                        area: 'left-sidebar',
                                        action: 'novaPasta',
                                        meta: { nome, pastaSelecionada },
                                    },
                                    () => confirmarCriarPasta(nome),
                                )
                            }
                            onCancelarCriarPasta={() => setCriandoPasta(false)}
                        />
                    )
                ) : activePanel === 'tarefas' ? (
                    <TarefasPanel
                        criarAberto={criarTarefaAberto}
                        onFecharCriar={() => setCriarTarefaAberto(false)}
                    />
                ) : (
                    <ConversasPanel />
                )}
            </div>

            {/* Footer — Grafo do conhecimento */}
            <div className="h-80 shrink-0 border-t">
                <WorkspaceGraph />
            </div>
        </aside>
    );
}

// ──────────────────────────────────────────────
// Daily calendar (compact, highlights days with a daily note)
// ──────────────────────────────────────────────
function DailyCalendar({
    diasComDaily,
    onDayClick,
}: {
    diasComDaily: string[];
    onDayClick: (day: Date) => void;
}) {
    // Parse 'YYYY-MM-DD' strings to local Date objects (avoid UTC drift from new Date(str))
    const highlightedDates = diasComDaily.map((s) => {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d);
    });

    return (
        <Calendar
            mode="single"
            modifiers={{ comDaily: highlightedDates }}
            onDayClick={onDayClick}
            className="p-2 text-xs [--cell-size:1.75rem]"
            classNames={{
                caption_label: 'text-xs font-medium',
                weekday:
                    'text-muted-foreground flex-1 select-none text-center text-[0.7rem] font-normal',
            }}
        />
    );
}

// ──────────────────────────────────────────────
// Right sidebar
// ──────────────────────────────────────────────
type RightTab = 'outline' | 'backlinks' | 'forward' | 'tags' | 'partilhas';

const rightTabs: { id: RightTab; label: string; Icon: React.ElementType }[] = [
    { id: 'outline', label: 'Outline', Icon: List },
    { id: 'backlinks', label: 'Backlinks', Icon: CornerDownLeft },
    { id: 'forward', label: 'Forward links', Icon: CornerUpRight },
    { id: 'tags', label: 'Tags', Icon: Tag },
    { id: 'partilhas', label: 'Partilhas', Icon: Share2 },
];

function formatYMD(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Link de nota clicável na barra (backlink ou forward link existente).
function NotaLink({
    titulo,
    detalhe,
    badge,
    existe = true,
    alerta = false,
    onClick,
}: {
    titulo: string;
    detalhe?: string;
    badge?: string;
    existe?: boolean;
    alerta?: boolean; // detalhe a vermelho (ex.: alvo no arquivo)
    onClick: () => void;
}) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            title={titulo}
            className={cn(
                'h-auto w-full justify-start gap-2 px-1.5 py-1 text-left text-xs font-normal',
                existe ? 'text-foreground' : 'italic text-muted-foreground',
            )}
        >
            <span className="min-w-0 flex-1">
                <span className="block truncate">{titulo}</span>
                {detalhe && (
                    <span
                        className={cn(
                            'block truncate text-[0.68rem]',
                            alerta ? 'text-destructive' : 'text-muted-foreground',
                        )}
                    >
                        {detalhe}
                    </span>
                )}
            </span>
            {badge && (
                <span className="shrink-0 rounded border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                    {badge}
                </span>
            )}
        </Button>
    );
}

function vazio(texto: string) {
    return <p className="px-1.5 text-xs text-muted-foreground">{texto}</p>;
}

function RightSidebar({
    collapsed,
    onToggle,
    diasComDaily,
    arvore,
}: {
    collapsed: boolean;
    onToggle: () => void;
    diasComDaily: string[];
    arvore: Arvore;
}) {
    const router = useRouter();
    const { ficheiroAtivo, ficheirosAbertos, abrirFicheiro, workspaceVersion } = useWorkspace();
    const [activeTab, setActiveTab] = useState<RightTab>('outline');
    // Tab Tags (#32): tag expandida mostra as notas onde aparece. A lista é
    // memoizada — recalcula só quando a árvore muda, não a cada estado local.
    const [tagAberta, setTagAberta] = useState<string | null>(null);
    const tagsGlobais = useMemo(() => tagsComNotasDaArvore(arvore), [arvore]);
    const [wikilinkAmbiguo, setWikilinkAmbiguo] = useState<{
        slug: string;
        opcoes: NotaResolvidaWikilink[];
    } | null>(null);
    // Dados carregados, marcados com a tabKey a que pertencem — assim, ao trocar de
    // ficheiro, os dados antigos não aparecem (evita flash) e não há setState síncrono.
    const [dados, setDados] = useState<{ key: string; d: DadosBarraDireita } | null>(null);

    const ativo = ficheirosAbertos.find((f) => tabKey(f) === ficheiroAtivo) ?? null;
    const ativoTipo = ativo?.tipo ?? null;
    const ativoChave = ativo?.chave ?? null;
    const ativoId = ativo?.id ?? null;

    useEffect(() => {
        if (!ativoTipo || !ativoChave) return;
        const key = tabKey({ tipo: ativoTipo, chave: ativoChave, id: ativoId ?? undefined });
        let cancelado = false;
        const params = new URLSearchParams({ tipo: ativoTipo, chave: ativoChave });
        if (ativoId) params.set('id', ativoId);
        void runClientAction(
            {
                area: 'right-sidebar',
                action: 'dadosBarraDireita',
                meta: { ativoTipo, ativoChave, ativoId },
            },
            () => getJson<DadosBarraDireita>(`/api/barra-direita?${params.toString()}`),
        ).then((d) => {
            if (!cancelado && d) setDados({ key, d });
        });
        return () => {
            cancelado = true;
        };
    }, [ativoTipo, ativoChave, ativoId, workspaceVersion]);

    const dadosAtivos = ativo && dados?.key === ficheiroAtivo ? dados.d : null;

    function abrirNotaPorSlug(slug: string, titulo: string, existe: boolean, id?: string) {
        if (existe && id) {
            abrirFicheiro({ tipo: 'knowledge', id, chave: slug, titulo });
            router.push('/chat');
            return;
        }
        // Link quebrado: materializa a nota ao clicar (comportamento Obsidian).
        void runClientAction(
            { area: 'right-sidebar', action: 'abrirOuCriarNota', meta: { slug } },
            () => abrirOuCriarNota(slug),
        ).then((r) => {
            if (!r) return;
            if (r.estado === 'ambiguo') {
                setWikilinkAmbiguo({ slug: r.slug, opcoes: r.opcoes });
                return;
            }
            setWikilinkAmbiguo(null);
            abrirFicheiro({ tipo: 'knowledge', id: r.id, chave: r.chave, titulo: r.titulo });
            router.push('/chat');
            if (r.criada) router.refresh();
        });
    }

    function abrirEscolhaWikilink(nota: NotaResolvidaWikilink) {
        setWikilinkAmbiguo(null);
        abrirFicheiro({ tipo: 'knowledge', id: nota.id, chave: nota.chave, titulo: nota.titulo });
        router.push('/chat');
    }

    function navegarParaHeading(id: string) {
        const alvo = document.getElementById(id);
        if (!alvo) return;
        alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.replaceState(null, '', `#${id}`);
    }

    if (collapsed) {
        return null;
    }

    return (
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-l">
            {/* Header — icon tabs + collapse button */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b px-2">
                <div className="flex items-center gap-0.5">
                    {rightTabs.map(({ id, label, Icon }) => (
                        <Button
                            key={id}
                            variant="ghost"
                            size="icon"
                            title={label}
                            aria-label={label}
                            onClick={() => setActiveTab(id)}
                            className={cn(
                                'h-6 w-6 text-muted-foreground',
                                activeTab === id && 'bg-accent text-accent-foreground',
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                        </Button>
                    ))}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    title="Colapsar sidebar direita"
                    aria-label="Colapsar sidebar direita"
                    className="h-6 w-6 text-muted-foreground"
                >
                    <PanelRightClose className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Active tab panel */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {wikilinkAmbiguo ? (
                    <div className="space-y-2 border-l-2 border-border pl-2">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                                `[[{wikilinkAmbiguo.slug}]]` tem vários destinos.
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setWikilinkAmbiguo(null)}
                                className="h-6 px-2 text-xs"
                            >
                                Fechar
                            </Button>
                        </div>
                        <div className="space-y-1">
                            {wikilinkAmbiguo.opcoes.map((opcao) => (
                                <Button
                                    key={opcao.id}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => abrirEscolhaWikilink(opcao)}
                                    className="h-auto w-full justify-start px-2 py-1 text-left text-xs"
                                >
                                    <span className="truncate">{opcao.titulo}</span>
                                    <span className="ml-2 shrink-0 text-muted-foreground">
                                        {opcao.pasta}
                                    </span>
                                </Button>
                            ))}
                        </div>
                    </div>
                ) : activeTab === 'tags' ? (
                    // Tags são globais ao workspace (#32) — não dependem do
                    // ficheiro ativo. Clique na tag expande as notas; clique na
                    // nota abre a tab.
                    (() => {
                        if (!tagsGlobais.length) return vazio('Sem tags');
                        return (
                            <ul className="space-y-0.5">
                                {tagsGlobais.map(({ tag, notas }) => {
                                    const aberta = tagAberta?.toLowerCase() === tag.toLowerCase();
                                    return (
                                        <li key={tag.toLowerCase()}>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setTagAberta(aberta ? null : tag)}
                                                title={aberta ? 'Fechar' : `Notas com #${tag}`}
                                                className="h-auto w-full justify-between px-1.5 py-1 text-xs font-normal"
                                            >
                                                <span className="truncate text-primary">
                                                    #{tag}
                                                </span>
                                                <span className="ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                                                    {notas.length}
                                                </span>
                                            </Button>
                                            {aberta && (
                                                <ul className="mb-1 ml-2 space-y-0.5 border-l pl-1.5">
                                                    {notas.map((n) => (
                                                        <li key={n.id}>
                                                            <NotaLink
                                                                titulo={n.title}
                                                                onClick={() =>
                                                                    abrirNotaPorSlug(
                                                                        n.slug,
                                                                        n.title,
                                                                        true,
                                                                        n.id,
                                                                    )
                                                                }
                                                            />
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        );
                    })()
                ) : !ativo ? (
                    vazio('Selecciona um ficheiro')
                ) : !dadosAtivos ? (
                    vazio('A carregar…')
                ) : activeTab === 'outline' ? (
                    dadosAtivos.outline.length ? (
                        <ul className="space-y-1">
                            {dadosAtivos.outline.map((h) => (
                                <li key={`${h.linha}-${h.id}`}>
                                    <a
                                        href={`#${h.id}`}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            navegarParaHeading(h.id);
                                        }}
                                        style={{ paddingLeft: `${(h.nivel - 1) * 12 + 6}px` }}
                                        className="block truncate rounded py-1 pr-1.5 text-xs leading-4 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                        {h.texto}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        vazio('Sem títulos')
                    )
                ) : activeTab === 'backlinks' ? (
                    dadosAtivos.backlinks.length ? (
                        <ul className="space-y-0.5">
                            {dadosAtivos.backlinks.map((n) => (
                                <li key={`${n.tipo ?? 'knowledge'}:${n.slug}`}>
                                    <NotaLink
                                        titulo={n.tipo === 'daily' ? dataPt(n.title) : n.title}
                                        detalhe={
                                            n.tipo === 'daily' ? 'Backlink (daily)' : 'Backlink'
                                        }
                                        onClick={() => {
                                            // Daily nunca cai no caminho de knowledge
                                            // (abriria/criaria uma nota com o nome da data).
                                            if (n.tipo === 'daily') {
                                                if (n.id) {
                                                    abrirFicheiro({
                                                        tipo: 'daily',
                                                        id: n.id,
                                                        chave: n.slug,
                                                        titulo: dataPt(n.title),
                                                    });
                                                    router.push('/chat');
                                                }
                                                return;
                                            }
                                            abrirNotaPorSlug(n.slug, n.title, true, n.id);
                                        }}
                                    />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        vazio('Sem backlinks')
                    )
                ) : activeTab === 'forward' ? (
                    dadosAtivos.forwardLinks.length ? (
                        <ul className="space-y-0.5">
                            {dadosAtivos.forwardLinks.map((l) => (
                                <li key={l.id ?? l.slug}>
                                    <NotaLink
                                        titulo={l.title}
                                        detalhe={
                                            l.ambiguo
                                                ? 'Vários destinos'
                                                : l.arquivada
                                                  ? 'No arquivo'
                                                  : l.existe
                                                    ? undefined
                                                    : 'Link por criar'
                                        }
                                        badge={
                                            l.ambiguo
                                                ? 'Escolher'
                                                : l.existe || l.arquivada
                                                  ? undefined
                                                  : 'Criar'
                                        }
                                        existe={l.existe}
                                        alerta={l.arquivada}
                                        onClick={() => {
                                            // arquivada: não abrir nem criar por cima do slug
                                            if (l.arquivada) return;
                                            abrirNotaPorSlug(l.slug, l.title, l.existe, l.id);
                                        }}
                                    />
                                </li>
                            ))}
                        </ul>
                    ) : (
                        vazio('Sem links')
                    )
                ) : (
                    vazio('Partilhas — em breve')
                )}
            </div>

            {/* Footer — Calendar (no title row) */}
            <div className="flex h-80 shrink-0 flex-col border-t">
                <div className="flex flex-1 items-center justify-center overflow-hidden">
                    <DailyCalendar
                        diasComDaily={diasComDaily}
                        onDayClick={(day) => {
                            const dia = formatYMD(day);
                            // Dia sem daily: clique calmo, sem ação. Com daily: abre
                            // como ficheiro nos panes (não toma conta do centro).
                            if (!diasComDaily.includes(dia)) return;
                            abrirFicheiro({ tipo: 'daily', chave: dia, titulo: dataPt(dia) });
                            router.push('/chat');
                        }}
                    />
                </div>
            </div>
        </aside>
    );
}

// ──────────────────────────────────────────────
// WorkspaceShell — main export
// ──────────────────────────────────────────────
export interface ProjetoItem {
    id: string;
    nome: string;
    folderId: string | null;
}

export interface WorkspaceShellProps {
    arvore: Arvore;
    dailies: DailyItem[];
    diasComDaily: string[];
    projetos: ProjetoItem[];
    children: React.ReactNode;
}

export function WorkspaceShell({
    arvore,
    dailies,
    diasComDaily,
    projetos,
    children,
}: WorkspaceShellProps) {
    const [activePanel, setActivePanel] = useState<LeftPanel>('explorer');
    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);

    return (
        <WorkspaceProvider>
            <ClientErrorListener />
            <div className="flex flex-1 overflow-hidden">
                {/* Ribbon */}
                <Ribbon
                    activePanel={activePanel}
                    onPanelChange={setActivePanel}
                    leftCollapsed={leftCollapsed}
                    onOpenLeft={() => setLeftCollapsed(false)}
                />

                {/* Left sidebar (zero width when collapsed) */}
                <LeftSidebar
                    arvore={arvore}
                    dailies={dailies}
                    projetos={projetos}
                    activePanel={activePanel}
                    collapsed={leftCollapsed}
                    onToggle={() => setLeftCollapsed((v) => !v)}
                />

                {/* Main content area */}
                <main className="relative flex-1 overflow-hidden">
                    {/* Re-open right sidebar button (top-right corner, only when collapsed) */}
                    {rightCollapsed && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRightCollapsed(false)}
                            title="Abrir painel de propriedades"
                            aria-label="Abrir painel de propriedades"
                            className="absolute right-2 top-2 z-10 h-7 w-7 text-muted-foreground"
                        >
                            <PanelRightOpen className="h-4 w-4" />
                        </Button>
                    )}
                    {children}
                </main>

                {/* Right sidebar (zero width when collapsed) */}
                <RightSidebar
                    collapsed={rightCollapsed}
                    onToggle={() => setRightCollapsed((v) => !v)}
                    diasComDaily={diasComDaily}
                    arvore={arvore}
                />
            </div>
        </WorkspaceProvider>
    );
}
