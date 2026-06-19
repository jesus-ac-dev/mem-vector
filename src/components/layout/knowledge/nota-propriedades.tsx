'use client';

import { useState } from 'react';
import { X, Plus, Tags, Eye, CalendarDays, Text } from 'lucide-react';
import { runClientAction } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { atualizarPropriedadesAction } from '@/modules/workspace/workspace.actions';
import type { PropriedadesNota, Visibilidade } from '@/modules/knowledge/knowledge.props';

const VISIBILIDADE_LABEL: Record<Visibilidade, string> = {
    privado: 'Privado',
    protected: 'Protegido (grupo)',
    publico: 'Público',
};

// Bloco de propriedades à Obsidian no topo da nota (decisão 2026-06-06):
// tags + summary (frontmatter), visibility (coluna) e created (read-only).
export function NotaPropriedades({
    propriedades,
    onMudou,
}: {
    propriedades: PropriedadesNota;
    onMudou?: () => void;
}) {
    const [props, setProps] = useState(propriedades);
    const [novaTag, setNovaTag] = useState('');
    const [editandoSummary, setEditandoSummary] = useState(false);
    const [rascunhoSummary, setRascunhoSummary] = useState(props.summary ?? '');
    const [guardando, setGuardando] = useState(false);

    function guardar(input: { tags?: string[]; summary?: string; visibility?: Visibilidade }) {
        if (guardando) return;
        setGuardando(true);
        void runClientAction(
            { area: 'nota-propriedades', action: 'atualizarPropriedades', meta: { id: props.id } },
            async () => {
                const res = await atualizarPropriedadesAction(props.id, input);
                setProps(res);
                onMudou?.();
            },
        ).finally(() => setGuardando(false));
    }

    function adicionarTag() {
        const tag = novaTag.trim();
        if (!tag) return;
        setNovaTag('');
        guardar({ tags: [...props.tags, tag] });
    }

    return (
        <div className="mb-4 space-y-1.5 border-b pb-3 text-xs">
            {/* Tags */}
            <div className="flex items-center gap-2">
                <span className="flex w-24 shrink-0 items-center gap-1.5 text-muted-foreground">
                    <Tags className="h-3 w-3" /> Tags
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    {props.tags.map((tag) => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-accent-foreground"
                        >
                            #{tag}
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={guardando}
                                onClick={() =>
                                    guardar({ tags: props.tags.filter((t) => t !== tag) })
                                }
                                title={`Remover ${tag}`}
                                aria-label={`Remover tag ${tag}`}
                                className="h-3.5 w-3.5 rounded-full text-muted-foreground hover:text-destructive"
                            >
                                <X className="h-2.5 w-2.5" />
                            </Button>
                        </span>
                    ))}
                    <div className="flex items-center gap-0.5">
                        <Input
                            value={novaTag}
                            onChange={(e) => setNovaTag(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    adicionarTag();
                                }
                            }}
                            placeholder="tag…"
                            disabled={guardando}
                            className="h-5 w-20 border-none px-1 text-xs shadow-none focus-visible:ring-0"
                        />
                        {novaTag.trim() && (
                            <Button
                                variant="ghost"
                                size="icon"
                                disabled={guardando}
                                onClick={adicionarTag}
                                title="Adicionar tag"
                                aria-label="Adicionar tag"
                                className="h-4 w-4 text-muted-foreground"
                            >
                                <Plus className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Summary */}
            <div className="flex items-center gap-2">
                <span className="flex w-24 shrink-0 items-center gap-1.5 text-muted-foreground">
                    <Text className="h-3 w-3" /> Resumo
                </span>
                {editandoSummary ? (
                    <Input
                        value={rascunhoSummary}
                        autoFocus
                        onChange={(e) => setRascunhoSummary(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                setEditandoSummary(false);
                                guardar({ summary: rascunhoSummary });
                            }
                            if (e.key === 'Escape') {
                                setRascunhoSummary(props.summary ?? '');
                                setEditandoSummary(false);
                            }
                        }}
                        onBlur={() => {
                            setEditandoSummary(false);
                            if (rascunhoSummary !== (props.summary ?? ''))
                                guardar({ summary: rascunhoSummary });
                        }}
                        disabled={guardando}
                        className="h-5 flex-1 border-none px-1 text-xs shadow-none focus-visible:ring-0"
                    />
                ) : (
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setRascunhoSummary(props.summary ?? '');
                            setEditandoSummary(true);
                        }}
                        className="h-5 min-w-0 flex-1 justify-start truncate rounded-none px-1 text-xs font-normal text-foreground"
                    >
                        {props.summary ?? (
                            <span className="italic text-muted-foreground">Sem resumo</span>
                        )}
                    </Button>
                )}
            </div>

            {/* Visibility */}
            <div className="flex items-center gap-2">
                <span className="flex w-24 shrink-0 items-center gap-1.5 text-muted-foreground">
                    <Eye className="h-3 w-3" /> Visibilidade
                </span>
                <Select
                    value={props.visibility}
                    disabled={guardando}
                    onValueChange={(v) => guardar({ visibility: v as Visibilidade })}
                >
                    <SelectTrigger className="h-5 w-40 border-none px-1 text-xs shadow-none focus:ring-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(VISIBILIDADE_LABEL) as Visibilidade[]).map((v) => (
                            <SelectItem key={v} value={v} className="text-xs">
                                {VISIBILIDADE_LABEL[v]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Created (read-only) */}
            <div className="flex items-center gap-2">
                <span className="flex w-24 shrink-0 items-center gap-1.5 text-muted-foreground">
                    <CalendarDays className="h-3 w-3" /> Criada
                </span>
                <span className="text-foreground">
                    {new Date(props.createdAt).toLocaleString('pt-PT', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                    })}
                </span>
            </div>
        </div>
    );
}
