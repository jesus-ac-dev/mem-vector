import { KanbanComChat } from '@/components/layout/kanban/kanban-com-chat';

// Kanban (#58): vista das tarefas pelas 6 colunas canónicas; filtrado a um
// projeto é a página do projeto v1. Visão fechada (2026-06-05): em modo
// kanban o board ocupa o centro e o chat desce para a faixa inferior. #129
// ronda 3: as proporções verticais INVERTEM (toggle/observability) e o
// double-click num cartão abre a conversa do objeto no rodapé.
export default function KanbanPage() {
    return <KanbanComChat />;
}
