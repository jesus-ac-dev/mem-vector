'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useProcura } from '@/components/layout/procura-context';

// Input de procura (#91) no centro do header. Escreve o termo no context; os
// resultados (e o buttongroup Texto/Conceito) carregam no painel esquerdo.
export function ProcuraInput() {
    const { q, setQ } = useProcura();
    return (
        <div className="relative mx-auto w-full max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Procurar no workspace…"
                className="h-8 bg-muted/40 pl-8 pr-8"
            />
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
