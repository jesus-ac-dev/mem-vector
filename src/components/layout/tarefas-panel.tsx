'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Lock, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { dataCurtaPt, dataPt } from '@/lib/datas';
import { runClientAction } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
    atualizarTarefa,
    concluirTarefa,
    criarTarefa,
    listarTarefasPainel,
    mudarEstadoTarefa,
} from '@/modules/tarefas/tarefas.actions';
import {
    detetarGatilhoTarefa,
    faltaObrigatorios,
    hintQuickAdd,
    parseNovaTarefa,
    serializarTarefa,
    sugestoesParaGatilho,
    type GatilhoTarefa,
} from '@/modules/tarefas/tarefas-quickadd';
import {
    idCurtoTarefa,
    type EstadoTarefa,
    type PrioridadeTarefa,
    type Tarefa,
} from '@/modules/tarefas/tarefas.schema';

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

// Cores pedidas pelo Carlos (#53): baixa azul escuro, normal verde escuro —
// o bg-primary/60 parecia vermelho no tema escuro e confundia normal com alta.
function corPrioridade(p: PrioridadeTarefa): string {
    if (p === 'alta') return 'bg-red-500';
    if (p === 'baixa') return 'bg-blue-800';
    return 'bg-green-700';
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
    const [projetos, setProjetos] = useState<string[]>([]);
    const [verConcluidas, setVerConcluidas] = useState(false);
    const [novoTexto, setNovoTexto] = useState('');
    // Clicar no card edita (#55): o input reabre com os tokens da tarefa.
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [gatilho, setGatilho] = useState<GatilhoTarefa | null>(null);
    const [sel, setSel] = useState(0);
    const [erro, setErro] = useState<string | null>(null);
    // Concluir/apagar pedem confirmação (#55, ronda 4).
    const [confirmar, setConfirmar] = useState<{
        tipo: 'concluir' | 'apagar';
        tarefa: Tarefa;
    } | null>(null);
    // Hover no cadeado destaca a tarefa-mãe (#58).
    const [maeDestacada, setMaeDestacada] = useState<string | null>(null);
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
            setProjetos(r.projetos.map((p) => p.nome));
        });
        return () => {
            cancelado = true;
        };
    }, [workspaceVersion]);

    const inputAberto = criarAberto || editandoId !== null;

    useEffect(() => {
        if (inputAberto) inputRef.current?.focus();
    }, [inputAberto]);

    function fecharInput() {
        setEditandoId(null);
        setNovoTexto('');
        setGatilho(null);
        setErro(null);
        onFecharCriar();
    }

    function iniciarEdicao(t: Tarefa) {
        setEditandoId(t.id);
        setNovoTexto(serializarTarefa(t));
        setGatilho(null);
        requestAnimationFrame(() => inputRef.current?.focus());
    }

    const abertasIds = new Set(abertas.map((t) => t.id));

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
            fecharInput();
            return;
        }
        const { titulo, projeto, prioridade, dataFim, descricao } = parseNovaTarefa(texto);
        // Os 3 obrigatórios (#55, ronda 4): sem !prioridade #projeto tarefa não guarda.
        const falta = faltaObrigatorios(texto);
        if (falta.length || !titulo || !prioridade || !projeto) {
            setErro(`Falta: ${falta.join(' ')}`);
            return;
        }
        if (editandoId) {
            // Editar (#55): campos sem token limpam-se de propósito.
            await runClientAction(
                { area: 'left-sidebar', action: 'atualizarTarefa', meta: { id: editandoId } },
                () =>
                    atualizarTarefa(editandoId, {
                        titulo,
                        projeto,
                        prioridade,
                        dataFim: dataFim ?? null,
                        descricao: descricao ?? null,
                    }),
            );
        } else {
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
        }
        fecharInput();
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
        if (e.key === 'Escape') fecharInput();
    }

    function mutacao(action: string, meta: Record<string, unknown>, fn: () => Promise<unknown>) {
        void runClientAction({ area: 'left-sidebar', action, meta }, fn).then(() =>
            notificarWorkspaceMudou(),
        );
    }

    function executarConfirmacao() {
        if (!confirmar) return;
        const { tipo, tarefa } = confirmar;
        setConfirmar(null);
        if (tipo === 'concluir') {
            mutacao('concluirTarefa', { id: tarefa.id }, () => concluirTarefa(tarefa.id));
        } else {
            mutacao('apagarTarefa', { id: tarefa.id }, () => apagarTarefa(tarefa.id));
        }
    }

    return (
        <div className="flex h-full flex-col">
            {inputAberto && (
                <div className="relative border-b p-2">
                    {/* Hint-fantasma (#55, ronda 4): o que falta preencher
                        continua visível à frente do que já se escreveu. */}
                    <div className="relative">
                        <Input
                            ref={inputRef}
                            value={novoTexto}
                            onChange={(e) => {
                                setNovoTexto(e.target.value);
                                setErro(null);
                                recalcularGatilho(e.target.value, e.target.selectionStart ?? 0);
                            }}
                            onClick={(e) =>
                                recalcularGatilho(novoTexto, e.currentTarget.selectionStart ?? 0)
                            }
                            onKeyDown={onKeyDownNova}
                            onBlur={() => setTimeout(() => setGatilho(null), 120)}
                            className="h-7 text-sm"
                        />
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre px-3 text-sm"
                        >
                            <span className="invisible">{novoTexto}</span>
                            <span className="text-muted-foreground/50">
                                {(novoTexto && !novoTexto.endsWith(' ') ? ' ' : '') +
                                    hintQuickAdd(novoTexto)}
                            </span>
                        </div>
                    </div>
                    {erro && <p className="mt-1 text-[0.65rem] text-destructive">{erro}</p>}
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
                        const mae = bloqueada
                            ? (abertas.find((a) => a.id === t.dependeDe) ?? null)
                            : null;
                        // Card (#53/#58): linha 1 = #projeto + id curto (e cadeado
                        // se bloqueada — hover destaca a mãe); linha 2 = prioridade
                        // + título/descrição; linha 3 = estado e datas ➕/📅.
                        return (
                            <li key={t.id} className="group px-2">
                                <div
                                    className={cn(
                                        'rounded px-1 py-1 transition-colors hover:bg-muted',
                                        maeDestacada === t.id &&
                                            'border border-primary ring-1 ring-primary',
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <p
                                            className="min-w-0 cursor-pointer truncate text-[0.65rem] font-medium text-muted-foreground"
                                            onClick={() => iniciarEdicao(t)}
                                        >
                                            {t.projeto ? `#${t.projeto}` : ''}
                                        </p>
                                        <span className="flex shrink-0 items-center gap-1 text-[0.65rem] text-muted-foreground">
                                            <span title={`Id da tarefa: ${idCurtoTarefa(t.id)}`}>
                                                {idCurtoTarefa(t.id)}
                                            </span>
                                            {mae && (
                                                <span
                                                    title={`Bloqueada por ${idCurtoTarefa(mae.id)} — ${mae.titulo}`}
                                                    className="cursor-help"
                                                    onMouseEnter={() => setMaeDestacada(mae.id)}
                                                    onMouseLeave={() => setMaeDestacada(null)}
                                                >
                                                    <Lock className="h-3 w-3" />
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <span
                                            title={`Prioridade ${t.prioridade}`}
                                            className={cn(
                                                'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                                                corPrioridade(t.prioridade),
                                            )}
                                        />
                                        <p
                                            className="min-w-0 flex-1 cursor-pointer truncate text-sm"
                                            title={`${t.titulo} — clica para editar`}
                                            onClick={() => iniciarEdicao(t)}
                                        >
                                            {t.titulo}
                                            {t.descricao && (
                                                <span
                                                    className="ml-1.5 text-xs text-muted-foreground"
                                                    title={t.descricao}
                                                >
                                                    {t.descricao}
                                                </span>
                                            )}
                                        </p>
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
                                                    setConfirmar({ tipo: 'concluir', tarefa: t })
                                                }
                                                className="h-5 w-5 text-muted-foreground hover:text-green-400"
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                title="Apagar"
                                                onClick={() =>
                                                    setConfirmar({ tipo: 'apagar', tarefa: t })
                                                }
                                                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 pl-4 text-[0.65rem] text-muted-foreground">
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
                                        <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                            <span title={`Criada em ${dataPt(t.criadaEm)}`}>
                                                ➕ {dataCurtaPt(t.criadaEm)}
                                            </span>
                                            {t.dataFim && (
                                                <span title={`Data fim: ${dataPt(t.dataFim)}`}>
                                                    📅 {dataCurtaPt(t.dataFim)}
                                                </span>
                                            )}
                                        </span>
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
                                        <span
                                            className="ml-1.5"
                                            title={`Concluída em ${dataPt(t.concluidaEm)}`}
                                        >
                                            ✅ {dataCurtaPt(t.concluidaEm)}
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

            {/* Confirmação de concluir/apagar (#55, ronda 4). */}
            <AlertDialog open={!!confirmar} onOpenChange={(open) => !open && setConfirmar(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmar?.tipo === 'apagar' ? 'Apagar tarefa?' : 'Concluir tarefa?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmar?.tipo === 'apagar'
                                ? `«${confirmar.tarefa.titulo}» apaga-se de vez — as tarefas não têm arquivo.`
                                : `«${confirmar?.tarefa.titulo}» passa a terminada e fica registada no daily.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={executarConfirmacao}>
                            {confirmar?.tipo === 'apagar' ? 'Apagar' : 'Concluir'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
