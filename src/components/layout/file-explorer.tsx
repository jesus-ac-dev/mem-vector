'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { runClientAction } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace, tabKey } from '@/components/layout/workspace-context';
import {
    moverNotaParaPasta,
    moverPastaParaPasta,
    renomearNotaPorH1Action,
    renomearPastaAction,
} from '@/modules/workspace/workspace.actions';
import {
    tagsDaArvore,
    filtrarArvorePorTag,
    type Arvore,
    type NoArvore,
    type NotaItem,
} from '@/modules/folders/folders.tree';

export interface DailyItem {
    id: string;
    slug: string;
    title: string;
}

interface Ops {
    mover: (slug: string, folderId: string | null, id?: string) => void;
    moverPasta: (id: string, parentId: string | null) => void;
    renomearPasta: (id: string, nomeAtual: string) => void;
    renomearNota: (slug: string, tituloAtual: string, id?: string) => void;
    selecionarPasta: (id: string | null) => void;
    selecionadaId: string | null;
    criandoPasta: boolean;
    onCriarPasta: (nome: string) => void;
    onCancelarCriarPasta: () => void;
    forceOpenFolderIds: string[];
    onFolderManualToggle: (id: string) => void;
}

export const DRAG_NOTA_SLUG = 'application/x-mem-nota-slug';
export const DRAG_NOTA_ID = 'application/x-mem-nota-id';
export const DRAG_PASTA_ID = 'application/x-mem-pasta-id';
const ROOT_ITEM_PADDING = 36;
const TREE_LEVEL_INDENT = 28;

function paddingNivel(depth: number) {
    return ROOT_ITEM_PADDING + Math.max(0, depth - 1) * TREE_LEVEL_INDENT + 'px';
}

// Input inline para criar/renomear na própria árvore (substitui window.prompt).
// Autofocus + seleciona o texto; Enter confirma, Esc cancela, blur confirma.
function InlineInput({
    valorInicial,
    depth,
    onConfirm,
    onCancel,
}: {
    valorInicial: string;
    depth: number;
    onConfirm: (valor: string) => void;
    onCancel: () => void;
}) {
    const [valor, setValor] = useState(valorInicial);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);

    function confirmar() {
        const v = valor.trim();
        if (v) onConfirm(v);
        else onCancel();
    }

    return (
        <Input
            ref={ref}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmar();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                }
            }}
            onBlur={confirmar}
            style={{ marginLeft: paddingNivel(depth) }}
            className="h-7 rounded-none py-1 text-sm"
        />
    );
}

// Link de uma nota knowledge (abre numa tab; arrastável para mover; duplo-clique renomeia).
function NotaLink({ nota, depth, ops }: { nota: NotaItem; depth: number; ops: Ops }) {
    const router = useRouter();
    const { ficheiroAtivo, abrirFicheiro } = useWorkspace();
    const [editando, setEditando] = useState(false);
    const isActive = ficheiroAtivo === tabKey({ tipo: 'knowledge', id: nota.id, chave: nota.slug });

    if (editando) {
        return (
            <InlineInput
                valorInicial={nota.title}
                depth={depth}
                onConfirm={(titulo) => {
                    setEditando(false);
                    if (titulo !== nota.title) ops.renomearNota(nota.slug, titulo, nota.id);
                }}
                onCancel={() => setEditando(false)}
            />
        );
    }

    return (
        <Button
            type="button"
            variant="ghost"
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_NOTA_SLUG, nota.slug);
                e.dataTransfer.setData(DRAG_NOTA_ID, nota.id);
            }}
            onClick={() => {
                abrirFicheiro({
                    tipo: 'knowledge',
                    id: nota.id,
                    chave: nota.slug,
                    titulo: nota.title,
                });
                router.push('/chat');
            }}
            onDoubleClick={() => setEditando(true)}
            title={`${nota.title} (duplo-clique renomeia o primeiro #)`}
            style={{ paddingLeft: paddingNivel(depth) }}
            className={cn(
                'h-auto w-full justify-start truncate rounded-none py-1.5 pr-3 text-sm transition-colors',
                isActive ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted',
            )}
        >
            {nota.title}
        </Button>
    );
}

// Nó de pasta, recursivo. Alvo de drop (mover nota para cá) e duplo-clique para renomear.
function FolderNode({ no, depth, ops }: { no: NoArvore; depth: number; ops: Ops }) {
    const [open, setOpen] = useState(true);
    const [over, setOver] = useState(false);
    const [editando, setEditando] = useState(false);
    const criandoAqui = ops.criandoPasta && ops.selecionadaId === no.pasta.id;
    const aberto = open || criandoAqui || ops.forceOpenFolderIds.includes(no.pasta.id);
    const Chevron = aberto ? ChevronDown : ChevronRight;

    return (
        <div>
            {editando ? (
                <InlineInput
                    valorInicial={no.pasta.name}
                    depth={depth}
                    onConfirm={(nome) => {
                        setEditando(false);
                        if (nome !== no.pasta.name) ops.renomearPasta(no.pasta.id, nome);
                    }}
                    onCancel={() => setEditando(false)}
                />
            ) : (
                <Button
                    type="button"
                    variant="ghost"
                    draggable
                    onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_PASTA_ID, no.pasta.id);
                    }}
                    onClick={() => {
                        ops.selecionarPasta(no.pasta.id);
                        ops.onFolderManualToggle(no.pasta.id);
                        setOpen(!aberto);
                    }}
                    onDoubleClick={() => setEditando(true)}
                    onDragOver={(e) => {
                        if (
                            e.dataTransfer.types.includes(DRAG_NOTA_SLUG) ||
                            e.dataTransfer.types.includes(DRAG_PASTA_ID)
                        ) {
                            e.preventDefault();
                            setOver(true);
                        }
                    }}
                    onDragLeave={() => setOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOver(false);
                        const pastaId = e.dataTransfer.getData(DRAG_PASTA_ID);
                        if (pastaId) {
                            if (pastaId !== no.pasta.id) {
                                ops.moverPasta(pastaId, no.pasta.id);
                                setOpen(true);
                            }
                            return;
                        }
                        const slug = e.dataTransfer.getData(DRAG_NOTA_SLUG);
                        const id = e.dataTransfer.getData(DRAG_NOTA_ID) || undefined;
                        if (slug) {
                            ops.mover(slug, no.pasta.id, id);
                            setOpen(true);
                        }
                    }}
                    title={`${no.pasta.name} (clique seleciona, duplo-clique renomeia)`}
                    style={{ paddingLeft: paddingNivel(depth) }}
                    className={cn(
                        'flex h-auto w-full items-center justify-start gap-1 rounded-none border-l-2 border-transparent py-1.5 pr-3 text-sm text-foreground hover:bg-muted',
                        over && 'bg-accent/30',
                        ops.selecionadaId === no.pasta.id && 'border-primary bg-transparent',
                    )}
                >
                    <Chevron className="h-3 w-3 shrink-0" />
                    <span
                        className="truncate"
                        style={no.pasta.color ? { color: no.pasta.color } : undefined}
                    >
                        {no.pasta.name}
                    </span>
                </Button>
            )}
            {aberto && (
                <div>
                    {criandoAqui && (
                        <InlineInput
                            valorInicial=""
                            depth={depth + 1}
                            onConfirm={(nome) => {
                                setOpen(true);
                                ops.onCriarPasta(nome);
                            }}
                            onCancel={ops.onCancelarCriarPasta}
                        />
                    )}
                    {no.subpastas.map((sub) => (
                        <FolderNode key={sub.pasta.id} no={sub} depth={depth + 1} ops={ops} />
                    ))}
                    {no.notas.map((nota) => (
                        <NotaLink key={nota.id} nota={nota} depth={depth + 1} ops={ops} />
                    ))}
                </div>
            )}
        </div>
    );
}

// Secção colapsável de topo (Knowledge / Daily Notes).
function Seccao({
    label,
    onDropRaiz,
    onDropPastaRaiz,
    onClickLabel,
    open: controlledOpen,
    onOpenChange,
    forceOpen = false,
    children,
}: {
    label: string;
    onDropRaiz?: (slug: string, id?: string) => void;
    onDropPastaRaiz?: (id: string) => void;
    onClickLabel?: () => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    forceOpen?: boolean;
    children: React.ReactNode;
}) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(true);
    const [over, setOver] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const aberto = open || forceOpen;
    const Chevron = aberto ? ChevronDown : ChevronRight;

    return (
        <div
            onDragOver={
                onDropRaiz || onDropPastaRaiz
                    ? (e) => {
                          if (
                              e.dataTransfer.types.includes(DRAG_NOTA_SLUG) ||
                              e.dataTransfer.types.includes(DRAG_PASTA_ID)
                          ) {
                              e.preventDefault();
                              setOver(true);
                          }
                      }
                    : undefined
            }
            onDragLeave={onDropRaiz || onDropPastaRaiz ? () => setOver(false) : undefined}
            onDrop={
                onDropRaiz || onDropPastaRaiz
                    ? (e) => {
                          e.preventDefault();
                          setOver(false);
                          const pastaId = e.dataTransfer.getData(DRAG_PASTA_ID);
                          if (pastaId) {
                              onDropPastaRaiz?.(pastaId);
                              return;
                          }
                          const slug = e.dataTransfer.getData(DRAG_NOTA_SLUG);
                          const id = e.dataTransfer.getData(DRAG_NOTA_ID) || undefined;
                          if (slug) onDropRaiz?.(slug, id);
                      }
                    : undefined
            }
            className={cn(over && 'bg-accent/30')}
        >
            <Button
                type="button"
                variant="ghost"
                onClick={() => {
                    const nextOpen = !aberto;
                    onClickLabel?.();
                    onOpenChange?.(nextOpen);
                    if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
                }}
                className="flex h-auto w-full items-center justify-start gap-1 rounded-none px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
                <Chevron className="h-3 w-3 shrink-0" />
                <span>{label}</span>
            </Button>
            {aberto && <div>{children}</div>}
        </div>
    );
}

function DailyLink({ daily }: { daily: DailyItem }) {
    const router = useRouter();
    const { ficheiroAtivo, abrirFicheiro } = useWorkspace();
    const isActive = ficheiroAtivo === tabKey({ tipo: 'daily', id: daily.id, chave: daily.slug });
    return (
        <Button
            type="button"
            variant="ghost"
            onClick={() => {
                abrirFicheiro({
                    tipo: 'daily',
                    id: daily.id,
                    chave: daily.slug,
                    titulo: daily.title,
                });
                router.push('/chat');
            }}
            title={daily.title}
            style={{ paddingLeft: paddingNivel(1) }}
            className={cn(
                'h-auto w-full justify-start truncate rounded-none py-1.5 pr-3 text-sm transition-colors',
                isActive ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted',
            )}
        >
            {daily.title}
        </Button>
    );
}

interface FileExplorerProps {
    arvore: Arvore;
    dailies: DailyItem[];
    pastaSelecionada: string | null;
    onSelecionarPasta: (id: string | null) => void;
    knowledgeOpen: boolean;
    onKnowledgeOpenChange: (open: boolean) => void;
    criandoPasta: boolean;
    onCriarPasta: (nome: string) => void;
    onCancelarCriarPasta: () => void;
    forceOpenFolderIds: string[];
    onFolderManualToggle: (id: string) => void;
}

export function FileExplorer({
    arvore,
    dailies,
    pastaSelecionada,
    onSelecionarPasta,
    knowledgeOpen,
    onKnowledgeOpenChange,
    criandoPasta,
    onCriarPasta,
    onCancelarCriarPasta,
    forceOpenFolderIds,
    onFolderManualToggle,
}: FileExplorerProps) {
    const router = useRouter();
    const { atualizarFicheiroAberto, notificarWorkspaceMudou } = useWorkspace();

    const ops: Ops = {
        mover: (slug, folderId, id) => {
            void runClientAction(
                {
                    area: 'file-explorer',
                    action: 'moverNotaParaPasta',
                    meta: { slug, folderId, id },
                },
                async () => {
                    await moverNotaParaPasta(slug, folderId, id);
                    notificarWorkspaceMudou();
                    router.refresh();
                },
            );
        },
        moverPasta: (id, parentId) => {
            void runClientAction(
                { area: 'file-explorer', action: 'moverPastaParaPasta', meta: { id, parentId } },
                async () => {
                    await moverPastaParaPasta(id, parentId);
                    notificarWorkspaceMudou();
                    router.refresh();
                },
            );
        },
        renomearPasta: (id, novoNome) => {
            void runClientAction(
                { area: 'file-explorer', action: 'renomearPasta', meta: { id, novoNome } },
                async () => {
                    await renomearPastaAction(id, novoNome);
                    notificarWorkspaceMudou();
                    router.refresh();
                },
            );
        },
        renomearNota: (slug, novoTitulo, id) => {
            void runClientAction(
                {
                    area: 'file-explorer',
                    action: 'renomearNotaPorH1',
                    meta: { slug, novoTitulo, id },
                },
                async () => {
                    const res = await renomearNotaPorH1Action(slug, novoTitulo, id);
                    atualizarFicheiroAberto(tabKey({ tipo: 'knowledge', id, chave: slug }), {
                        chave: res.chave,
                        titulo: res.titulo,
                    });
                    notificarWorkspaceMudou();
                    router.refresh();
                },
            );
        },
        selecionarPasta: onSelecionarPasta,
        selecionadaId: pastaSelecionada,
        criandoPasta,
        onCriarPasta,
        onCancelarCriarPasta,
        forceOpenFolderIds,
        onFolderManualToggle,
    };

    // Filtro por tag (propriedades das notas): clicar numa tag mostra só as
    // notas com essa tag; pastas sem match são podadas.
    const [tagAtiva, setTagAtiva] = useState<string | null>(null);
    const tags = tagsDaArvore(arvore);
    const arvoreVisivel = tagAtiva ? filtrarArvorePorTag(arvore, tagAtiva) : arvore;

    const vazioKnowledge =
        arvoreVisivel.raizPastas.length === 0 && arvoreVisivel.raizNotas.length === 0;
    return (
        <nav className="flex h-full flex-col overflow-y-auto">
            {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 border-b px-3 py-1.5">
                    {tags.map((tag) => {
                        const ativa = tagAtiva?.toLowerCase() === tag.toLowerCase();
                        return (
                            <Button
                                key={tag}
                                variant="ghost"
                                size="sm"
                                onClick={() => setTagAtiva(ativa ? null : tag)}
                                title={ativa ? 'Limpar filtro' : `Filtrar por ${tag}`}
                                className={cn(
                                    'h-5 rounded-full px-2 text-xs font-normal',
                                    ativa
                                        ? 'bg-accent text-accent-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                #{tag}
                            </Button>
                        );
                    })}
                </div>
            )}
            <div className="flex-1 overflow-y-auto py-1">
                <Seccao
                    label="Knowledge"
                    onDropRaiz={(slug, id) => ops.mover(slug, null, id)}
                    onDropPastaRaiz={(id) => ops.moverPasta(id, null)}
                    onClickLabel={() => onSelecionarPasta(null)}
                    open={knowledgeOpen}
                    onOpenChange={onKnowledgeOpenChange}
                    forceOpen={criandoPasta && pastaSelecionada === null}
                >
                    {criandoPasta && pastaSelecionada === null && (
                        <InlineInput
                            valorInicial=""
                            depth={1}
                            onConfirm={onCriarPasta}
                            onCancel={onCancelarCriarPasta}
                        />
                    )}
                    {arvoreVisivel.raizPastas.map((no) => (
                        <FolderNode key={no.pasta.id} no={no} depth={1} ops={ops} />
                    ))}
                    {arvoreVisivel.raizNotas.map((nota) => (
                        <NotaLink key={nota.id} nota={nota} depth={1} ops={ops} />
                    ))}
                    {vazioKnowledge && (
                        <p className="px-6 py-1.5 text-xs text-muted-foreground">Sem itens.</p>
                    )}
                </Seccao>
                <Seccao label="Daily Notes">
                    {dailies.map((d) => (
                        <DailyLink key={d.id} daily={d} />
                    ))}
                    {dailies.length === 0 && (
                        <p className="px-6 py-1.5 text-xs text-muted-foreground">Sem itens.</p>
                    )}
                </Seccao>
            </div>
        </nav>
    );
}
