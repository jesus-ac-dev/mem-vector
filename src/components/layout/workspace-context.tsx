'use client';

import { createContext, useContext, useState } from 'react';

// ──────────────────────────────────────────────
// Shape do ficheiro aberto no pane lateral
// ──────────────────────────────────────────────
export interface FicheiroAberto {
    tipo: 'knowledge' | 'daily';
    chave: string;
    titulo?: string;
}

interface WorkspaceContextValue {
    ficheiroAberto: FicheiroAberto | null;
    abrirFicheiro: (f: FicheiroAberto) => void;
    fecharFicheiro: () => void;
    conversaAberta: string | null;
    abrirConversa: (id: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
    const [ficheiroAberto, setFicheiroAberto] = useState<FicheiroAberto | null>(null);
    const [conversaAberta, setConversaAberta] = useState<string | null>(null);

    function abrirFicheiro(f: FicheiroAberto) {
        setFicheiroAberto(f);
    }

    function fecharFicheiro() {
        setFicheiroAberto(null);
    }

    function abrirConversa(id: string | null) {
        setConversaAberta(id);
    }

    return (
        <WorkspaceContext.Provider
            value={{ ficheiroAberto, abrirFicheiro, fecharFicheiro, conversaAberta, abrirConversa }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspace(): WorkspaceContextValue {
    const ctx = useContext(WorkspaceContext);
    if (!ctx) throw new Error('useWorkspace precisa de estar dentro de WorkspaceProvider');
    return ctx;
}
