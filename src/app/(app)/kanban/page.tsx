import { KanbanBoard } from '@/components/layout/kanban-board';

// Kanban (#58): vista das tarefas pelas 6 colunas canónicas; filtrado a um
// projeto é a página do projeto v1. O board é client (drag + estado local).
export default function KanbanPage() {
    return <KanbanBoard />;
}
