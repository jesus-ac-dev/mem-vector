'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runClientAction } from '@/lib/client-error-log';
import { PALETA } from '@/lib/cores';
import {
    definirCorPastaAction,
    definirCorDailyAction,
} from '@/modules/workspace/workspace.actions';
import { getJson } from '@/lib/api-get';
import type { Pasta } from '@/modules/folders/folders.tree';

// Linha de paleta: as cores + um "limpar" (default). Marca a cor ativa.
function LinhaPaleta({
    cor,
    onEscolher,
}: {
    cor: string | null;
    onEscolher: (hex: string | null) => void;
}) {
    return (
        <div className="flex items-center gap-1">
            {PALETA.map((c) => (
                <Button
                    key={c.hex}
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => onEscolher(c.hex)}
                    className="h-5 w-5 rounded-full p-0 hover:opacity-80"
                    style={{ backgroundColor: c.hex }}
                >
                    {cor === c.hex && <Check className="h-3 w-3" style={{ color: '#fff' }} />}
                </Button>
            ))}
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEscolher(null)}
                className="h-5 px-1 text-[0.65rem] text-muted-foreground"
            >
                limpar
            </Button>
        </div>
    );
}

export function GrafoConfig({ onFechar, onMudou }: { onFechar: () => void; onMudou: () => void }) {
    const router = useRouter();
    const [pastas, setPastas] = useState<Pasta[]>([]);
    const [corDaily, setCorDaily] = useState<string | null>(null);

    useEffect(() => {
        void runClientAction({ area: 'grafo-config', action: 'carregarCores' }, () =>
            Promise.all([
                getJson<Pasta[]>('/api/pastas'),
                getJson<string | null>('/api/cor-daily'),
            ]),
        ).then((res) => {
            if (!res) return;
            const [ps, cd] = res;
            setPastas(ps);
            setCorDaily(cd);
        });
    }, []);

    async function escolherPasta(folderId: string, hex: string | null) {
        setPastas((prev) => prev.map((p) => (p.id === folderId ? { ...p, color: hex } : p)));
        await runClientAction(
            { area: 'grafo-config', action: 'definirCorPasta', meta: { folderId, hex } },
            () => definirCorPastaAction(folderId, hex),
        );
        onMudou();
        router.refresh();
    }

    async function escolherDaily(hex: string | null) {
        setCorDaily(hex);
        await runClientAction(
            { area: 'grafo-config', action: 'definirCorDaily', meta: { hex } },
            () => definirCorDailyAction(hex),
        );
        onMudou();
        router.refresh();
    }

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-3">
            <div className="max-h-full w-full max-w-xs overflow-y-auto rounded-md border bg-popover p-3 shadow-md">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Cores do grafo
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onFechar}
                        title="Fechar"
                        aria-label="Fechar"
                        className="h-5 w-5 text-muted-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>

                <div className="space-y-2">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-foreground">Daily Notes</span>
                        <LinhaPaleta cor={corDaily} onEscolher={(hex) => void escolherDaily(hex)} />
                    </div>
                    {pastas.map((p) => (
                        <div key={p.id} className="flex flex-col gap-1">
                            <span className="truncate text-xs text-foreground" title={p.name}>
                                {p.name}
                            </span>
                            <LinhaPaleta
                                cor={p.color}
                                onEscolher={(hex) => void escolherPasta(p.id, hex)}
                            />
                        </div>
                    ))}
                    {pastas.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                            Sem pastas. Cria pastas no explorer para lhes dar cor.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
