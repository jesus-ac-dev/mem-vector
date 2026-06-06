'use client';

import { createContext, useContext, useState } from 'react';

// ──────────────────────────────────────────────
// Shape do ficheiro aberto (uma tab no editor)
// ──────────────────────────────────────────────
export interface FicheiroAberto {
    tipo: 'knowledge' | 'daily';
    chave: string;
    titulo?: string;
    vistaInicial?: 'editor'; // abrir já em modo edição (ex.: "Criar Nota")
}

// Identidade única da tab: tipo+chave (um knowledge e um daily podem partilhar chave).
export function tabKey(f: Pick<FicheiroAberto, 'tipo' | 'chave'>): string {
    return `${f.tipo}:${f.chave}`;
}

interface WorkspaceContextValue {
    // ── tabs de ficheiros ──
    ficheirosAbertos: FicheiroAberto[];
    ficheiroAtivo: string | null; // tabKey do ativo (ou null)
    abrirFicheiro: (f: FicheiroAberto) => void; // abre nova tab ou foca a existente
    fecharFicheiro: (key: string) => void; // fecha a tab pelo tabKey
    activarFicheiro: (key: string) => void;
    // ── painel do chat ──
    chatAberto: boolean;
    abrirChat: () => void;
    fecharChat: () => void;
    // ── conversa ativa ──
    conversaAberta: string | null;
    abrirConversa: (id: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
    const [ficheirosAbertos, setFicheirosAbertos] = useState<FicheiroAberto[]>([]);
    const [ficheiroAtivo, setFicheiroAtivo] = useState<string | null>(null);
    const [chatAberto, setChatAberto] = useState(true);
    const [conversaAberta, setConversaAberta] = useState<string | null>(null);

    function abrirFicheiro(f: FicheiroAberto) {
        const key = tabKey(f);
        setFicheirosAbertos((prev) => (prev.some((x) => tabKey(x) === key) ? prev : [...prev, f]));
        setFicheiroAtivo(key);
    }

    function fecharFicheiro(key: string) {
        setFicheirosAbertos((prev) => {
            const idx = prev.findIndex((x) => tabKey(x) === key);
            if (idx === -1) return prev;
            const resto = prev.filter((x) => tabKey(x) !== key);
            // Se fechámos a tab ativa, passa para a vizinha (anterior, senão a seguinte).
            setFicheiroAtivo((ativo) => {
                if (ativo !== key) return ativo;
                if (resto.length === 0) return null;
                const vizinha = resto[Math.max(0, idx - 1)] ?? resto[0];
                return tabKey(vizinha);
            });
            return resto;
        });
    }

    function activarFicheiro(key: string) {
        setFicheiroAtivo(key);
    }

    function abrirChat() {
        setChatAberto(true);
    }

    function fecharChat() {
        setChatAberto(false);
    }

    function abrirConversa(id: string | null) {
        setConversaAberta(id);
        // Abrir uma conversa traz o chat à frente (não faz sentido fechado).
        if (id !== null) setChatAberto(true);
    }

    return (
        <WorkspaceContext.Provider
            value={{
                ficheirosAbertos,
                ficheiroAtivo,
                abrirFicheiro,
                fecharFicheiro,
                activarFicheiro,
                chatAberto,
                abrirChat,
                fecharChat,
                conversaAberta,
                abrirConversa,
            }}
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
