'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    BookText,
    ListTodo,
    MessageSquare,
    Users,
    FolderTree,
    MessagesSquare,
    ChevronLeft,
    ChevronRight,
    Network,
    PanelRight,
    List,
    CornerDownLeft,
    CornerUpRight,
    Share2,
    Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FileExplorer } from '@/components/layout/file-explorer';
import type { ExplorerFolder } from '@/components/layout/file-explorer';

// ──────────────────────────────────────────────
// Ribbon — icons that commute the left panel
// ──────────────────────────────────────────────
type LeftPanel = 'explorer' | 'chats';

const panelItems: { id: LeftPanel; label: string; Icon: React.ElementType }[] = [
    { id: 'explorer', label: 'Explorador', Icon: FolderTree },
    { id: 'chats', label: 'Conversas', Icon: MessagesSquare },
];

// Route nav items (same as the original IconRail)
const navItems = [
    { href: '/chat', label: 'Chat', Icon: MessageSquare },
    { href: '/tarefas', label: 'Tarefas', Icon: ListTodo },
    { href: '/grupos', label: 'Grupos', Icon: Users },
    { href: '/knowledge', label: 'Knowledge', Icon: BookText },
];

function Ribbon({
    activePanel,
    onPanelChange,
}: {
    activePanel: LeftPanel;
    onPanelChange: (p: LeftPanel) => void;
}) {
    const pathname = usePathname();

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
                        className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                            active && 'bg-accent text-accent-foreground',
                        )}
                    >
                        <Icon className="h-5 w-5" />
                    </Link>
                );
            })}
        </nav>
    );
}

// ──────────────────────────────────────────────
// Left sidebar
// ──────────────────────────────────────────────
function LeftSidebar({
    folders,
    activePanel,
    collapsed,
    onToggle,
}: {
    folders: ExplorerFolder[];
    activePanel: LeftPanel;
    collapsed: boolean;
    onToggle: () => void;
}) {
    if (collapsed) {
        return (
            <div className="flex w-8 shrink-0 flex-col items-center border-r pt-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    title="Expandir sidebar"
                    className="h-7 w-7 text-muted-foreground"
                >
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <aside className="flex w-60 shrink-0 flex-col overflow-hidden border-r">
            {/* Header with collapse button */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
                {activePanel === 'explorer' ? (
                    <span title="Explorador">
                        <FolderTree
                            className="h-4 w-4 text-muted-foreground"
                            aria-label="Explorador"
                        />
                    </span>
                ) : (
                    <span title="Conversas">
                        <MessagesSquare
                            className="h-4 w-4 text-muted-foreground"
                            aria-label="Conversas"
                        />
                    </span>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    title="Colapsar sidebar"
                    className="h-6 w-6 text-muted-foreground"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Main panel content */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {activePanel === 'explorer' ? (
                    <FileExplorer folders={folders} />
                ) : (
                    <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                        Conversas — em breve
                    </div>
                )}
            </div>

            {/* Footer — Grafo placeholder */}
            <div className="flex h-48 shrink-0 flex-col border-t">
                <div className="border-b px-3 py-2">
                    <span title="Grafo">
                        <Network className="h-4 w-4 text-muted-foreground" aria-label="Grafo" />
                    </span>
                </div>
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Grafo 2D/3D — em breve
                </div>
            </div>
        </aside>
    );
}

// ──────────────────────────────────────────────
// Right sidebar
// ──────────────────────────────────────────────
const rightSections: { label: string; Icon: React.ElementType }[] = [
    { label: 'Outline', Icon: List },
    { label: 'Backlinks', Icon: CornerDownLeft },
    { label: 'Forward links', Icon: CornerUpRight },
    { label: 'Partilhas', Icon: Share2 },
];

function RightSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    if (collapsed) {
        return (
            <div className="flex w-8 shrink-0 flex-col items-center border-l pt-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    title="Expandir sidebar direita"
                    className="h-7 w-7 text-muted-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-l">
            {/* Header with collapse button */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
                <span title="Propriedades">
                    <PanelRight
                        className="h-4 w-4 text-muted-foreground"
                        aria-label="Propriedades"
                    />
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    title="Colapsar sidebar direita"
                    className="h-6 w-6 text-muted-foreground"
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* File-property sections */}
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
                {rightSections.map(({ label, Icon }) => (
                    <div key={label} className="px-3 py-2">
                        <span title={label}>
                            <Icon
                                className="mb-1 h-4 w-4 text-muted-foreground"
                                aria-label={label}
                            />
                        </span>
                        <p className="text-xs text-muted-foreground">Selecciona um ficheiro</p>
                    </div>
                ))}
            </div>

            {/* Footer — Calendar placeholder */}
            <div className="flex h-48 shrink-0 flex-col border-t">
                <div className="border-b px-3 py-2">
                    <span title="Calendário">
                        <Calendar
                            className="h-4 w-4 text-muted-foreground"
                            aria-label="Calendário"
                        />
                    </span>
                </div>
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Calendário — em breve
                </div>
            </div>
        </aside>
    );
}

// ──────────────────────────────────────────────
// WorkspaceShell — main export
// ──────────────────────────────────────────────
export interface WorkspaceShellProps {
    folders: ExplorerFolder[];
    children: React.ReactNode;
}

export function WorkspaceShell({ folders, children }: WorkspaceShellProps) {
    const [activePanel, setActivePanel] = useState<LeftPanel>('explorer');
    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);

    return (
        <div className="flex flex-1 overflow-hidden">
            {/* Ribbon */}
            <Ribbon activePanel={activePanel} onPanelChange={setActivePanel} />

            {/* Left sidebar */}
            <LeftSidebar
                folders={folders}
                activePanel={activePanel}
                collapsed={leftCollapsed}
                onToggle={() => setLeftCollapsed((v) => !v)}
            />

            {/* Main content area */}
            <main className="flex-1 overflow-y-auto">{children}</main>

            {/* Right sidebar */}
            <RightSidebar
                collapsed={rightCollapsed}
                onToggle={() => setRightCollapsed((v) => !v)}
            />
        </div>
    );
}
