'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ExplorerFolder {
    label: string;
    basePath: string;
    items: { id: string; slug: string; title: string }[];
}

interface FileExplorerProps {
    folders: ExplorerFolder[];
}

function FolderSection({ folder }: { folder: ExplorerFolder }) {
    const [open, setOpen] = useState(true);
    const pathname = usePathname();
    const ChevronIcon = open ? ChevronDown : ChevronRight;

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
                        const href = `${folder.basePath}/${item.slug}`;
                        const isActive = pathname === href;
                        return (
                            <li key={item.id}>
                                <Link
                                    href={href}
                                    className={cn(
                                        'block truncate px-6 py-1.5 text-sm transition-colors',
                                        isActive
                                            ? 'bg-accent text-accent-foreground'
                                            : 'text-foreground hover:bg-muted',
                                    )}
                                    title={item.title}
                                >
                                    {item.title}
                                </Link>
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
            <div className="border-b px-3 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Explorador
                </span>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
                {folders.map((folder) => (
                    <FolderSection key={folder.basePath} folder={folder} />
                ))}
            </div>
        </nav>
    );
}
