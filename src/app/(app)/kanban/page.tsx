import { KanbanBoard } from '@/components/layout/kanban/kanban-board';
import { ChatContent } from '@/components/layout/chat/chat-content';

// Kanban (#58): vista das tarefas pelas 6 colunas canónicas; filtrado a um
// projeto é a página do projeto v1. Visão fechada (2026-06-05): em modo
// kanban o board ocupa o centro e o chat desce para a faixa inferior, ao
// nível do grafo (esq.) e do calendário (dir.) — a mesma altura (h-80).
export default function KanbanPage() {
    return (
        <div className="flex h-full flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
                <KanbanBoard />
            </div>
            <div className="h-80 shrink-0 border-t">
                <ChatContent rodape />
            </div>
        </div>
    );
}
