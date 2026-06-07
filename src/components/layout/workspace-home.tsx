'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquarePlus, FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/layout/workspace-context';
import { criarNotaVazia } from '@/modules/workspace/workspace.actions';

// Home do workspace — aparece quando o chat e todas as tabs estão fechados.
// Estilo VSCode: ações ao centro para recomeçar.
export function WorkspaceHome() {
    const router = useRouter();
    const { abrirChat, abrirConversa, abrirFicheiro } = useWorkspace();
    const [criando, setCriando] = useState(false);

    function handleIniciarChat() {
        abrirConversa(null); // conversa nova
        abrirChat();
    }

    async function handleCriarNota() {
        if (criando) return;
        setCriando(true);
        try {
            const nota = await criarNotaVazia();
            abrirFicheiro({
                tipo: nota.tipo,
                id: nota.id,
                chave: nota.chave,
                titulo: nota.titulo,
                vistaInicial: 'editor',
            });
            router.refresh(); // atualiza o file-explorer (server) com a nota nova
        } finally {
            setCriando(false);
        }
    }

    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-8 p-6 duration-300 animate-in fade-in">
            <div className="text-center">
                <h1 className="text-2xl font-semibold tracking-tight">mem-vector</h1>
                <p className="mt-1 text-sm text-muted-foreground">O teu workspace agente-autor.</p>
            </div>

            <div className="flex w-56 flex-col gap-2">
                <Button
                    variant="outline"
                    onClick={handleIniciarChat}
                    className="justify-start gap-2"
                >
                    <MessageSquarePlus className="h-4 w-4" />
                    Iniciar chat
                </Button>
                <Button
                    variant="outline"
                    onClick={() => void handleCriarNota()}
                    disabled={criando}
                    className="justify-start gap-2"
                >
                    <FilePlus2 className="h-4 w-4" />
                    {criando ? 'A criar…' : 'Criar nota'}
                </Button>
            </div>
        </div>
    );
}
