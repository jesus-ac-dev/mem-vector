'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { useWorkspace, type FicheiroAberto } from '@/components/layout/workspace-context';
import { lerFicheiro } from '@/modules/workspace/workspace.actions';

interface FilePaneProps {
    ficheiro: FicheiroAberto;
}

type PaneEstado =
    | { tipo: 'carregando' }
    | { tipo: 'erro' }
    | { tipo: 'ok'; titulo: string; contentMd: string };

export function FilePane({ ficheiro }: FilePaneProps) {
    const { fecharFicheiro } = useWorkspace();
    // Estado inicial já inclui o título do item antes do fetch terminar.
    const [estado, setEstado] = useState<PaneEstado>({ tipo: 'carregando' });
    useEffect(() => {
        let cancelled = false;

        lerFicheiro(ficheiro.tipo, ficheiro.chave)
            .then((res) => {
                if (cancelled) return;
                if (!res) {
                    setEstado({ tipo: 'erro' });
                    return;
                }
                setEstado({ tipo: 'ok', titulo: res.titulo, contentMd: res.contentMd });
            })
            .catch(() => {
                if (!cancelled) setEstado({ tipo: 'erro' });
            });

        return () => {
            cancelled = true;
            setEstado({ tipo: 'carregando' });
        };
    }, [ficheiro.tipo, ficheiro.chave]);

    const titulo = estado.tipo === 'ok' ? estado.titulo : (ficheiro.titulo ?? ficheiro.chave);

    return (
        <div className="flex h-full flex-col overflow-hidden border-l duration-200 animate-in fade-in slide-in-from-right-2">
            {/* Header */}
            <div className="flex h-10 min-w-0 shrink-0 items-center justify-between border-b px-4">
                <span className="truncate text-sm font-medium text-foreground" title={titulo}>
                    {titulo}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={fecharFicheiro}
                    title="Fechar pane"
                    aria-label="Fechar pane"
                    className="h-7 w-7 shrink-0 text-muted-foreground"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm">
                {estado.tipo === 'carregando' && (
                    <p className="text-muted-foreground">a carregar…</p>
                )}
                {estado.tipo === 'erro' && <p className="text-muted-foreground">não encontrado</p>}
                {estado.tipo === 'ok' && <Markdown content={estado.contentMd} wikilinks />}
            </div>
        </div>
    );
}
