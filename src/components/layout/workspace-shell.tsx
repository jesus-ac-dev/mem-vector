'use client';

import { useEffect, useState } from 'react';
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
    FilePlus,
    FolderPlus,
    Archive,
    Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { FileExplorer } from '@/components/layout/file-explorer';
import type { DailyItem } from '@/components/layout/file-explorer';
import { ArquivadosLista } from '@/components/layout/arquivados-lista';
import { ConversasPanel } from '@/components/layout/conversas-panel';
import { WorkspaceGraph } from '@/components/layout/workspace-graph';
import {
    criarNotaNaPasta,
    novaPasta,
    abrirOuCriarNota,
    dadosBarraDireita,
    listarArquivadosAction,
    type DadosBarraDireita,
} from '@/modules/workspace/workspace.actions';
import { tabKey } from '@/components/layout/workspace-context';
import type { Arvore } from '@/modules/folders/folders.tree';
import type { NotaKnowledge } from '@/modules/knowledge/knowledge.schema';

// ──────────────────────────────────────────────
// Ribbon — icons that commute the left panel
// ──────────────────────────────────────────────
type LeftPanel = 'explorer' | 'chats';

const panelItems: { id: LeftPanel; label: string; Icon: React.ElementType }[] = [
    { id: 'explorer', label: 'Explorador', Icon: FolderTree },
    { id: 'chats', label: 'Conversas', Icon: MessagesSquare },
];

// Route nav items (Knowledge e Daily vivem no file-explorer, não no ribbon)
const navItems = [
    { href: '/chat', label: 'Chat', Icon: MessageSquare },
    { href: '/tarefas', label: 'Tarefas', Icon: ListTodo },
    { href: '/grupos', label: 'Grupos', Icon: Users },
];

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
    const { abrirChat } = useWorkspace();

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

            {/* Route-nav icons */}
            {navItems.map(({ href, label, Icon }) => {
                const active = pathname.startsWith(href);
                return (
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
    activePanel,
    collapsed,
    onToggle,
}: {
    arvore: Arvore;
    dailies: DailyItem[];
    activePanel: LeftPanel;
    collapsed: boolean;
    onToggle: () => void;
}) {
    const router = useRouter();
    const { abrirConversa, abrirFicheiro } = useWorkspace();
    const [verArquivados, setVerArquivados] = useState(false);
    const [arquivados, setArquivados] = useState<NotaKnowledge[]>([]);
    const [pastaSelecionada, setPastaSelecionada] = useState<string | null>(null);
    const [criandoPasta, setCriandoPasta] = useState(false);

    async function carregarArquivados() {
        setArquivados(await listarArquivadosAction());
    }

    function toggleArquivados() {
        setVerArquivados((v) => {
            const novo = !v;
            if (novo) void carregarArquivados();
            return novo;
        });
    }

    async function handleNovaNota() {
        const nota = await criarNotaNaPasta(pastaSelecionada);
        abrirFicheiro({
            tipo: nota.tipo,
            chave: nota.chave,
            titulo: nota.titulo,
            vistaInicial: 'editor',
        });
        router.push('/chat');
        router.refresh(); // mostra a nota nova no explorer (server)
    }

    function handleNovaPasta() {
        setCriandoPasta(true); // mostra o input inline no topo da árvore
    }

    async function confirmarCriarPasta(nome: string) {
        setCriandoPasta(false);
        await novaPasta(nome);
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
                            <Button
                                variant="ghost"
                                size="icon"
                                title="Nova nota"
                                aria-label="Nova nota"
                                onClick={() => void handleNovaNota()}
                                className="h-6 w-6 text-muted-foreground"
                            >
                                <FilePlus className="h-3.5 w-3.5" />
                            </Button>
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
                                title={verArquivados ? 'Ver notas' : 'Ver arquivados'}
                                aria-label="Ver arquivados"
                                aria-pressed={verArquivados}
                                onClick={toggleArquivados}
                                className={cn(
                                    'h-6 w-6 text-muted-foreground',
                                    verArquivados && 'bg-accent text-accent-foreground',
                                )}
                            >
                                <Archive className="h-3.5 w-3.5" />
                            </Button>
                        </>
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
                            arvore={arvore}
                            dailies={dailies}
                            pastaSelecionada={pastaSelecionada}
                            onSelecionarPasta={setPastaSelecionada}
                            criandoPasta={criandoPasta}
                            onCriarPasta={(nome) => void confirmarCriarPasta(nome)}
                            onCancelarCriarPasta={() => setCriandoPasta(false)}
                        />
                    )
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
            modifiersClassNames={{
                comDaily: 'bg-accent text-accent-foreground rounded-full',
            }}
            onDayClick={onDayClick}
            className="p-2 text-xs [--cell-size:1.75rem]"
            classNames={{
                caption_label: 'text-xs font-medium',
                weekday: 'text-[0.7rem]',
            }}
        />
    );
}

// ──────────────────────────────────────────────
// Right sidebar
// ──────────────────────────────────────────────
type RightTab = 'outline' | 'backlinks' | 'forward' | 'partilhas';

const rightTabs: { id: RightTab; label: string; Icon: React.ElementType }[] = [
    { id: 'outline', label: 'Outline', Icon: List },
    { id: 'backlinks', label: 'Backlinks', Icon: CornerDownLeft },
    { id: 'forward', label: 'Forward links', Icon: CornerUpRight },
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
    existe = true,
    onClick,
}: {
    titulo: string;
    existe?: boolean;
    onClick: () => void;
}) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            title={titulo}
            className={cn(
                'h-auto w-full justify-start truncate px-1.5 py-1 text-left text-xs font-normal',
                existe ? 'text-foreground' : 'italic text-muted-foreground',
            )}
        >
            {existe ? titulo : `${titulo} (criar)`}
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
}: {
    collapsed: boolean;
    onToggle: () => void;
    diasComDaily: string[];
}) {
    const router = useRouter();
    const { ficheiroAtivo, ficheirosAbertos, abrirFicheiro } = useWorkspace();
    const [activeTab, setActiveTab] = useState<RightTab>('outline');
    // Dados carregados, marcados com a tabKey a que pertencem — assim, ao trocar de
    // ficheiro, os dados antigos não aparecem (evita flash) e não há setState síncrono.
    const [dados, setDados] = useState<{ key: string; d: DadosBarraDireita } | null>(null);

    const ativo = ficheirosAbertos.find((f) => tabKey(f) === ficheiroAtivo) ?? null;
    const ativoTipo = ativo?.tipo ?? null;
    const ativoChave = ativo?.chave ?? null;

    useEffect(() => {
        if (!ativoTipo || !ativoChave) return;
        const key = `${ativoTipo}:${ativoChave}`;
        let cancelado = false;
        void dadosBarraDireita(ativoTipo, ativoChave).then((d) => {
            if (!cancelado) setDados({ key, d });
        });
        return () => {
            cancelado = true;
        };
    }, [ativoTipo, ativoChave]);

    const dadosAtivos = ativo && dados?.key === ficheiroAtivo ? dados.d : null;

    function abrirNotaPorSlug(slug: string, titulo: string, existe: boolean) {
        if (existe) {
            abrirFicheiro({ tipo: 'knowledge', chave: slug, titulo });
            router.push('/chat');
            return;
        }
        // Link quebrado: materializa a nota ao clicar (comportamento Obsidian).
        void abrirOuCriarNota(slug).then((r) => {
            abrirFicheiro({ tipo: 'knowledge', chave: r.chave, titulo: r.titulo });
            router.push('/chat');
            router.refresh();
        });
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
                {!ativo ? (
                    vazio('Selecciona um ficheiro')
                ) : !dadosAtivos ? (
                    vazio('A carregar…')
                ) : activeTab === 'outline' ? (
                    dadosAtivos.outline.length ? (
                        <ul className="space-y-0.5">
                            {dadosAtivos.outline.map((h) => (
                                <li
                                    key={`${h.linha}-${h.texto}`}
                                    style={{ paddingLeft: `${(h.nivel - 1) * 12}px` }}
                                    className="truncate px-1.5 text-xs text-muted-foreground"
                                    title={h.texto}
                                >
                                    {h.texto}
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
                                <li key={n.slug}>
                                    <NotaLink
                                        titulo={n.title}
                                        onClick={() => abrirNotaPorSlug(n.slug, n.title, true)}
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
                                <li key={l.slug}>
                                    <NotaLink
                                        titulo={l.title}
                                        existe={l.existe}
                                        onClick={() => abrirNotaPorSlug(l.slug, l.title, l.existe)}
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
                        onDayClick={(day) => router.push('/daily/' + formatYMD(day))}
                    />
                </div>
            </div>
        </aside>
    );
}

// ──────────────────────────────────────────────
// WorkspaceShell — main export
// ──────────────────────────────────────────────
export interface WorkspaceShellProps {
    arvore: Arvore;
    dailies: DailyItem[];
    diasComDaily: string[];
    children: React.ReactNode;
}

export function WorkspaceShell({ arvore, dailies, diasComDaily, children }: WorkspaceShellProps) {
    const [activePanel, setActivePanel] = useState<LeftPanel>('explorer');
    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);

    return (
        <WorkspaceProvider>
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
                />
            </div>
        </WorkspaceProvider>
    );
}
