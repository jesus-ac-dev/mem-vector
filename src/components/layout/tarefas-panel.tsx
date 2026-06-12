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
import {
    detetarGatilhoTarefa,
    parseNovaTarefa,
    sugestoesParaGatilho,
    type GatilhoTarefa,
} from '@/modules/tarefas/tarefas-quickadd';
import type { EstadoTarefa, PrioridadeTarefa, Tarefa } from '@/modules/tarefas/tarefas.schema';

// Painel de tarefas (#21/#51, design do Carlos): vive na sidebar esquerda —
// quick-add à la Obsidian (tokens com autocomplete), filtros de estado/#tag,
// lista das abertas já ordenada pelo servidor, footer com as concluídas.

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
    const [gatilho, setGatilho] = useState<GatilhoTarefa | null>(null);
    const [sel, setSel] = useState(0);
    const [filtroEstado, setFiltroEstado] = useState<string>('todos');
    const [filtroProjeto, setFiltroProjeto] = useState<string>('todos');
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
    const projetos = [
        ...new Set(
            [...abertas, ...concluidas].map((t) => t.projeto).filter((p): p is string => !!p),
        ),
    ].sort((a, b) => a.localeCompare(b, 'pt'));

    const visiveis = abertas.filter(
        (t) =>
            (filtroEstado === 'todos' || t.estado === filtroEstado) &&
            (filtroProjeto === 'todos' || t.projeto === filtroProjeto),
    );

    const sugestoes = gatilho ? sugestoesParaGatilho(gatilho, projetos) : [];

    function recalcularGatilho(texto: string, cursor: number) {
        setGatilho(detetarGatilhoTarefa(texto, cursor));
        setSel(0);
    }

    // Substitui o termo escrito (entre o símbolo e o cursor) pela sugestão.
    function inserirSugestao(s: string) {
        const el = inputRef.current;
        if (!el) return;
        const cursor = el.selectionStart ?? el.value.length;
        const g = detetarGatilhoTarefa(el.value, cursor);
        if (!g) return setGatilho(null);
        const novo = el.value.slice(0, g.inicio + 1) + s + ' ' + el.value.slice(cursor);
        const pos = g.inicio + 1 + s.length + 1;
        setNovoTexto(novo);
        setGatilho(null);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(pos, pos);
        });
    }

    async function submeterNova() {
        const texto = novoTexto.trim();
        if (!texto) {
            onFecharCriar();
            return;
        }
        const { titulo, projeto, prioridade, dataFim, descricao } = parseNovaTarefa(texto);
        if (!titulo) return;
        await runClientAction(
            { area: 'left-sidebar', action: 'criarTarefa', meta: { titulo } },
            () =>
                criarTarefa({
                    titulo,
                    projeto,
                    prioridade,
                    dataFim,
                    descricao,
                    visibility: 'privado',
                }),
        );
        setNovoTexto('');
        setGatilho(null);
        onFecharCriar();
        notificarWorkspaceMudou();
    }

    function onKeyDownNova(e: React.KeyboardEvent<HTMLInputElement>) {
        if (gatilho && sugestoes.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => (s + 1) % sugestoes.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => (s - 1 + sugestoes.length) % sugestoes.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                inserirSugestao(sugestoes[sel]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setGatilho(null);
                return;
            }
        }
        if (e.key === 'Enter') void submeterNova();
        if (e.key === 'Escape') onFecharCriar();
    }

    function mutacao(action: string, meta: Record<string, unknown>, fn: () => Promise<unknown>) {
        void runClientAction({ area: 'left-sidebar', action, meta }, fn).then(() =>
            notificarWorkspaceMudou(),
        );
    }

    return (
        <div className="flex h-full flex-col">
            {criarAberto && (
                <div className="relative border-b p-2">
                    <Input
                        ref={inputRef}
                        value={novoTexto}
                        onChange={(e) => {
                            setNovoTexto(e.target.value);
                            recalcularGatilho(e.target.value, e.target.selectionStart ?? 0);
                        }}
                        onClick={(e) =>
                            recalcularGatilho(novoTexto, e.currentTarget.selectionStart ?? 0)
                        }
                        onKeyDown={onKeyDownNova}
                        onBlur={() => setTimeout(() => setGatilho(null), 120)}
                        placeholder="tarefa !prioridade #projeto @2026-06-30 // descrição"
                        className="h-7 text-sm"
                    />
                    {gatilho && sugestoes.length > 0 && (
                        <ul className="absolute left-2 right-2 top-full z-20 -mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                            {sugestoes.map((s, i) => (
                                <li key={s}>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => inserirSugestao(s)}
                                        className={cn(
                                            'h-auto w-full justify-start rounded px-2 py-1 text-left text-xs font-normal',
                                            i === sel
                                                ? 'bg-accent text-accent-foreground'
                                                : 'hover:bg-muted',
                                        )}
                                    >
                                        {gatilho.tipo === 'projeto' ? `#${s}` : `!${s}`}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Filtros (#51): a lista acumula — estado + #tag à mão. */}
            <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
                <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                    <SelectTrigger className="h-6 flex-1 border-none px-1 text-[0.65rem] text-muted-foreground shadow-none focus:ring-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Estado: todos</SelectItem>
                        {ESTADOS_ABERTOS.map((e) => (
                            <SelectItem key={e} value={e}>
                                {ESTADO_LABEL[e]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={filtroProjeto} onValueChange={setFiltroProjeto}>
                    <SelectTrigger className="h-6 flex-1 border-none px-1 text-[0.65rem] text-muted-foreground shadow-none focus:ring-0">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos"># todas</SelectItem>
                        {projetos.map((p) => (
                            <SelectItem key={p} value={p}>
                                #{p}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-1">
                {visiveis.length === 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                        {abertas.length === 0
                            ? 'Sem tarefas em aberto.'
                            : 'Nada passa nos filtros.'}
                    </p>
                )}
                <ul className="space-y-0.5">
                    {visiveis.map((t) => {
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
                                        {/* Ordem da view = ordem do quick-add (#51):
                                            estado (toggle antes do nome) → #tag →
                                            descrição; a data de criação fica onde
                                            estava o chevron. */}
                                        <div className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
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
                                                <SelectTrigger className="h-5 w-auto shrink-0 flex-row-reverse justify-end gap-0.5 border-none px-0 text-[0.65rem] shadow-none focus:ring-0">
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
                                            {t.projeto && (
                                                <span className="shrink-0">#{t.projeto}</span>
                                            )}
                                            {t.descricao && (
                                                <span className="truncate" title={t.descricao}>
                                                    {t.descricao}
                                                </span>
                                            )}
                                            {bloqueada && (
                                                <span
                                                    title="Bloqueada por dependência em aberto"
                                                    className="inline-flex shrink-0 items-center gap-0.5"
                                                >
                                                    <Lock className="h-3 w-3" />
                                                </span>
                                            )}
                                            <span className="ml-auto flex shrink-0 items-center gap-1">
                                                {t.dataFim && (
                                                    <span title={`Data fim: ${t.dataFim}`}>
                                                        📅 {t.dataFim.slice(5)}
                                                    </span>
                                                )}
                                                <span
                                                    title={`Criada em ${t.criadaEm.slice(0, 10)}`}
                                                >
                                                    {t.criadaEm.slice(0, 10)}
                                                </span>
                                            </span>
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
