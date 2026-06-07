'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspace, tabKey } from '@/components/layout/workspace-context';
import {
    moverNotaParaPasta,
    renomearPastaAction,
    renomearNotaAction,
} from '@/modules/workspace/workspace.actions';
import type { Arvore, NoArvore, NotaItem } from '@/modules/folders/folders.tree';

export interface DailyItem {
    id: string;
    slug: string;
    title: string;
}

interface Ops {
    mover: (slug: string, folderId: string | null, id?: string) => void;
    renomearPasta: (id: string, nomeAtual: string) => void;
    renomearNota: (slug: string, tituloAtual: string, id?: string) => void;
    selecionarPasta: (id: string | null) => void;
    selecionadaId: string | null;
}

const DRAG_TIPO = 'application/x-mem-nota-slug';
const DRAG_ID = 'application/x-mem-nota-id';

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
            style={{ marginLeft: `${depth * 16}px` }}
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
                e.dataTransfer.setData(DRAG_TIPO, nota.slug);
                e.dataTransfer.setData(DRAG_ID, nota.id);
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
            title={`${nota.title} (duplo-clique para renomear)`}
            style={{ paddingLeft: `${depth * 16}px` }}
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
    const Chevron = open ? ChevronDown : ChevronRight;
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
                    onClick={() => {
                        ops.selecionarPasta(no.pasta.id);
                        setOpen((v) => !v);
                    }}
                    onDoubleClick={() => setEditando(true)}
                    onDragOver={(e) => {
                        if (e.dataTransfer.types.includes(DRAG_TIPO)) {
                            e.preventDefault();
                            setOver(true);
                        }
                    }}
                    onDragLeave={() => setOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setOver(false);
                        const slug = e.dataTransfer.getData(DRAG_TIPO);
                        const id = e.dataTransfer.getData(DRAG_ID) || undefined;
                        if (slug) ops.mover(slug, no.pasta.id, id);
                    }}
                    title={`${no.pasta.name} (clique seleciona, duplo-clique renomeia)`}
                    style={{ paddingLeft: `${depth * 16}px` }}
                    className={cn(
                        'flex h-auto w-full items-center justify-start gap-1 rounded-none py-1.5 pr-3 text-sm text-foreground hover:bg-muted',
                        (over || ops.selecionadaId === no.pasta.id) &&
                            'bg-accent text-accent-foreground',
                    )}
                >
                    <Chevron className="h-3 w-3 shrink-0" />
                    {no.pasta.color ? (
                        <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: no.pasta.color }}
                            aria-hidden
                        />
                    ) : (
                        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{no.pasta.name}</span>
                </Button>
            )}
            {open && (
                <div>
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
    onClickLabel,
    children,
}: {
    label: string;
    onDropRaiz?: (slug: string, id?: string) => void;
    onClickLabel?: () => void;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(true);
    const [over, setOver] = useState(false);
    const Chevron = open ? ChevronDown : ChevronRight;
    return (
        <div
            onDragOver={
                onDropRaiz
                    ? (e) => {
                          if (e.dataTransfer.types.includes(DRAG_TIPO)) {
                              e.preventDefault();
                              setOver(true);
                          }
                      }
                    : undefined
            }
            onDragLeave={onDropRaiz ? () => setOver(false) : undefined}
            onDrop={
                onDropRaiz
                    ? (e) => {
                          e.preventDefault();
                          setOver(false);
                          const slug = e.dataTransfer.getData(DRAG_TIPO);
                          const id = e.dataTransfer.getData(DRAG_ID) || undefined;
                          if (slug) onDropRaiz(slug, id);
                      }
                    : undefined
            }
            className={cn(over && 'bg-accent/30')}
        >
            <Button
                type="button"
                variant="ghost"
                onClick={() => {
                    onClickLabel?.();
                    setOpen((v) => !v);
                }}
                className="flex h-auto w-full items-center justify-start gap-1 rounded-none px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
                <Chevron className="h-3 w-3 shrink-0" />
                <span>{label}</span>
            </Button>
            {open && <div>{children}</div>}
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
            className={cn(
                'h-auto w-full justify-start truncate rounded-none px-6 py-1.5 text-sm transition-colors',
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
    criandoPasta: boolean;
    onCriarPasta: (nome: string) => void;
    onCancelarCriarPasta: () => void;
}

export function FileExplorer({
    arvore,
    dailies,
    pastaSelecionada,
    onSelecionarPasta,
    criandoPasta,
    onCriarPasta,
    onCancelarCriarPasta,
}: FileExplorerProps) {
    const router = useRouter();

    const ops: Ops = {
        mover: (slug, folderId, id) => {
            void moverNotaParaPasta(slug, folderId, id).then(() => router.refresh());
        },
        renomearPasta: (id, novoNome) => {
            void renomearPastaAction(id, novoNome).then(() => router.refresh());
        },
        renomearNota: (slug, novoTitulo, id) => {
            void renomearNotaAction(slug, novoTitulo, id).then(() => router.refresh());
        },
        selecionarPasta: onSelecionarPasta,
        selecionadaId: pastaSelecionada,
    };

    const vazioKnowledge = arvore.raizPastas.length === 0 && arvore.raizNotas.length === 0;
    return (
        <nav className="flex h-full flex-col overflow-y-auto">
            <div className="flex-1 overflow-y-auto py-1">
                <Seccao
                    label="Knowledge"
                    onDropRaiz={(slug, id) => ops.mover(slug, null, id)}
                    onClickLabel={() => onSelecionarPasta(null)}
                >
                    {criandoPasta && (
                        <InlineInput
                            valorInicial=""
                            depth={1}
                            onConfirm={onCriarPasta}
                            onCancel={onCancelarCriarPasta}
                        />
                    )}
                    {arvore.raizPastas.map((no) => (
                        <FolderNode key={no.pasta.id} no={no} depth={1} ops={ops} />
                    ))}
                    {arvore.raizNotas.map((nota) => (
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
