'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CalendarDays, MessagesSquare } from 'lucide-react';
import { getJson } from '@/lib/api-get';
import { logClientError } from '@/lib/client-error-log';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ResultadoProcura, TipoResultado } from '@/modules/procura/procura.service';

type Modo = 'texto' | 'conceito';

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

// Procura no painel esquerdo (#91): input + buttongroup Texto/Conceito; os
// resultados CARREGAM no painel (não dropdown). `onAtiva` avisa o shell para
// esconder o explorer enquanto há procura. Texto = full-text (prefixo);
// Conceito = semântico (embedding).
export function BarraProcura({ onAtiva }: { onAtiva?: (ativa: boolean) => void }) {
    const router = useRouter();
    const [q, setQ] = useState('');
    const [modo, setModo] = useState<Modo>('texto');
    const [resultados, setResultados] = useState<ResultadoProcura[] | null>(null);

    useEffect(() => {
        const termo = q.trim();
        const id = setTimeout(
            () => {
                if (!termo) {
                    setResultados(null);
                    onAtiva?.(false);
                    return;
                }
                onAtiva?.(true);
                getJson<ResultadoProcura[]>(
                    `/api/procura?q=${encodeURIComponent(termo)}&modo=${modo}`,
                )
                    .then((r) => setResultados(r ?? []))
                    .catch((e) => {
                        // Erro (rede/401): não deixar o painel em branco — mostra
                        // "Sem resultados". O 401 já dispara o kick via getJson.
                        setResultados([]);
                        logClientError({ area: 'procura', action: modo }, e);
                    });
            },
            termo ? 250 : 0,
        );
        return () => clearTimeout(id);
    }, [q, modo, onAtiva]);

    return (
        <div className="flex shrink-0 flex-col border-b">
            <div className="shrink-0 space-y-1 p-2">
                <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Procurar no workspace…"
                    className="h-8 bg-muted/40"
                />
                <div className="flex gap-1">
                    {(['texto', 'conceito'] as const).map((m) => (
                        <Button
                            key={m}
                            variant={modo === m ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setModo(m)}
                            className="h-6 flex-1 text-xs capitalize"
                        >
                            {m === 'texto' ? 'Texto' : 'Conceito'}
                        </Button>
                    ))}
                </div>
            </div>

            {resultados && (
                <div className="max-h-[50vh] overflow-y-auto border-t p-1">
                    {resultados.length === 0 ? (
                        <p className="px-2 py-3 text-xs text-muted-foreground">Sem resultados.</p>
                    ) : (
                        resultados.map((r) => {
                            const Icone = ICONE[r.tipo];
                            return (
                                <Button
                                    key={`${r.tipo}:${r.id}`}
                                    variant="ghost"
                                    onClick={() => router.push(hrefDoResultado(r))}
                                    className={cn(
                                        'flex h-auto w-full items-start justify-start gap-2 px-2 py-1.5 text-left font-normal',
                                    )}
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
