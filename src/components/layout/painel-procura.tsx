'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CalendarDays, MessagesSquare } from 'lucide-react';
import { getJson } from '@/lib/api-get';
import { logClientError } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useProcura } from '@/components/layout/procura-context';
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

// Painel de resultados da procura (#91), na sidebar esquerda. O input vive no
// header (ProcuraInput); aqui lê-se o termo do context e mostram-se o buttongroup
// Texto/Conceito + os resultados. Só é renderizado quando há procura ativa (o
// shell esconde o explorer), por isso não fica fixo no file explorer.
export function PainelProcura() {
    const router = useRouter();
    const { q, modo, setModo } = useProcura();
    const [resultados, setResultados] = useState<ResultadoProcura[] | null>(null);

    useEffect(() => {
        const termo = q.trim();
        // `vivo` ignora respostas de um fetch já obsoleto (trocar de modo/escrever
        // lança outro): sem isto uma resposta antiga podia sobrepor a nova.
        let vivo = true;
        // setState fica dentro do timeout (a regra casa-set-state-in-effect
        // proíbe-o no corpo do effect); termo vazio limpa sem debounce.
        const id = setTimeout(
            () => {
                if (!termo) {
                    setResultados(null);
                    return;
                }
                getJson<ResultadoProcura[]>(
                    `/api/procura?q=${encodeURIComponent(termo)}&modo=${modo}`,
                )
                    .then((r) => {
                        if (vivo) setResultados(r ?? []);
                    })
                    .catch((e) => {
                        // Erro (rede/401): não deixar em branco — mostra "Sem
                        // resultados". O 401 já dispara o kick via getJson.
                        if (vivo) setResultados([]);
                        logClientError({ area: 'procura', action: modo }, e);
                    });
            },
            termo ? 250 : 0,
        );
        return () => {
            vivo = false;
            clearTimeout(id);
        };
    }, [q, modo]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex shrink-0 gap-1 border-b p-2">
                {(['texto', 'conceito'] as const).map((m) => (
                    <Button
                        key={m}
                        variant={modo === m ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setModo(m)}
                        className="h-6 flex-1 text-xs"
                    >
                        {m === 'texto' ? 'Texto' : 'Conceito'}
                    </Button>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-1">
                {resultados === null ? null : resultados.length === 0 ? (
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
        </div>
    );
}
