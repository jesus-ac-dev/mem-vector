'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NotaKnowledge } from '@/modules/knowledge/knowledge.schema';

interface KnowledgeSidebarProps {
    notas: NotaKnowledge[];
}

export function KnowledgeSidebar({ notas }: KnowledgeSidebarProps) {
    const pathname = usePathname();

    return (
        <nav className="flex h-full flex-col">
            <div className="border-b px-4 py-3">
                <span className="text-sm font-semibold text-foreground">Notas</span>
            </div>
            <ul className="flex-1 overflow-y-auto py-2">
                {notas.map((n) => {
                    const href = `/knowledge/${n.slug}`;
                    const isActive = pathname === href;
                    return (
                        <li key={n.id}>
                            <Link
                                href={href}
                                className={[
                                    'flex flex-col gap-0.5 px-4 py-2 text-sm transition-colors',
                                    isActive
                                        ? 'bg-accent text-accent-foreground'
                                        : 'text-foreground hover:bg-muted',
                                ].join(' ')}
                            >
                                <span className="truncate font-medium">{n.title}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                    {new Date(n.updatedAt).toLocaleDateString('pt-PT')}
                                </span>
                            </Link>
                        </li>
                    );
                })}
                {notas.length === 0 && (
                    <li className="px-4 py-2 text-xs text-muted-foreground">Sem notas.</li>
                )}
            </ul>
        </nav>
    );
}
