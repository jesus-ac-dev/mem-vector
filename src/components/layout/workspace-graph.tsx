'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/layout/workspace-context';
import { dadosGrafo } from '@/modules/workspace/workspace.actions';
import type { GrafoDados } from '@/modules/knowledge/knowledge.service';

// Client-only: o force-graph usa canvas/WebGL/window, não renderiza no servidor.
// O 3D (three.js) só é carregado quando o utilizador escolhe 3D.
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

type Modo = '2D' | '3D';

interface NoGrafo {
    id: string;
    slug: string;
    title: string;
    group: string;
}

// Grafo do conhecimento: nós = notas, arestas = wikilinks. Toggle 2D/3D (2D
// default) e botão animate (re-corre o layout). Clicar num nó abre a nota.
// Modal de cores por pasta fica para quando existirem pastas reais (hoje só há
// o grupo 'knowledge', colorir um grupo só não acrescenta).
export function WorkspaceGraph() {
    const router = useRouter();
    const { abrirFicheiro } = useWorkspace();
    const containerRef = useRef<HTMLDivElement>(null);
    const [dim, setDim] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const [dados, setDados] = useState<GrafoDados | null>(null);
    const [modo, setModo] = useState<Modo>('2D');
    const [animKey, setAnimKey] = useState(0); // bump → remonta o grafo → re-anima o layout

    useEffect(() => {
        let cancelado = false;
        void dadosGrafo().then((d) => {
            if (!cancelado) setDados(d);
        });
        return () => {
            cancelado = true;
        };
    }, []);

    // Mede o contentor do grafo (o force-graph precisa de width/height numéricos).
    // O ResizeObserver entrega a medição inicial → sem setState síncrono no effect.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setDim({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    function abrirNo(node: object) {
        const n = node as NoGrafo;
        abrirFicheiro({ tipo: 'knowledge', chave: n.slug, titulo: n.title });
        router.push('/chat');
    }

    const props = {
        graphData: dados ?? { nodes: [], links: [] },
        width: dim.w,
        height: dim.h,
        nodeId: 'id',
        nodeLabel: 'title',
        nodeAutoColorBy: 'group',
        nodeRelSize: 4,
        cooldownTicks: 80,
        onNodeClick: abrirNo,
    };

    return (
        <div className="flex h-full w-full flex-col overflow-hidden">
            {/* Barra de controlos: 2D/3D à esquerda, animate à direita */}
            <div className="flex h-7 shrink-0 items-center justify-between border-b px-1.5">
                <div className="flex items-center gap-0.5">
                    {(['2D', '3D'] as const).map((m) => (
                        <Button
                            key={m}
                            variant="ghost"
                            size="sm"
                            onClick={() => setModo(m)}
                            className={cn(
                                'h-5 px-1.5 text-[0.65rem] text-muted-foreground',
                                modo === m && 'bg-accent text-accent-foreground',
                            )}
                        >
                            {m}
                        </Button>
                    ))}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    title="Animar layout"
                    aria-label="Animar layout"
                    onClick={() => setAnimKey((k) => k + 1)}
                    className="h-5 w-5 text-muted-foreground"
                >
                    <Play className="h-3 w-3" />
                </Button>
            </div>

            {/* Corpo do grafo */}
            <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden">
                {dados && dados.nodes.length > 0 && dim.w > 0 ? (
                    modo === '2D' ? (
                        <ForceGraph2D key={`2d-${animKey}`} {...props} />
                    ) : (
                        <ForceGraph3D key={`3d-${animKey}`} {...props} />
                    )
                ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                        {dados ? 'Sem notas para mostrar' : 'A carregar grafo…'}
                    </div>
                )}
            </div>
        </div>
    );
}
