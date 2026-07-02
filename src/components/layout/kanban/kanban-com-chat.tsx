'use client';

import { useState } from 'react';
import { ChevronsDown, ChevronsUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChatContent } from '@/components/layout/chat/chat-content';
import { KanbanBoard } from '@/components/layout/kanban/kanban-board';
import { CorridaDoObjeto } from '@/components/layout/kanban/corrida-do-objeto';
import type { Tarefa } from '@/modules/tarefas/tarefas.schema';

// Kanban + chat do rodapé com proporções INVERTÍVEIS (#129 ronda 3, decisão do
// Carlos): o double-click num cartão com issue abre a conversa do objeto no
// rodapé (erro OU observability — não há modal) e o espaço vertical troca com
// animação (kanban encolhe, conversa cresce). O toggle no canto direito inverte
// à mão a qualquer momento. O ChatContent fica montado (hidden) para a conversa
// com o agente não se perder ao alternar.
export function KanbanComChat() {
    const [corrida, setCorrida] = useState<Tarefa | null>(null);
    const [expandido, setExpandido] = useState(false);

    function abrirCorrida(t: Tarefa) {
        setCorrida(t);
        setExpandido(true); // observability ativa → o feed merece o espaço
    }

    function fecharCorrida() {
        setCorrida(null);
        setExpandido(false);
    }

    return (
        <div
            className={cn(
                'grid h-full grid-cols-1 overflow-hidden transition-[grid-template-rows] duration-300',
                expandido ? 'grid-rows-[20rem_1fr]' : 'grid-rows-[1fr_20rem]',
            )}
        >
            <div className="min-h-0 overflow-hidden">
                <KanbanBoard onAbrirCorrida={abrirCorrida} />
            </div>
            <div className="relative min-h-0 border-t">
                {/* Toggle do espaço vertical — canto direito (pedido do smoke). */}
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="absolute -top-3.5 right-3 z-10 h-7 w-7 rounded-full border bg-background p-0 shadow-sm"
                    title={
                        expandido
                            ? 'Encolher o chat (kanban maior)'
                            : 'Crescer o chat (kanban menor)'
                    }
                    onClick={() => setExpandido((v) => !v)}
                >
                    {expandido ? (
                        <ChevronsDown className="h-3.5 w-3.5" />
                    ) : (
                        <ChevronsUp className="h-3.5 w-3.5" />
                    )}
                </Button>
                {corrida && (
                    <div className="h-full">
                        <CorridaDoObjeto
                            key={corrida.id}
                            tarefa={corrida}
                            onFechar={fecharCorrida}
                            onDiagnosticar={() => {
                                // O diagnóstico corre no chat normal do agente: fecha o
                                // feed (o prefill do kill-switch já foi emitido pelo board).
                                setCorrida(null);
                            }}
                        />
                    </div>
                )}
                <div className={cn('h-full', corrida && 'hidden')}>
                    <ChatContent rodape />
                </div>
            </div>
        </div>
    );
}
