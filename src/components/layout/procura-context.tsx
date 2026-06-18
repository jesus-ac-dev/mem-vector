'use client';

import { createContext, useContext, useState } from 'react';

export type ModoProcura = 'texto' | 'conceito';

// Estado da procura (#91) partilhado entre o INPUT (no header, centro) e o
// PAINEL de resultados (sidebar esquerda). São componentes irmãos no layout, daí
// o context que os envolve a ambos. O termo decide se a procura está "ativa"
// (esconde o explorer); o modo (Texto/Conceito) vive com os resultados no painel.
interface ProcuraContextValue {
    q: string;
    setQ: (q: string) => void;
    modo: ModoProcura;
    setModo: (m: ModoProcura) => void;
    ativa: boolean; // q não-vazio → resultados ocupam o painel
}

const ProcuraContext = createContext<ProcuraContextValue | null>(null);

export function ProcuraProvider({ children }: { children: React.ReactNode }) {
    const [q, setQ] = useState('');
    const [modo, setModo] = useState<ModoProcura>('texto');
    return (
        <ProcuraContext.Provider value={{ q, setQ, modo, setModo, ativa: q.trim().length > 0 }}>
            {children}
        </ProcuraContext.Provider>
    );
}

export function useProcura(): ProcuraContextValue {
    const ctx = useContext(ProcuraContext);
    if (!ctx) throw new Error('useProcura fora de <ProcuraProvider>');
    return ctx;
}
