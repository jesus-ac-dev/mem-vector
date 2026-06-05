import { listarKnowledge } from '@/modules/knowledge/knowledge.service';
import { KnowledgeSidebar } from './knowledge-sidebar';

export default async function KnowledgeLayout({ children }: { children: React.ReactNode }) {
    const notas = await listarKnowledge();

    return (
        <div className="flex h-full">
            {/* Sidebar — largura fixa, separada por borda */}
            <aside className="w-60 shrink-0 overflow-hidden border-r">
                <KnowledgeSidebar notas={notas} />
            </aside>

            {/* Painel de conteúdo */}
            <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
    );
}
