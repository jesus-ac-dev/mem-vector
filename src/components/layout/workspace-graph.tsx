'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Play, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dataPt } from '@/lib/datas';
import { runClientAction } from '@/lib/client-error-log';
import {
    construirGraphData,
    instantesDoGrafo,
    ligaAoNo,
    nascimentoDeLink,
    nascimentosDoGrafo,
    type GraphDataView,
    type NoGrafoView,
} from '@/lib/grafo';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/layout/workspace-context';
import { GrafoConfig } from '@/components/layout/grafo-config';
import { getJson } from '@/lib/api-get';
import type { GrafoDados } from '@/modules/knowledge/knowledge.service';
import type {
    ForceGraphMethods as Metodos2D,
    ForceGraphProps as Props2D,
    NodeObject as No2D,
    LinkObject as Link2D,
} from 'react-force-graph-2d';
import type {
    ForceGraphMethods as Metodos3D,
    ForceGraphProps as Props3D,
    NodeObject as No3D,
    LinkObject as Link3D,
} from 'react-force-graph-3d';

type Ref2D = React.RefObject<Metodos2D<No2D, Link2D> | undefined>;
type Ref3D = React.RefObject<Metodos3D<No3D, Link3D> | undefined>;

// Client-only: o force-graph usa canvas/WebGL/window, não renderiza no servidor.
// O 3D (three.js) só é carregado quando o utilizador escolhe 3D. O next/dynamic
// não encaminha refs, por isso cada wrapper expõe a instância via prop grafoRef
// (precisamos dela para centrar a câmara no nó ativo).
const ForceGraph2D = dynamic(
    () =>
        import('react-force-graph-2d').then((mod) => {
            const FG = mod.default;
            function FG2DComRef({
                grafoRef,
                ...props
            }: Props2D<No2D, Link2D> & { grafoRef?: Ref2D }) {
                return <FG {...props} ref={grafoRef} />;
            }
            return FG2DComRef;
        }),
    { ssr: false },
);
const ForceGraph3D = dynamic(
    () =>
        import('react-force-graph-3d').then((mod) => {
            const FG = mod.default;
            function FG3DComRef({
                grafoRef,
                ...props
            }: Props3D<No3D, Link3D> & { grafoRef?: Ref3D }) {
                return <FG {...props} ref={grafoRef} />;
            }
            return FG3DComRef;
        }),
    { ssr: false },
);

type Modo = '2D' | '3D';

// Tem de bater certo com nodeRelSize: o hit-area default usa sqrt(val)*relSize,
// desenhar com outro raio descola o clique da bola.
const RAIO_REL = 4;

// Grafo do conhecimento à Obsidian: nós = notas (bola proporcional ao tamanho
// do ficheiro), arestas = wikilinks. Toggle 2D/3D (2D default), botão Play
// (timelapse: o grafo cresce pela data de criação, à Obsidian), clicar num nó abre a nota. O nó ativo pinta-se com a cor
// extrema do tema (#fff em dark, #000 em light — nenhuma outra bola as usa) e a
// vista centra-se nele. O graphData NUNCA é reconstruído por mudança de ficheiro
// ativo: o force-graph muta nós e links (posições, refs), reconstruir a cada
// mudança reiniciava o layout ("explosão") e deixava arestas soltas.
export function WorkspaceGraph() {
    const router = useRouter();
    const { abrirFicheiro, abrirConversa, ficheiroAtivo, workspaceVersion } = useWorkspace();
    const { resolvedTheme } = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const fg2dRef: Ref2D = useRef(undefined);
    const fg3dRef: Ref3D = useRef(undefined);
    const [dim, setDim] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    // null = ainda a carregar. Construído fora do render para poder semear as
    // posições do snapshot anterior — um refetch não re-explode o layout.
    const [graphData, setGraphData] = useState<GraphDataView | null>(null);
    const [modo, setModo] = useState<Modo>('2D');
    // Timelapse à Obsidian: cursor temporal (epoch ms); null = tudo visível.
    // Esconder por visibilidade mantém o layout estável (lição do grafo v2:
    // nunca reconstruir/remontar — era o "reinício" da animação antiga).
    const [cursorAnim, setCursorAnim] = useState<number | null>(null);
    const timelapseRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [config, setConfig] = useState(false);

    useEffect(() => {
        let cancelado = false;
        void runClientAction({ area: 'workspace-graph', action: 'dadosGrafo' }, () =>
            getJson<GrafoDados>('/api/grafo'),
        ).then((d) => {
            if (!cancelado && d) setGraphData((prev) => construirGraphData(d, prev ?? undefined));
        });
        return () => {
            cancelado = true;
        };
    }, [workspaceVersion, refreshKey]);

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
        const n = node as NoGrafoView;
        if (n.group === 'fantasma') return; // não há nota para abrir
        if (n.group === 'conversa') {
            abrirConversa(n.id);
            router.push('/chat');
            return;
        }
        if (n.group === 'daily') {
            abrirFicheiro({ tipo: 'daily', id: n.id, chave: n.slug, titulo: dataPt(n.title) });
        } else {
            abrirFicheiro({ tipo: 'knowledge', id: n.id, chave: n.slug, titulo: n.title });
        }
        router.push('/chat');
    }

    const activeNodeId = ficheiroAtivo?.split(':')[1] ?? null;

    const escuro = resolvedTheme === 'dark';
    const corAtivo = escuro ? '#ffffff' : '#000000';
    const corAresta2D = escuro ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.25)';
    const corAresta3D = escuro ? '#bbbbbb' : '#555555';
    // Arestas do ficheiro ativo iluminam-se (à Obsidian no hover, aqui na seleção)
    const corArestaAtiva2D = escuro ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.8)';
    const corArestaAtiva3D = corAtivo;
    // Fantasmas (links por criar / notas arquivadas) ficam esbatidos
    const corFantasma2D = escuro ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.4)';
    const corFantasma3D = escuro ? '#475569' : '#94a3b8';

    // Centra a vista no nó ativo (se já tem posição do layout). Só desloca, não
    // mexe no zoom — câmara a manter distância no 3D para não ser agressivo.
    const centrarNoAtivo = useCallback(() => {
        if (!activeNodeId) return;
        const node = graphData?.nodes.find((n) => n.id === activeNodeId);
        if (!node || node.x == null || node.y == null) return;
        if (modo === '2D') {
            fg2dRef.current?.centerAt(node.x, node.y, 800);
        } else {
            const z = node.z ?? 0;
            const dist = 280;
            const ratio = 1 + dist / (Math.hypot(node.x, node.y, z) || 1);
            fg3dRef.current?.cameraPosition(
                { x: node.x * ratio, y: node.y * ratio, z: z * ratio },
                { x: node.x, y: node.y, z },
                1200,
            );
        }
    }, [activeNodeId, graphData, modo]);

    useEffect(() => {
        centrarNoAtivo();
    }, [centrarNoAtivo]);

    // Primeiro cooldown de cada vista (montagem, troca 2D/3D, animate): enquadra
    // o grafo inteiro com folga em vez do zoom default agressivo; com ficheiro
    // ativo, centra-o depois do enquadramento.
    const vistaAjustada = useRef(false);
    useEffect(() => {
        vistaAjustada.current = false;
    }, [modo]);
    const aoEstabilizar = useCallback(() => {
        if (!vistaAjustada.current) {
            vistaAjustada.current = true;
            const fg = modo === '2D' ? fg2dRef.current : fg3dRef.current;
            fg?.zoomToFit(600, 60);
            // centrar só depois do enquadramento, senão as duas animações lutam
            if (activeNodeId) setTimeout(centrarNoAtivo, 700);
            return;
        }
        centrarNoAtivo();
    }, [activeNodeId, centrarNoAtivo, modo]);

    // Nascimento de cada nó (data de criação; fantasma herda da 1ª origem).
    const nascimentos = useMemo(
        () => (graphData ? nascimentosDoGrafo(graphData) : new Map<string, number>()),
        [graphData],
    );

    // Timelapse: avança o cursor pelos instantes de criação (~5s no total).
    function iniciarTimelapse() {
        if (!graphData?.nodes.length) return;
        const instantes = instantesDoGrafo(nascimentos);
        if (instantes.length < 2) return;
        if (timelapseRef.current) clearInterval(timelapseRef.current);
        let i = 0;
        setCursorAnim(instantes[0]);
        const passo = Math.max(60, Math.min(400, Math.round(5000 / instantes.length)));
        timelapseRef.current = setInterval(() => {
            i += 1;
            if (i >= instantes.length) {
                if (timelapseRef.current) clearInterval(timelapseRef.current);
                timelapseRef.current = null;
                setCursorAnim(null); // fim: tudo visível
                return;
            }
            setCursorAnim(instantes[i]);
        }, passo);
    }
    useEffect(
        () => () => {
            if (timelapseRef.current) clearInterval(timelapseRef.current);
        },
        [],
    );

    const props = {
        graphData: graphData ?? { nodes: [], links: [] },
        width: dim.w,
        height: dim.h,
        nodeId: 'id',
        nodeLabel: 'title',
        nodeColor: (n: object) => {
            const no = n as NoGrafoView;
            if (no.id === activeNodeId) return corAtivo;
            if (no.group === 'fantasma') return corFantasma3D;
            return no.color;
        },
        nodeVal: (n: object) => (n as NoGrafoView).val ?? 1,
        nodeRelSize: RAIO_REL,
        cooldownTicks: 80,
        onNodeClick: abrirNo,
        onEngineStop: aoEstabilizar,
        nodeVisibility: (n: object) =>
            cursorAnim === null || (nascimentos.get((n as NoGrafoView).id) ?? 0) <= cursorAnim,
        linkVisibility: (l: object) =>
            cursorAnim === null ||
            nascimentoDeLink(l as { source?: unknown; target?: unknown }, nascimentos) <=
                cursorAnim,
    };

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden">
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
                <div className="flex items-center gap-0.5">
                    <Button
                        variant="ghost"
                        size="icon"
                        title="Cores do grafo"
                        aria-label="Cores do grafo"
                        onClick={() => setConfig(true)}
                        className="h-5 w-5 text-muted-foreground"
                    >
                        <Palette className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        title="Ver o grafo a crescer no tempo"
                        aria-label="Ver o grafo a crescer no tempo"
                        onClick={iniciarTimelapse}
                        className="h-5 w-5 text-muted-foreground"
                    >
                        <Play className="h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Corpo do grafo */}
            <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden">
                {graphData && graphData.nodes.length > 0 && dim.w > 0 ? (
                    modo === '2D' ? (
                        <ForceGraph2D
                            key="2d"
                            grafoRef={fg2dRef}
                            {...props}
                            linkColor={(l: object) =>
                                ligaAoNo(l, activeNodeId) ? corArestaAtiva2D : corAresta2D
                            }
                            linkWidth={(l: object) => (ligaAoNo(l, activeNodeId) ? 2.4 : 1.4)}
                            nodeCanvasObject={(node, ctx, globalScale) => {
                                const n = node as NoGrafoView;
                                // O canvas custom ignora o nodeVisibility — sem este
                                // guard as bolas apareciam antes do seu instante.
                                if (
                                    cursorAnim !== null &&
                                    (nascimentos.get(n.id) ?? 0) > cursorAnim
                                ) {
                                    return;
                                }
                                const ativo = n.id === activeNodeId;
                                const raio = Math.sqrt(n.val ?? 1) * RAIO_REL;
                                ctx.beginPath();
                                ctx.arc(n.x ?? 0, n.y ?? 0, raio, 0, 2 * Math.PI);
                                ctx.fillStyle = ativo
                                    ? corAtivo
                                    : n.group === 'fantasma'
                                      ? corFantasma2D
                                      : n.color;
                                ctx.fill();
                                if (ativo) {
                                    // halo a destacar a bola ativa do resto
                                    ctx.beginPath();
                                    ctx.arc(
                                        n.x ?? 0,
                                        n.y ?? 0,
                                        raio + 3 / globalScale,
                                        0,
                                        2 * Math.PI,
                                    );
                                    ctx.lineWidth = 1.5 / globalScale;
                                    ctx.strokeStyle = corAtivo;
                                    ctx.stroke();
                                }
                            }}
                        />
                    ) : (
                        <ForceGraph3D
                            key="3d"
                            grafoRef={fg3dRef}
                            {...props}
                            backgroundColor="rgba(0,0,0,0)"
                            linkColor={(l: object) =>
                                ligaAoNo(l, activeNodeId) ? corArestaAtiva3D : corAresta3D
                            }
                            linkOpacity={0.55}
                            linkWidth={(l: object) => (ligaAoNo(l, activeNodeId) ? 1.8 : 0.8)}
                            nodeOpacity={0.9}
                        />
                    )
                ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                        {graphData ? 'Sem notas para mostrar' : 'A carregar grafo…'}
                    </div>
                )}
            </div>

            {config && (
                <GrafoConfig
                    onFechar={() => setConfig(false)}
                    onMudou={() => setRefreshKey((k) => k + 1)}
                />
            )}
        </div>
    );
}
