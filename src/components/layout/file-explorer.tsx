'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
    mover: (slug: string, folderId: string | null) => void;
    renomearPasta: (id: string, nomeAtual: string) => void;
    renomearNota: (slug: string, tituloAtual: string) => void;
    selecionarPasta: (id: string | null) => void;
    selecionadaId: string | null;
}

const DRAG_TIPO = 'application/x-mem-nota-slug';

// Link de uma nota knowledge (abre numa tab; arrastável para mover; duplo-clique renomeia).
function NotaLink({ nota, depth, ops }: { nota: NotaItem; depth: number; ops: Ops }) {
    const router = useRouter();
    const { ficheiroAtivo, abrirFicheiro } = useWorkspace();
    const isActive = ficheiroAtivo === tabKey({ tipo: 'knowledge', chave: nota.slug });
    return (
        <Button
            type="button"
            variant="ghost"
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DRAG_TIPO, nota.slug)}
            onClick={() => {
                abrirFicheiro({ tipo: 'knowledge', chave: nota.slug, titulo: nota.title });
                router.push('/chat');
            }}
            onDoubleClick={() => ops.renomearNota(nota.slug, nota.title)}
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
    const Chevron = open ? ChevronDown : ChevronRight;
    return (
        <div>
            <Button
                type="button"
                variant="ghost"
                onClick={() => {
                    ops.selecionarPasta(no.pasta.id);
                    setOpen((v) => !v);
                }}
                onDoubleClick={() => ops.renomearPasta(no.pasta.id, no.pasta.name)}
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
                    if (slug) ops.mover(slug, no.pasta.id);
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
                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{no.pasta.name}</span>
            </Button>
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
    onDropRaiz?: (slug: string) => void;
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
                          if (slug) onDropRaiz(slug);
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
    const isActive = ficheiroAtivo === tabKey({ tipo: 'daily', chave: daily.slug });
    return (
        <Button
            type="button"
            variant="ghost"
            onClick={() => {
                abrirFicheiro({ tipo: 'daily', chave: daily.slug, titulo: daily.title });
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
}

export function FileExplorer({
    arvore,
    dailies,
    pastaSelecionada,
    onSelecionarPasta,
}: FileExplorerProps) {
    const router = useRouter();

    const ops: Ops = {
        mover: (slug, folderId) => {
            void moverNotaParaPasta(slug, folderId).then(() => router.refresh());
        },
        renomearPasta: (id, nomeAtual) => {
            const novo = window.prompt('Renomear pasta:', nomeAtual);
            if (novo?.trim() && novo.trim() !== nomeAtual) {
                void renomearPastaAction(id, novo.trim()).then(() => router.refresh());
            }
        },
        renomearNota: (slug, tituloAtual) => {
            const novo = window.prompt('Renomear nota:', tituloAtual);
            if (novo?.trim() && novo.trim() !== tituloAtual) {
                void renomearNotaAction(slug, novo.trim()).then(() => router.refresh());
            }
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
                    onDropRaiz={(slug) => ops.mover(slug, null)}
                    onClickLabel={() => onSelecionarPasta(null)}
                >
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
