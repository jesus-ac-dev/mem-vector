'use client';

import { useState } from 'react';
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
    Network,
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
import { ConversasPanel } from '@/components/layout/conversas-panel';
import { criarNotaVazia, novaPasta } from '@/modules/workspace/workspace.actions';
import type { Arvore } from '@/modules/folders/folders.tree';

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

    async function handleNovaNota() {
        const nota = await criarNotaVazia();
        abrirFicheiro({
            tipo: nota.tipo,
            chave: nota.chave,
            titulo: nota.titulo,
            vistaInicial: 'editor',
        });
        router.push('/chat');
        router.refresh(); // mostra a nota nova no explorer (server)
    }

    async function handleNovaPasta() {
        const nome = window.prompt('Nome da nova pasta:');
        if (!nome?.trim()) return;
        await novaPasta(nome.trim());
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
                                onClick={() => void handleNovaPasta()}
                                className="h-6 w-6 text-muted-foreground"
                            >
                                <FolderPlus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                title="Arquivar selecção"
                                aria-label="Arquivar selecção"
                                onClick={() => {}}
                                className="h-6 w-6 text-muted-foreground"
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
                    <FileExplorer arvore={arvore} dailies={dailies} />
                ) : (
                    <ConversasPanel />
                )}
            </div>

            {/* Footer — Grafo placeholder (no title row) */}
            <div className="flex h-80 shrink-0 flex-col items-center justify-center border-t">
                <Network className="mb-2 h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-sm text-muted-foreground">Grafo 2D/3D — em breve</span>
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
    const [activeTab, setActiveTab] = useState<RightTab>('outline');

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
                <p className="text-xs text-muted-foreground">Selecciona um ficheiro</p>
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
