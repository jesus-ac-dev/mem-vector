'use client';

import { useRouter } from 'next/navigation';
import { ArchiveRestore, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runClientAction } from '@/lib/client-error-log';
import { useWorkspace } from '@/components/layout/workspace-context';
import { reporNotaAction } from '@/modules/workspace/workspace.actions';
import type { NotaKnowledge } from '@/modules/knowledge/knowledge.schema';

interface ArquivadosListaProps {
    arquivados: NotaKnowledge[];
    onMudou: () => void; // recarregar a lista após repor
}

// Vista de arquivados dentro do explorer: cada nota abre numa tab e tem Repor.
export function ArquivadosLista({ arquivados, onMudou }: ArquivadosListaProps) {
    const router = useRouter();
    const { abrirFicheiro, notificarWorkspaceMudou } = useWorkspace();

    if (arquivados.length === 0) {
        return <p className="px-3 py-2 text-xs text-muted-foreground">Sem notas arquivadas.</p>;
    }

    return (
        <ul className="py-1">
            {arquivados.map((n) => (
                <li
                    key={n.id}
                    className="group flex items-center justify-between pr-1 hover:bg-muted"
                >
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                            abrirFicheiro({
                                tipo: 'knowledge',
                                id: n.id,
                                chave: n.slug,
                                titulo: n.title,
                            });
                            router.push('/chat');
                        }}
                        title={n.title}
                        className="h-auto min-w-0 flex-1 justify-start gap-2 rounded-none py-1.5 pl-3 text-sm font-normal text-foreground hover:bg-transparent"
                    >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-destructive" />
                        <span className="truncate line-through decoration-muted-foreground/70">
                            {n.title}
                        </span>
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Repor"
                        aria-label="Repor"
                        onClick={() => {
                            void runClientAction(
                                {
                                    area: 'arquivados-lista',
                                    action: 'reporNota',
                                    meta: { slug: n.slug },
                                },
                                async () => {
                                    await reporNotaAction(n.slug);
                                    notificarWorkspaceMudou();
                                    onMudou();
                                    router.refresh();
                                },
                            );
                        }}
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:bg-success/10 hover:text-success"
                    >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                    </Button>
                </li>
            ))}
        </ul>
    );
}
