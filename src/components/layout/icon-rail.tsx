'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListTodo, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

// Rail fino estilo Obsidian: troca a view ativa. Só os ícones que já existem;
// File Explorer & cª entram como novos itens nas próximas slices.
const items = [
    { href: '/chat', label: 'Chat', icon: MessageSquare },
    { href: '/tarefas', label: 'Tarefas', icon: ListTodo },
];

export function IconRail() {
    const pathname = usePathname();
    return (
        <nav className="flex w-14 flex-col items-center gap-1 border-r py-3">
            {items.map(({ href, label, icon: Icon }) => {
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
