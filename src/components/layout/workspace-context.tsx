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
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
    const [ficheiroAberto, setFicheiroAberto] = useState<FicheiroAberto | null>(null);

    function abrirFicheiro(f: FicheiroAberto) {
        setFicheiroAberto(f);
    }

    function fecharFicheiro() {
        setFicheiroAberto(null);
    }

    return (
        <WorkspaceContext.Provider value={{ ficheiroAberto, abrirFicheiro, fecharFicheiro }}>
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspace(): WorkspaceContextValue {
    const ctx = useContext(WorkspaceContext);
    if (!ctx) throw new Error('useWorkspace precisa de estar dentro de WorkspaceProvider');
    return ctx;
}
