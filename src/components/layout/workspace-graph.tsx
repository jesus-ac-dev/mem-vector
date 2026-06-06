'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/components/layout/workspace-context';
import { dadosGrafo } from '@/modules/workspace/workspace.actions';
import type { GrafoDados } from '@/modules/knowledge/knowledge.service';

// Client-only: o force-graph usa canvas/window, não pode renderizar no servidor.
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface NoGrafo {
    id: string;
    slug: string;
    title: string;
    group: string;
}

// Fatia 1 do grafo: render 2D dos nós (notas) + arestas (wikilinks), clicar abre
// a nota. Toggle 2D/3D e modal de cores/animate vêm nas fatias seguintes.
export function WorkspaceGraph() {
    const router = useRouter();
    const { abrirFicheiro } = useWorkspace();
    const containerRef = useRef<HTMLDivElement>(null);
    const [dim, setDim] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const [dados, setDados] = useState<GrafoDados | null>(null);

    useEffect(() => {
        let cancelado = false;
        void dadosGrafo().then((d) => {
            if (!cancelado) setDados(d);
        });
        return () => {
            cancelado = true;
        };
    }, []);

    // Mede o contentor (o force-graph precisa de width/height numéricos). O
    // ResizeObserver entrega a medição inicial, por isso não há setState síncrono.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setDim({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div ref={containerRef} className="h-full w-full overflow-hidden">
            {dados && dados.nodes.length > 0 && dim.w > 0 ? (
                <ForceGraph2D
                    graphData={dados}
                    width={dim.w}
                    height={dim.h}
                    nodeId="id"
                    nodeLabel="title"
                    nodeAutoColorBy="group"
                    nodeRelSize={4}
                    cooldownTicks={80}
                    onNodeClick={(node: object) => {
                        const n = node as NoGrafo;
                        abrirFicheiro({ tipo: 'knowledge', chave: n.slug, titulo: n.title });
                        router.push('/chat');
                    }}
                />
            ) : (
                <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                    {dados ? 'Sem notas para mostrar' : 'A carregar grafo…'}
                </div>
            )}
        </div>
    );
}
