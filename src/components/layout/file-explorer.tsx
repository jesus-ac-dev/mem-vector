'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useWorkspace, tabKey } from '@/components/layout/workspace-context';

export interface ExplorerFolder {
    label: string;
    basePath: string;
    items: { id: string; slug: string; title: string }[];
}

interface FileExplorerProps {
    folders: ExplorerFolder[];
}

function FolderSection({ folder }: { folder: ExplorerFolder }) {
    const [open, setOpen] = useState(true);
    const router = useRouter();
    const { ficheiroAtivo, abrirFicheiro } = useWorkspace();
    const ChevronIcon = open ? ChevronDown : ChevronRight;

    const tipo = folder.basePath === '/knowledge' ? 'knowledge' : 'daily';

    return (
        <div>
            <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen((v) => !v)}
                className="flex h-auto w-full items-center justify-start gap-1 rounded-none px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
                <ChevronIcon className="h-3 w-3 shrink-0" />
                <span>{folder.label}</span>
            </Button>

            {open && (
                <ul>
                    {folder.items.map((item) => {
                        const isActive = ficheiroAtivo === tabKey({ tipo, chave: item.slug });
                        return (
                            <li key={item.id}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        abrirFicheiro({
                                            tipo,
                                            chave: item.slug,
                                            titulo: item.title,
                                        });
                                        router.push('/chat');
                                    }}
                                    title={item.title}
                                    className={cn(
                                        'h-auto w-full justify-start truncate rounded-none px-6 py-1.5 text-sm transition-colors',
                                        isActive
                                            ? 'bg-accent text-accent-foreground'
                                            : 'text-foreground hover:bg-muted',
                                    )}
                                >
                                    {item.title}
                                </Button>
                            </li>
                        );
                    })}
                    {folder.items.length === 0 && (
                        <li className="px-6 py-1.5 text-xs text-muted-foreground">Sem itens.</li>
                    )}
                </ul>
            )}
        </div>
    );
}

export function FileExplorer({ folders }: FileExplorerProps) {
    return (
        <nav className="flex h-full flex-col overflow-y-auto">
            <div className="flex-1 overflow-y-auto py-1">
                {folders.map((folder) => (
                    <FolderSection key={folder.basePath} folder={folder} />
                ))}
            </div>
        </nav>
    );
}
