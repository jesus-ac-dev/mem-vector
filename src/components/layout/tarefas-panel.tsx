'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Lock, X } from 'lucide-react';

import { cn } from '@/lib/utils';
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
import { useWorkspace } from '@/components/layout/workspace-context';
import {
    apagarTarefa,
    concluirTarefa,
    criarTarefa,
    listarTarefasPainel,
    mudarEstadoTarefa,
} from '@/modules/tarefas/tarefas.actions';
import type { EstadoTarefa, PrioridadeTarefa, Tarefa } from '@/modules/tarefas/tarefas.schema';

// Painel de tarefas (#21, design do Carlos): vive na sidebar esquerda — lista
// das abertas, "+" no header do painel, footer com as concluídas. As tarefas
// NÃO abrem nos panes do meio. Drag pelo kanban vem na fatia do kanban.

const ESTADO_LABEL: Record<EstadoTarefa, string> = {
    backlog: 'Backlog',
    analise: 'Análise',
    desenvolvimento: 'Em Desenvolvimento',
    testes: 'Testes',
    documentacao: 'Documentação',
    terminado: 'Terminado',
};

const ESTADOS_ABERTOS: Exclude<EstadoTarefa, 'terminado'>[] = [
    'backlog',
    'analise',
    'desenvolvimento',
    'testes',
    'documentacao',
];

function corPrioridade(p: PrioridadeTarefa): string {
    if (p === 'alta') return 'bg-red-500';
    if (p === 'baixa') return 'bg-muted-foreground/40';
    return 'bg-primary/60';
}

// "ligar ao contabilista #zeta !alta" → titulo + projeto + prioridade.
export function parseNovaTarefa(texto: string): {
    titulo: string;
    projeto?: string;
    prioridade: PrioridadeTarefa;
} {
    let prioridade: PrioridadeTarefa = 'normal';
    let projeto: string | undefined;
    const titulo = texto
        .replace(/!(alta|baixa)\b/i, (_, p: string) => {
            prioridade = p.toLowerCase() as PrioridadeTarefa;
            return '';
        })
        .replace(/#([\p{L}\p{N}-]+)/u, (_, tag: string) => {
            projeto = tag;
            return '';
        })
        .replace(/\s+/g, ' ')
        .trim();
    return { titulo, projeto, prioridade };
}

export function TarefasPanel({
    criarAberto,
    onFecharCriar,
}: {
    criarAberto: boolean;
    onFecharCriar: () => void;
}) {
    const { workspaceVersion, notificarWorkspaceMudou } = useWorkspace();
    const [abertas, setAbertas] = useState<Tarefa[]>([]);
    const [concluidas, setConcluidas] = useState<Tarefa[]>([]);
    const [verConcluidas, setVerConcluidas] = useState(false);
    const [novoTexto, setNovoTexto] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelado = false;
        void runClientAction(
            { area: 'left-sidebar', action: 'listarTarefasPainel', meta: {} },
            () => listarTarefasPainel(),
        ).then((r) => {
            if (cancelado || !r) return;
            setAbertas(r.abertas);
            setConcluidas(r.concluidas);
        });
        return () => {
            cancelado = true;
        };
    }, [workspaceVersion]);

    useEffect(() => {
        if (criarAberto) inputRef.current?.focus();
    }, [criarAberto]);

    const abertasIds = new Set(abertas.map((t) => t.id));

    async function submeterNova() {
        const texto = novoTexto.trim();
        if (!texto) {
            onFecharCriar();
            return;
        }
        const { titulo, projeto, prioridade } = parseNovaTarefa(texto);
        if (!titulo) return;
        await runClientAction(
            { area: 'left-sidebar', action: 'criarTarefa', meta: { titulo } },
            () => criarTarefa({ titulo, projeto, prioridade, visibility: 'privado' }),
        );
        setNovoTexto('');
        onFecharCriar();
        notificarWorkspaceMudou();
    }

    function mutacao(action: string, meta: Record<string, unknown>, fn: () => Promise<unknown>) {
        void runClientAction({ area: 'left-sidebar', action, meta }, fn).then(() =>
            notificarWorkspaceMudou(),
        );
    }

    return (
        <div className="flex h-full flex-col">
            {criarAberto && (
                <div className="border-b p-2">
                    <Input
                        ref={inputRef}
                        value={novoTexto}
                        onChange={(e) => setNovoTexto(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') void submeterNova();
                            if (e.key === 'Escape') onFecharCriar();
                        }}
                        placeholder="tarefa #projeto !alta"
                        className="h-7 text-sm"
                    />
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto py-1">
                {abertas.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                        Sem tarefas em aberto.
                    </p>
                )}
                <ul className="space-y-0.5">
                    {abertas.map((t) => {
                        const bloqueada = Boolean(t.dependeDe && abertasIds.has(t.dependeDe));
                        return (
                            <li key={t.id} className="group px-2">
                                <div className="flex items-start gap-2 rounded px-1 py-1 hover:bg-muted">
                                    <span
                                        title={`Prioridade ${t.prioridade}`}
                                        className={cn(
                                            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                                            corPrioridade(t.prioridade),
                                        )}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm" title={t.titulo}>
                                            {t.titulo}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                                            <Select
                                                value={t.estado}
                                                onValueChange={(estado) =>
                                                    mutacao(
                                                        'mudarEstadoTarefa',
                                                        { id: t.id, estado },
                                                        () => mudarEstadoTarefa(t.id, estado),
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="h-5 w-36 border-none px-1 text-[0.65rem] shadow-none focus:ring-0">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ESTADOS_ABERTOS.map((e) => (
                                                        <SelectItem key={e} value={e}>
                                                            {ESTADO_LABEL[e]}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {t.projeto && <span>#{t.projeto}</span>}
                                            {bloqueada && (
                                                <span
                                                    title="Bloqueada por dependência em aberto"
                                                    className="inline-flex items-center gap-0.5"
                                                >
                                                    <Lock className="h-3 w-3" /> bloqueada
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            title={
                                                bloqueada
                                                    ? 'Bloqueada pela dependência'
                                                    : 'Concluir (regista no daily)'
                                            }
                                            disabled={bloqueada}
                                            onClick={() =>
                                                mutacao('concluirTarefa', { id: t.id }, () =>
                                                    concluirTarefa(t.id),
                                                )
                                            }
                                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                        >
                                            <Check className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            title="Apagar (apaga mesmo)"
                                            onClick={() =>
                                                mutacao('apagarTarefa', { id: t.id }, () =>
                                                    apagarTarefa(t.id),
                                                )
                                            }
                                            className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>

                {verConcluidas && (
                    <div className="mt-2 border-t pt-1">
                        {concluidas.length === 0 && (
                            <p className="px-3 py-2 text-xs text-muted-foreground">
                                Sem concluídas.
                            </p>
                        )}
                        <ul className="space-y-0.5">
                            {concluidas.map((t) => (
                                <li
                                    key={t.id}
                                    className="px-3 py-0.5 text-xs text-muted-foreground"
                                >
                                    <span className="line-through">{t.titulo}</span>
                                    {t.concluidaEm && (
                                        <span className="ml-1.5">
                                            ✅ {t.concluidaEm.slice(0, 10)}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Footer do painel (design do Carlos): alternar as concluídas. */}
            <div className="shrink-0 border-t px-2 py-1.5">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVerConcluidas((v) => !v)}
                    className="h-6 w-full justify-start px-1 text-xs text-muted-foreground"
                >
                    {verConcluidas
                        ? 'Esconder concluídas'
                        : `Ver concluídas (${concluidas.length})`}
                </Button>
            </div>
        </div>
    );
}
