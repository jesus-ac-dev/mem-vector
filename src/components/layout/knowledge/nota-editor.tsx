'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CalendarDays, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { runClientAction } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    chaveNotaLinkavel,
    detetarGatilho,
    filtrarNotasParaLink,
    type NotaLinkavel,
} from '@/modules/workspace/wikilink-autocomplete';
import { criarNotaComTitulo } from '@/modules/workspace/workspace.actions';

interface NotaEditorProps {
    value: string;
    onChange: (v: string) => void;
    folderId?: string | null;
    onCancel?: () => void;
    placeholder?: string;
}

// Editor de Markdown com autocomplete de [[wikilinks]]. A lógica de deteção e
// filtro é pura (wikilink-autocomplete); aqui fica só o estado e o teclado.
export function NotaEditor({
    value,
    onChange,
    folderId = null,
    onCancel,
    placeholder,
}: NotaEditorProps) {
    const router = useRouter();
    const taRef = useRef<HTMLTextAreaElement>(null);
    const [notas, setNotas] = useState<NotaLinkavel[]>([]);
    const [termo, setTermo] = useState<string | null>(null); // null = dropdown fechado
    const [sel, setSel] = useState(0);
    const [menuPos, setMenuPos] = useState({ top: 32, left: 8 });

    useEffect(() => {
        let cancelled = false;
        // GET em vez de Server Action (padrão /api/file): loads de montagem por
        // action partem com "unexpected response" após recompile do dev server.
        void runClientAction({ area: 'nota-editor', action: 'listarNotasLinkaveis' }, async () => {
            const res = await fetch('/api/notas-linkaveis', {
                method: 'GET',
                headers: { accept: 'application/json' },
            });
            if (!res.ok) throw new Error(`notas linkáveis: HTTP ${res.status}`);
            return (await res.json()) as NotaLinkavel[];
        }).then((ns) => {
            if (!cancelled && ns) setNotas(ns);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const sugestoes = termo !== null ? filtrarNotasParaLink(notas, termo) : [];
    const podeCriar = termo !== null && termo.trim().length > 0;
    const totalOpcoes = sugestoes.length + (podeCriar ? 1 : 0);

    function calcularMenuPos(cursor: number) {
        const ta = taRef.current;
        if (!ta) return;
        const antes = ta.value.slice(0, cursor);
        const linha = antes.split('\n').length - 1;
        const coluna = antes.length - (antes.lastIndexOf('\n') + 1);
        const top = Math.max(8, linha * 20 + 28 - ta.scrollTop);
        const maxLeft = Math.max(8, ta.clientWidth - 288);
        const left = Math.min(Math.max(8, coluna * 8 + 8 - ta.scrollLeft), maxLeft);
        setMenuPos({ top, left });
    }

    function recalcular(texto: string, cursor: number) {
        const g = detetarGatilho(texto, cursor);
        setTermo(g ? g.termo : null);
        setSel(0);
        if (g) calcularMenuPos(cursor);
    }

    function fechar() {
        setTermo(null);
        setSel(0);
    }

    // Substitui o termo escrito (entre [[ e o cursor) por `texto]]` e repõe o cursor.
    // Lê o texto do DOM (ta.value), coerente com o cursor que também vem do DOM.
    function inserir(texto: string) {
        const ta = taRef.current;
        if (!ta) return;
        const cursor = ta.selectionStart;
        const atual = ta.value;
        const g = detetarGatilho(atual, cursor);
        if (!g) return fechar();
        const novo = atual.slice(0, g.inicio) + texto + ']]' + atual.slice(cursor);
        const pos = g.inicio + texto.length + 2;
        onChange(novo);
        fechar();
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(pos, pos);
        });
    }

    async function escolher(i: number) {
        if (i < sugestoes.length) {
            const nota = sugestoes[i];
            const target = nota.linkTarget ?? nota.titulo;
            inserir(target === nota.titulo ? target : `${target}|${nota.titulo}`);
            return;
        }
        // Última opção: criar nota nova com o termo.
        const t = (termo ?? '').trim();
        if (!t) return;
        inserir(t);
        await runClientAction(
            { area: 'nota-editor', action: 'criarNotaComTitulo', meta: { titulo: t, folderId } },
            () => criarNotaComTitulo(t, folderId),
        );
        router.refresh();
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Escape' && (termo === null || totalOpcoes === 0)) {
            e.preventDefault();
            onCancel?.();
            return;
        }
        if (termo === null || totalOpcoes === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((s) => (s + 1) % totalOpcoes);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((s) => (s - 1 + totalOpcoes) % totalOpcoes);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            void runClientAction(
                { area: 'nota-editor', action: 'escolherTeclado', meta: { sel } },
                () => escolher(sel),
            );
        } else if (e.key === 'Escape') {
            e.preventDefault();
            fechar();
        }
    }

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <Textarea
                ref={taRef}
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    recalcular(e.target.value, e.target.selectionStart);
                }}
                onClick={(e) => recalcular(value, e.currentTarget.selectionStart)}
                onKeyUp={(e) => {
                    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
                        recalcular(value, e.currentTarget.selectionStart);
                    }
                }}
                onKeyDown={onKeyDown}
                onBlur={() => setTimeout(fechar, 120)}
                className="min-h-0 flex-1 resize-none font-mono text-sm"
                placeholder={placeholder}
            />
            {termo !== null && totalOpcoes > 0 && (
                <ul
                    className="absolute z-20 max-h-60 w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
                    style={{ top: menuPos.top, left: menuPos.left }}
                >
                    {sugestoes.map((n, i) => {
                        const Icon = n.tipo === 'daily' ? CalendarDays : FileText;
                        return (
                            <li key={chaveNotaLinkavel(n)}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() =>
                                        void runClientAction(
                                            {
                                                area: 'nota-editor',
                                                action: 'escolherSugestao',
                                                meta: { i },
                                            },
                                            () => escolher(i),
                                        )
                                    }
                                    className={cn(
                                        'h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-left text-sm font-normal',
                                        i === sel
                                            ? 'bg-accent text-accent-foreground'
                                            : 'hover:bg-muted',
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0">
                                        <span className="block truncate">{n.titulo}</span>
                                        {n.caminho && n.caminho !== n.titulo && (
                                            <span className="block truncate text-[0.7rem] text-muted-foreground">
                                                {n.caminho}
                                            </span>
                                        )}
                                    </span>
                                </Button>
                            </li>
                        );
                    })}
                    {podeCriar && (
                        <li>
                            <Button
                                type="button"
                                variant="ghost"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() =>
                                    void runClientAction(
                                        {
                                            area: 'nota-editor',
                                            action: 'criarPorSugestao',
                                            meta: { index: sugestoes.length },
                                        },
                                        () => escolher(sugestoes.length),
                                    )
                                }
                                className={cn(
                                    'h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-left text-sm font-normal',
                                    sel === sugestoes.length
                                        ? 'bg-accent text-accent-foreground'
                                        : 'hover:bg-muted',
                                )}
                            >
                                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">Criar «{termo?.trim()}»</span>
                            </Button>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
