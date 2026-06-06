'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/layout/workspace-context';
import { listarConversasAction } from '@/modules/chat/chat.actions';
import type { ConversaResumo } from '@/modules/chat/chat.conversas';

type Estado =
    | { tipo: 'carregando' }
    | { tipo: 'ok'; conversas: ConversaResumo[] }
    | { tipo: 'erro' };

function formatDatePT(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function ConversasPanel() {
    const router = useRouter();
    const { conversaAberta, abrirConversa } = useWorkspace();
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

    useEffect(() => {
        listarConversasAction()
            .then((conversas) => {
                setEstado({ tipo: 'ok', conversas });
            })
            .catch(() => {
                setEstado({ tipo: 'erro' });
            });
    }, []);

    function handleNovaConversa() {
        abrirConversa(null);
        router.push('/chat');
    }

    function handleAbrirConversa(id: string) {
        abrirConversa(id);
        router.push('/chat');
    }

    return (
        <nav className="flex h-full flex-col overflow-hidden">
            {/* Nova conversa */}
            <div className="shrink-0 border-b px-2 py-1.5">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={handleNovaConversa}
                    className="flex h-auto w-full items-center justify-start gap-1.5 rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                    <Plus className="h-4 w-4 shrink-0" />
                    Nova conversa
                </Button>
            </div>

            {/* List area */}
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
                {estado.tipo === 'carregando' && (
                    <p className="px-4 py-3 text-xs text-muted-foreground">a carregar…</p>
                )}

                {estado.tipo === 'erro' && (
                    <p className="px-4 py-3 text-xs text-muted-foreground">
                        não foi possível carregar
                    </p>
                )}

                {estado.tipo === 'ok' && estado.conversas.length === 0 && (
                    <p className="px-4 py-3 text-xs text-muted-foreground">Sem conversas ainda</p>
                )}

                {estado.tipo === 'ok' && (
                    <ul>
                        {estado.conversas.map((c) => {
                            const isActive = conversaAberta === c.id;
                            return (
                                <li key={c.id}>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => handleAbrirConversa(c.id)}
                                        title={c.titulo}
                                        className={cn(
                                            'h-auto w-full flex-col items-start rounded-none px-4 py-2 text-left transition-colors',
                                            isActive
                                                ? 'bg-accent text-accent-foreground'
                                                : 'text-foreground hover:bg-muted',
                                        )}
                                    >
                                        <span className="w-full truncate text-sm font-medium">
                                            {c.titulo}
                                        </span>
                                        <span className="mt-0.5 w-full truncate text-xs text-muted-foreground">
                                            {formatDatePT(c.criadaEm)} · {c.nMensagens} msg · $
                                            {c.custoTotal.toFixed(4)}
                                        </span>
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </nav>
    );
}
