'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CalendarDays, MessagesSquare } from 'lucide-react';
import { getJson } from '@/lib/api-get';
import { logClientError } from '@/lib/client-error-log';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ResultadoProcura, TipoResultado } from '@/modules/procura/procura.service';

function hrefDoResultado(r: ResultadoProcura): string {
    if (r.tipo === 'knowledge') return `/knowledge/${r.slug ?? r.id}`;
    if (r.tipo === 'daily') return `/daily/${r.dia ?? r.id}`;
    return `/chat/${r.id}`;
}

const ICONE: Record<TipoResultado, typeof FileText> = {
    knowledge: FileText,
    daily: CalendarDays,
    chat: MessagesSquare,
};

// Procura "Texto" (#91): full-text sobre o workspace. Escreve → resultados num
// dropdown (ícone por tipo); clicar abre. (Modo "Conceito" entra a seguir.)
export function BarraProcura() {
    const router = useRouter();
    const [q, setQ] = useState('');
    const [resultados, setResultados] = useState<ResultadoProcura[] | null>(null);
    const [aberto, setAberto] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Debounce: a procura (e a limpeza, quando vazio) corre dentro do timeout —
    // nunca setState síncrono no corpo do effect.
    useEffect(() => {
        const termo = q.trim();
        const id = setTimeout(
            () => {
                if (!termo) {
                    setResultados(null);
                    setAberto(false);
                    return;
                }
                getJson<ResultadoProcura[]>(`/api/procura?q=${encodeURIComponent(termo)}`)
                    .then((r) => {
                        setResultados(r ?? []);
                        setAberto(true);
                    })
                    .catch((e) => logClientError({ area: 'procura', action: 'texto' }, e));
            },
            termo ? 250 : 0,
        );
        return () => clearTimeout(id);
    }, [q]);

    // Fecha o dropdown ao clicar fora.
    useEffect(() => {
        function onClick(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setAberto(false);
            }
        }
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    function abrir(r: ResultadoProcura) {
        setAberto(false);
        setQ('');
        router.push(hrefDoResultado(r));
    }

    return (
        <div ref={containerRef} className="relative mx-auto max-w-md">
            <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => resultados && setAberto(true)}
                placeholder="Procurar no workspace…"
                className="h-9 bg-muted/40"
            />
            {aberto && resultados && (
                <div className="absolute z-50 mt-1 max-h-96 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {resultados.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-muted-foreground">Sem resultados.</p>
                    ) : (
                        resultados.map((r) => {
                            const Icone = ICONE[r.tipo];
                            return (
                                <Button
                                    key={`${r.tipo}:${r.id}`}
                                    variant="ghost"
                                    onClick={() => abrir(r)}
                                    className="flex h-auto w-full items-start justify-start gap-2 px-2 py-1.5 text-left font-normal"
                                >
                                    <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">
                                            {r.titulo}
                                        </span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {r.excerto}
                                        </span>
                                    </span>
                                </Button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
