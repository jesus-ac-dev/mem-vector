'use client';

import { useEffect, useState } from 'react';
import { Archive, Lock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { dataCurtaPt, dataPt } from '@/lib/datas';
import { runClientAction } from '@/lib/client-error-log';
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
    concluirTarefa,
    listarTarefasPainel,
    mudarEstadoTarefa,
} from '@/modules/tarefas/tarefas.actions';
import {
    agruparPorEstado,
    ESTADOS_TAREFA,
    idCurtoTarefa,
    type EstadoTarefa,
    type PrioridadeTarefa,
    type Tarefa,
} from '@/modules/tarefas/tarefas.schema';

// Kanban visual (#58): as tarefas pelas 6 colunas canónicas, drag entre
// colunas muda o estado; drop em Terminado conclui (modal — regista no daily);
// drop no Archive APAGA (modal; tarefas não têm arquivo). O kanban filtrado a
// um projeto é a página do projeto v1.

const DRAG_TAREFA_ID = 'application/x-mem-tarefa-id';

const ESTADO_LABEL: Record<EstadoTarefa, string> = {
    backlog: 'Backlog',
    analise: 'Análise',
    desenvolvimento: 'Em Desenvolvimento',
    testes: 'Testes',
    documentacao: 'Documentação',
    terminado: 'Terminado',
};

function corPrioridade(p: PrioridadeTarefa): string {
    if (p === 'alta') return 'bg-red-500';
    if (p === 'baixa') return 'bg-blue-800';
    return 'bg-green-700';
}

function CartaoTarefa({
    tarefa,
    mae,
    destacada,
    onHoverBloqueio,
}: {
    tarefa: Tarefa;
    mae: Tarefa | null; // a tarefa que bloqueia esta (dependência em aberto)
    destacada: boolean; // esta É a mãe de quem está com o rato no cadeado
    onHoverBloqueio: (maeId: string | null) => void;
}) {
    const concluida = tarefa.estado === 'terminado';
    return (
        <div
            draggable={!concluida}
            onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TAREFA_ID, tarefa.id);
                e.dataTransfer.effectAllowed = 'move';
            }}
            className={cn(
                'rounded-md border bg-background p-2 text-sm shadow-sm transition-colors',
                concluida ? 'opacity-60' : 'cursor-grab active:cursor-grabbing',
                destacada && 'border-primary ring-1 ring-primary',
            )}
        >
            {/* Linha 1: #projeto à esquerda; id curto (+ cadeado se bloqueada)
                à direita. Hover no cadeado destaca a tarefa-mãe. */}
            <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-[0.65rem] font-medium text-muted-foreground">
                    {tarefa.projeto ? `#${tarefa.projeto}` : ''}
                </p>
                <span className="flex shrink-0 items-center gap-1 text-[0.65rem] text-muted-foreground">
                    <span title={`Id da tarefa: ${idCurtoTarefa(tarefa.id)}`}>
                        {idCurtoTarefa(tarefa.id)}
                    </span>
                    {mae && (
                        <span
                            title={`Bloqueada por ${idCurtoTarefa(mae.id)} — ${mae.titulo}`}
                            className="cursor-help"
                            onMouseEnter={() => onHoverBloqueio(mae.id)}
                            onMouseLeave={() => onHoverBloqueio(null)}
                        >
                            <Lock className="h-3 w-3" />
                        </span>
                    )}
                </span>
            </div>
            <div className="flex items-start gap-2">
                <span
                    title={`Prioridade ${tarefa.prioridade}`}
                    className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        corPrioridade(tarefa.prioridade),
                    )}
                />
                <p
                    className={cn('min-w-0 flex-1 text-sm', concluida && 'line-through')}
                    title={tarefa.titulo}
                >
                    {tarefa.titulo}
                </p>
            </div>
            <div className="flex items-center gap-1.5 pl-4 text-[0.65rem] text-muted-foreground">
                <span title={`Criada em ${dataPt(tarefa.criadaEm)}`}>
                    ➕ {dataCurtaPt(tarefa.criadaEm)}
                </span>
                {tarefa.dataFim && (
                    <span title={`Data fim: ${dataPt(tarefa.dataFim)}`}>
                        📅 {dataCurtaPt(tarefa.dataFim)}
                    </span>
                )}
                {tarefa.concluidaEm && (
                    <span title={`Concluída em ${dataPt(tarefa.concluidaEm)}`}>
                        ✅ {dataCurtaPt(tarefa.concluidaEm)}
                    </span>
                )}
            </div>
        </div>
    );
}

export function KanbanBoard() {
    const { workspaceVersion, notificarWorkspaceMudou } = useWorkspace();
    const [abertas, setAbertas] = useState<Tarefa[]>([]);
    const [concluidas, setConcluidas] = useState<Tarefa[]>([]);
    const [projetos, setProjetos] = useState<string[]>([]);
    const [filtroProjeto, setFiltroProjeto] = useState<string>('todos');
    const [colunaOver, setColunaOver] = useState<string | null>(null);
    const [archiveOver, setArchiveOver] = useState(false);
    // Hover no cadeado destaca a tarefa-mãe (a dependência que bloqueia).
    const [maeDestacada, setMaeDestacada] = useState<string | null>(null);
    const [corteSemana, setCorteSemana] = useState(0);
    const [erro, setErro] = useState<string | null>(null);
    const [confirmar, setConfirmar] = useState<{
        tipo: 'concluir' | 'apagar';
        tarefa: Tarefa;
    } | null>(null);

    useEffect(() => {
        let cancelado = false;
        void runClientAction({ area: 'kanban', action: 'listarTarefasPainel', meta: {} }, () =>
            listarTarefasPainel(),
        ).then((r) => {
            if (cancelado || !r) return;
            setAbertas(r.abertas);
            setConcluidas(r.concluidas);
            setProjetos(r.projetos.map((p) => p.nome));
            setCorteSemana(Date.now() - 7 * 24 * 60 * 60 * 1000);
        });
        return () => {
            cancelado = true;
        };
    }, [workspaceVersion]);

    const abertasIds = new Set(abertas.map((t) => t.id));
    const visiveis = abertas.filter(
        (t) => filtroProjeto === 'todos' || t.projeto === filtroProjeto,
    );
    // Terminado mostra só a última semana (#60 r2, pedido do Carlos): num mês
    // a coluna virava um scroll gigante. O histórico completo continua no
    // painel ("Ver concluídas") e no daily. O corte calcula-se no load (o
    // lint da casa não deixa Date.now() no render).
    const concluidasVisiveis = concluidas.filter(
        (t) =>
            (filtroProjeto === 'todos' || t.projeto === filtroProjeto) &&
            (!t.concluidaEm || new Date(t.concluidaEm).getTime() >= corteSemana),
    );
    const grupos = agruparPorEstado(visiveis, concluidasVisiveis);

    function bloqueadaPorDependencia(t: Tarefa): boolean {
        return Boolean(t.dependeDe && abertasIds.has(t.dependeDe));
    }

    function mutacao(action: string, meta: Record<string, unknown>, fn: () => Promise<unknown>) {
        void runClientAction({ area: 'kanban', action, meta }, fn).then(() =>
            notificarWorkspaceMudou(),
        );
    }

    function tarefaDoDrop(e: React.DragEvent): Tarefa | null {
        const id = e.dataTransfer.getData(DRAG_TAREFA_ID);
        return abertas.find((t) => t.id === id) ?? null;
    }

    function onDropColuna(e: React.DragEvent, estado: EstadoTarefa) {
        e.preventDefault();
        setColunaOver(null);
        const t = tarefaDoDrop(e);
        if (!t || t.estado === estado) return;
        setErro(null);
        if (estado === 'terminado') {
            // Validação client-side da dependência (a RPC também valida).
            if (bloqueadaPorDependencia(t)) {
                setErro(`«${t.titulo}» está bloqueada por uma dependência em aberto.`);
                return;
            }
            setConfirmar({ tipo: 'concluir', tarefa: t });
            return;
        }
        mutacao('mudarEstadoTarefa', { id: t.id, estado }, () => mudarEstadoTarefa(t.id, estado));
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
        <div className="flex h-full flex-col overflow-hidden p-4">
            {/* Header: filtro por projeto (= página do projeto v1) + Apagar. */}
            <div className="mb-3 flex shrink-0 items-center gap-2">
                <Select value={filtroProjeto} onValueChange={setFiltroProjeto}>
                    <SelectTrigger className="h-7 w-44 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos"># todos os projetos</SelectItem>
                        {projetos.map((p) => (
                            <SelectItem key={p} value={p}>
                                #{p}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {erro && <p className="text-xs text-destructive">{erro}</p>}
                <div
                    onDragOver={(e) => {
                        if (e.dataTransfer.types.includes(DRAG_TAREFA_ID)) {
                            e.preventDefault();
                            setArchiveOver(true);
                        }
                    }}
                    onDragLeave={() => setArchiveOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setArchiveOver(false);
                        const t = tarefaDoDrop(e);
                        if (t) setConfirmar({ tipo: 'apagar', tarefa: t });
                    }}
                    title="Larga aqui para apagar (apaga mesmo — tarefas não têm arquivo)"
                    className={cn(
                        'ml-auto flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground transition-colors',
                        archiveOver && 'border-destructive bg-destructive/10 text-destructive',
                    )}
                >
                    <Archive className="h-3.5 w-3.5" /> Apagar
                </div>
            </div>

            {/* Colunas */}
            <div className="grid min-h-0 flex-1 grid-cols-6 gap-2">
                {ESTADOS_TAREFA.map((estado) => (
                    <div
                        key={estado}
                        onDragOver={(e) => {
                            if (e.dataTransfer.types.includes(DRAG_TAREFA_ID)) {
                                e.preventDefault();
                                setColunaOver(estado);
                            }
                        }}
                        onDragLeave={() => setColunaOver((c) => (c === estado ? null : c))}
                        onDrop={(e) => onDropColuna(e, estado)}
                        className={cn(
                            'flex min-h-0 flex-col rounded-md border bg-muted/30',
                            colunaOver === estado && 'border-primary/60 bg-accent/40',
                        )}
                    >
                        <div className="flex shrink-0 items-center justify-between border-b px-2 py-1.5">
                            <span className="text-xs font-medium">{ESTADO_LABEL[estado]}</span>
                            <span className="rounded border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                                {grupos[estado].length}
                            </span>
                        </div>
                        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                            {grupos[estado].map((t) => (
                                <CartaoTarefa
                                    key={t.id}
                                    tarefa={t}
                                    mae={
                                        bloqueadaPorDependencia(t)
                                            ? (abertas.find((a) => a.id === t.dependeDe) ?? null)
                                            : null
                                    }
                                    destacada={maeDestacada === t.id}
                                    onHoverBloqueio={setMaeDestacada}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Confirmação de concluir/apagar — par do painel (#55). */}
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
