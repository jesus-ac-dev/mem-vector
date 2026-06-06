'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useWorkspace, tabKey } from '@/components/layout/workspace-context';
import type { Arvore, NoArvore, NotaItem } from '@/modules/folders/folders.tree';

export interface DailyItem {
    id: string;
    slug: string;
    title: string;
}

interface FileExplorerProps {
    arvore: Arvore;
    dailies: DailyItem[];
}

// Link de uma nota knowledge (abre numa tab).
function NotaLink({ nota, depth }: { nota: NotaItem; depth: number }) {
    const router = useRouter();
    const { ficheiroAtivo, abrirFicheiro } = useWorkspace();
    const isActive = ficheiroAtivo === tabKey({ tipo: 'knowledge', chave: nota.slug });
    return (
        <Button
            type="button"
            variant="ghost"
            onClick={() => {
                abrirFicheiro({ tipo: 'knowledge', chave: nota.slug, titulo: nota.title });
                router.push('/chat');
            }}
            title={nota.title}
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

// Nó de pasta, recursivo (subpastas + notas).
function FolderNode({ no, depth }: { no: NoArvore; depth: number }) {
    const [open, setOpen] = useState(true);
    const Chevron = open ? ChevronDown : ChevronRight;
    return (
        <div>
            <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen((v) => !v)}
                title={no.pasta.name}
                style={{ paddingLeft: `${depth * 16}px` }}
                className="flex h-auto w-full items-center justify-start gap-1 rounded-none py-1.5 pr-3 text-sm text-foreground hover:bg-muted"
            >
                <Chevron className="h-3 w-3 shrink-0" />
                <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{no.pasta.name}</span>
            </Button>
            {open && (
                <div>
                    {no.subpastas.map((sub) => (
                        <FolderNode key={sub.pasta.id} no={sub} depth={depth + 1} />
                    ))}
                    {no.notas.map((nota) => (
                        <NotaLink key={nota.id} nota={nota} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

// Secção colapsável de topo (Knowledge / Daily Notes).
function Seccao({ label, children }: { label: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(true);
    const Chevron = open ? ChevronDown : ChevronRight;
    return (
        <div>
            <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen((v) => !v)}
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

export function FileExplorer({ arvore, dailies }: FileExplorerProps) {
    const vazioKnowledge = arvore.raizPastas.length === 0 && arvore.raizNotas.length === 0;
    return (
        <nav className="flex h-full flex-col overflow-y-auto">
            <div className="flex-1 overflow-y-auto py-1">
                <Seccao label="Knowledge">
                    {arvore.raizPastas.map((no) => (
                        <FolderNode key={no.pasta.id} no={no} depth={1} />
                    ))}
                    {arvore.raizNotas.map((nota) => (
                        <NotaLink key={nota.id} nota={nota} depth={1} />
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
