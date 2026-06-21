'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useWorkspace } from '@/components/layout/workspace/workspace-context';
import { apagarTarefa, concluirTarefa, mudarEstadoTarefa } from '@/modules/tarefas/tarefas.actions';
import {
    comentarERetomar,
    dispararRelay,
    lerComentariosRelay,
    promoverTarefa,
} from '@/modules/relay/relay.actions';
import { getJson } from '@/lib/api-get';
import type { DefinicoesVista } from '@/modules/definicoes/definicoes.schema';
import type { PainelTarefas } from '@/modules/tarefas/tarefas.service';
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
    onPromover,
    onRetomar,
}: {
    tarefa: Tarefa;
    mae: Tarefa | null; // a tarefa que bloqueia esta (dependência em aberto)
    destacada: boolean; // esta É a mãe de quem está com o rato no cadeado
    onHoverBloqueio: (maeId: string | null) => void;
    onPromover: (t: Tarefa) => void; // backlog sem issue → cria + liga
    onRetomar: (t: Tarefa) => void; // ligada → comentar e re-disparar (pós-🔴)
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
            {/* Relay: ligada a uma issue → badge + retomar; backlog sem issue → promover. */}
            {!concluida && (tarefa.issueGithub || tarefa.estado === 'backlog') && (
                <div className="flex items-center gap-2 pl-4 pt-1 text-[0.65rem]">
                    {tarefa.issueGithub ? (
                        <>
                            <span className="text-muted-foreground" title={tarefa.repoGithub ?? ''}>
                                ⧉ #{tarefa.issueGithub}
                            </span>
                            <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 text-[0.65rem]"
                                onClick={() => onRetomar(tarefa)}
                            >
                                ↻ retomar
                            </Button>
                        </>
                    ) : (
                        <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-[0.65rem]"
                            onClick={() => onPromover(tarefa)}
                        >
                            ⤴ promover a issue
                        </Button>
                    )}
                </div>
            )}
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
    // Relay: repos ligados (picker da promoção), modais de promover/retomar, e o
    // aviso do disparo (o estado real vive na issue).
    const [reposLigados, setReposLigados] = useState<string[]>([]);
    const [promover, setPromover] = useState<Tarefa | null>(null);
    const [repoEscolhido, setRepoEscolhido] = useState('');
    const [retomar, setRetomar] = useState<{
        tarefa: Tarefa;
        comentarios: { autor: string; corpo: string }[];
        texto: string;
    } | null>(null);
    const [relayInfo, setRelayInfo] = useState<string | null>(null);
    const [relayBusy, setRelayBusy] = useState(false);
    const loadSeqRef = useRef(0);

    const carregarTarefas = useCallback(() => {
        const seq = ++loadSeqRef.current;
        void runClientAction({ area: 'kanban', action: 'listarTarefasPainel', meta: {} }, () =>
            getJson<PainelTarefas>('/api/tarefas-painel'),
        ).then((r) => {
            if (seq !== loadSeqRef.current || !r) return;
            setAbertas(r.abertas);
            setConcluidas(r.concluidas);
            setProjetos(r.projetos.map((p) => p.nome));
            setCorteSemana(Date.now() - 7 * 24 * 60 * 60 * 1000);
        });
    }, []);

    useEffect(() => {
        carregarTarefas();
    }, [workspaceVersion, carregarTarefas]);

    // Repos ligados para o picker da promoção (a key nunca vem; só os nomes).
    useEffect(() => {
        void runClientAction({ area: 'kanban', action: 'lerReposLigados', meta: {} }, () =>
            getJson<DefinicoesVista>('/api/definicoes'),
        ).then((d) => {
            if (d) setReposLigados(d.githubRepos.map((r) => r.repo));
        });
    }, []);

    function abrirPromover(t: Tarefa) {
        setPromover(t);
        setRepoEscolhido(reposLigados[0] ?? '');
    }

    async function confirmarPromover() {
        if (!promover || !repoEscolhido) return;
        setRelayBusy(true);
        const r = await promoverTarefa(promover.id, repoEscolhido);
        setRelayBusy(false);
        setRelayInfo(r.detalhe);
        setPromover(null);
        if (r.ok) {
            carregarTarefas();
            notificarWorkspaceMudou();
        }
    }

    async function abrirRetomar(t: Tarefa) {
        setRetomar({ tarefa: t, comentarios: [], texto: '' });
        if (t.repoGithub && t.issueGithub) {
            const cs = await lerComentariosRelay(t.repoGithub, t.issueGithub);
            setRetomar((r) => (r && r.tarefa.id === t.id ? { ...r, comentarios: cs } : r));
        }
    }

    async function confirmarRetomar() {
        const alvo = retomar?.tarefa;
        if (!alvo?.repoGithub || !alvo.issueGithub || !retomar) return;
        setRelayBusy(true);
        const r = await comentarERetomar(alvo.repoGithub, alvo.issueGithub, retomar.texto);
        setRelayBusy(false);
        setRelayInfo(r.detalhe);
        setRetomar(null);
    }

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
        // Trigger do relay: arrastar para Análise dispara o pipeline para a issue
        // ligada (o cartão de código). Cartões leves (sem issue) só mudam de coluna.
        if (estado === 'analise' && t.repoGithub && t.issueGithub) {
            const repo = t.repoGithub;
            const issue = t.issueGithub;
            void dispararRelay(repo, issue).then((r) => setRelayInfo(r.detalhe));
        }
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
                                    onPromover={abrirPromover}
                                    onRetomar={abrirRetomar}
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

            {/* Promoção assistida: cartão de backlog → issue ligada (depois arrasta-se p/ Análise). */}
            <AlertDialog open={!!promover} onOpenChange={(o) => !o && setPromover(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Promover a issue</AlertDialogTitle>
                        <AlertDialogDescription>
                            «{promover?.titulo}» vira uma issue no repo escolhido e o cartão fica
                            ligado. Arrasta-o depois para Análise para o relay correr.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {reposLigados.length === 0 ? (
                        <p className="text-sm text-destructive">
                            Sem repos ligados — liga um em Definições &gt; módulo GitHub.
                        </p>
                    ) : (
                        <Select value={repoEscolhido} onValueChange={setRepoEscolhido}>
                            <SelectTrigger className="text-xs">
                                <SelectValue placeholder="Escolhe o repo" />
                            </SelectTrigger>
                            <SelectContent>
                                {reposLigados.map((r) => (
                                    <SelectItem key={r} value={r}>
                                        {r}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmarPromover}
                            disabled={!repoEscolhido || relayBusy}
                        >
                            {relayBusy ? 'A criar…' : 'Criar issue'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Retoma (chat-under-kanban): vê o trace na issue, comenta a correção e re-dispara. */}
            <AlertDialog open={!!retomar} onOpenChange={(o) => !o && setRetomar(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Retomar {retomar?.tarefa.repoGithub} #{retomar?.tarefa.issueGithub}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Comenta a correção (vai para a issue como humano) e o relay retoma,
                            relendo os comentários.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {retomar && retomar.comentarios.length > 0 && (
                        <div className="max-h-40 space-y-2 overflow-y-auto rounded border p-2 text-xs">
                            {retomar.comentarios.slice(-6).map((c, i) => (
                                <p
                                    key={i}
                                    className="whitespace-pre-wrap border-b pb-1 last:border-0"
                                >
                                    {c.corpo.split('\n')[0]}
                                </p>
                            ))}
                        </div>
                    )}
                    <Textarea
                        value={retomar?.texto ?? ''}
                        onChange={(e) =>
                            setRetomar((r) => (r ? { ...r, texto: e.target.value } : r))
                        }
                        placeholder="A correção / o que falta…"
                        className="h-24 text-xs"
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmarRetomar}
                            disabled={!retomar?.texto.trim() || relayBusy}
                        >
                            {relayBusy ? 'A retomar…' : 'Comentar e retomar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {relayInfo && (
                <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border bg-background px-3 py-2 text-xs shadow-md">
                    {relayInfo}{' '}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-auto p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setRelayInfo(null)}
                    >
                        ✕
                    </Button>
                </div>
            )}
        </div>
    );
}
