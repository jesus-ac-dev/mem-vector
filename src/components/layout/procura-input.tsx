'use client';

import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useProcura } from '@/components/layout/procura-context';

// Input de procura (#91) no centro do header. Escreve o termo no context; os
// resultados (e o buttongroup Texto/Conceito) carregam no painel esquerdo.
export function ProcuraInput() {
    const { q, setQ } = useProcura();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const isMac =
        typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

    return (
        <div className="relative mx-auto w-full max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        setQ('');
                        inputRef.current?.blur();
                    }
                }}
                placeholder="Procurar no workspace…"
                aria-keyshortcuts="Control+K Meta+K"
                className="h-8 bg-muted/40 pl-8 pr-8"
            />
            {!q && (
                <div className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 select-none items-center gap-1 sm:flex">
                    <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                        <span className="text-xs">{isMac ? '⌘' : 'Ctrl'}</span>K
                    </kbd>
                </div>
            )}
            {q && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQ('')}
                    className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                    aria-label="Limpar procura"
                >
                    <X className="h-4 w-4" />
                </Button>
            )}
        </div>
    );
}
