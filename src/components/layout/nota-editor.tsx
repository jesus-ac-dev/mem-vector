'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CalendarDays, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    detetarGatilho,
    filtrarNotasParaLink,
    type NotaLinkavel,
} from '@/modules/workspace/wikilink-autocomplete';
import { listarNotasLinkaveis, criarNotaComTitulo } from '@/modules/workspace/workspace.actions';

interface NotaEditorProps {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}

// Editor de Markdown com autocomplete de [[wikilinks]]. A lógica de deteção e
// filtro é pura (wikilink-autocomplete); aqui fica só o estado e o teclado.
export function NotaEditor({ value, onChange, placeholder }: NotaEditorProps) {
    const router = useRouter();
    const taRef = useRef<HTMLTextAreaElement>(null);
    const [notas, setNotas] = useState<NotaLinkavel[]>([]);
    const [termo, setTermo] = useState<string | null>(null); // null = dropdown fechado
    const [sel, setSel] = useState(0);

    useEffect(() => {
        let cancelled = false;
        listarNotasLinkaveis()
            .then((ns) => {
                if (!cancelled) setNotas(ns);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const sugestoes = termo !== null ? filtrarNotasParaLink(notas, termo) : [];
    const podeCriar = termo !== null && termo.trim().length > 0;
    const totalOpcoes = sugestoes.length + (podeCriar ? 1 : 0);

    function recalcular(texto: string, cursor: number) {
        const g = detetarGatilho(texto, cursor);
        setTermo(g ? g.termo : null);
        setSel(0);
    }

    function fechar() {
        setTermo(null);
        setSel(0);
    }

    // Substitui o termo escrito (entre [[ e o cursor) por `texto]]` e repõe o cursor.
    function inserir(texto: string) {
        const ta = taRef.current;
        if (!ta) return;
        const cursor = ta.selectionStart;
        const g = detetarGatilho(value, cursor);
        if (!g) return fechar();
        const novo = value.slice(0, g.inicio) + texto + ']]' + value.slice(cursor);
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
            inserir(sugestoes[i].titulo);
            return;
        }
        // Última opção: criar nota nova com o termo.
        const t = (termo ?? '').trim();
        if (!t) return;
        inserir(t);
        await criarNotaComTitulo(t);
        router.refresh();
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (termo === null || totalOpcoes === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((s) => (s + 1) % totalOpcoes);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((s) => (s - 1 + totalOpcoes) % totalOpcoes);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            void escolher(sel);
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
                <ul className="absolute bottom-2 left-2 z-20 max-h-60 w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {sugestoes.map((n, i) => {
                        const Icon = n.tipo === 'daily' ? CalendarDays : FileText;
                        return (
                            <li key={`${n.tipo}:${n.chave}`}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => void escolher(i)}
                                    className={cn(
                                        'h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-left text-sm font-normal',
                                        i === sel
                                            ? 'bg-accent text-accent-foreground'
                                            : 'hover:bg-muted',
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="truncate">{n.titulo}</span>
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
                                onClick={() => void escolher(sugestoes.length)}
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
