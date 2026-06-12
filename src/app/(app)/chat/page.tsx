'use client';

import { ChatContent } from '@/components/layout/chat-content';
import { FilePane } from '@/components/layout/file-pane';
import { WorkspaceHome } from '@/components/layout/workspace-home';
import { useWorkspace } from '@/components/layout/workspace-context';

export default function ChatPage() {
    const { chatAberto, ficheirosAbertos } = useWorkspace();
    const temFicheiros = ficheirosAbertos.length > 0;

    // Tudo fechado → Home (estilo VSCode, ações ao centro).
    if (!chatAberto && !temFicheiros) {
        return <WorkspaceHome />;
    }

    return (
        <div className="flex h-full overflow-hidden">
            {/* Chat — 50% quando há ficheiros, senão preenche */}
            {chatAberto && (
                <div
                    className={
                        temFicheiros
                            ? 'flex flex-1 basis-0 overflow-hidden'
                            : 'flex flex-1 overflow-hidden'
                    }
                >
                    <ChatContent />
                </div>
            )}

            {/* Tabs de ficheiros — 50% quando o chat está aberto, senão preenche */}
            {temFicheiros && (
                <div
                    className={
                        chatAberto
                            ? 'flex flex-1 basis-0 overflow-hidden'
                            : 'flex flex-1 overflow-hidden'
                    }
                >
                    <FilePane />
                </div>
            )}
        </div>
    );
}
