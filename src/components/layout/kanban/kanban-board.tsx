'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, CalendarClock, Code2, ExternalLink, GitPullRequest, Lock } from 'lucide-react';

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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useWorkspace } from '@/components/layout/workspace/workspace-context';
import { apagarTarefa, concluirTarefa, mudarEstadoTarefa } from '@/modules/tarefas/tarefas.actions';
import { dispararRelay, promoverTarefa } from '@/modules/relay/relay.actions';
import { getJson } from '@/lib/api-get';
import { emitirPrefillChat } from '@/modules/chat/chat.events';
import type { DefinicoesVista } from '@/modules/definicoes/definicoes.schema';
import type { PainelTarefas } from '@/modules/tarefas/tarefas.service';
import { promptKillSwitchRelay } from '@/components/layout/kanban/kanban-relay-context';
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

const ESTADOS_TRIGGER_RELAY: EstadoTarefa[] = ['analise', 'desenvolvimento'];

function corPrioridade(p: PrioridadeTarefa): string {
    if (p === 'alta') return 'bg-red-500';
    if (p === 'baixa') return 'bg-blue-800';
    return 'bg-green-700';
}

const RELAY_FASE_LABEL: Record<string, string> = {
    analise: 'Análise',
    dev: 'Dev',
    testes: 'Testes',
    docs: 'Docs',
    auditoria: 'Auditoria',
    pr: 'PR',
    erro: 'Erro',
};

function corIndicadorTarefa(tarefa: Tarefa): string {
    if (tarefa.estado === 'backlog') return 'bg-muted-foreground/30';
    if (tarefa.relayEstado === 'processando') return 'bg-orange-500';
    if (tarefa.relayEstado === 'bloqueado') return 'bg-red-500';
    if (tarefa.relayEstado === 'pronto') return 'bg-green-500';
    return corPrioridade(tarefa.prioridade);
}

function tituloIndicadorTarefa(tarefa: Tarefa): string {
    const fase = tarefa.relayFase ? (RELAY_FASE_LABEL[tarefa.relayFase] ?? tarefa.relayFase) : null;
    if (tarefa.estado === 'backlog') return 'Backlog';
    if (tarefa.relayEstado === 'processando') return fase ? `Relay em ${fase}` : 'Relay em curso';
    if (tarefa.relayEstado === 'bloqueado')
        return fase ? `Relay bloqueado em ${fase}` : 'Relay bloqueado';
    if (tarefa.relayEstado === 'pronto') return fase ? `Relay pronto em ${fase}` : 'Relay pronto';
    return `Prioridade ${tarefa.prioridade}`;
}

function issueUrl(tarefa: Tarefa): string | null {
    if (!tarefa.repoGithub || !tarefa.issueGithub) return null;
    return `https://github.com/${tarefa.repoGithub}/issues/${tarefa.issueGithub}`;
}

function prNumero(url: string): string | null {
    return /\/pull\/(\d+)(?:$|[/?#])/.exec(url)?.[1] ?? null;
}

function pathVsCode(path: string): string {
    const expandido = path.startsWith('~/') ? `/home/carlos-jesus/${path.slice(2)}` : path;
    return `vscode://file/${encodeURI(expandido)}`;
}

function CartaoTarefa({
    tarefa,
    mae,
    destacada,
    repoPaths,
    onHoverBloqueio,
    onPromover,
    onAbrirKillSwitch,
}: {
    tarefa: Tarefa;
    mae: Tarefa | null; // a tarefa que bloqueia esta (dependência em aberto)
    destacada: boolean; // esta É a mãe de quem está com o rato no cadeado
    repoPaths: Record<string, string>;
    onHoverBloqueio: (maeId: string | null) => void;
    onPromover: (t: Tarefa) => void; // backlog sem issue → cria + liga
    onAbrirKillSwitch: (t: Tarefa) => void;
}) {
    const concluida = tarefa.estado === 'terminado';
    const repoPath = tarefa.repoGithub ? repoPaths[tarefa.repoGithub] : null;
    const hrefCodigo = concluida ? tarefa.relayPrUrl : (tarefa.relayPrUrl ?? issueUrl(tarefa));
    const mostrarLinksCodigo = Boolean(hrefCodigo) || (!concluida && tarefa.estado === 'backlog');
    return (
        <div
            draggable={!concluida}
            title={
                tarefa.relayEstado === 'bloqueado'
                    ? 'Duplo clique para abrir o contexto do bloqueio no chat'
                    : undefined
            }
            onDoubleClick={() => {
                if (tarefa.relayEstado === 'bloqueado') onAbrirKillSwitch(tarefa);
            }}
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
            <div className="mb-1 flex items-start gap-2">
                <span
                    title={tituloIndicadorTarefa(tarefa)}
                    className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        corIndicadorTarefa(tarefa),
                    )}
                />
                <p
                    className={cn('min-w-0 flex-1 text-sm', concluida && 'line-through')}
                    title={tarefa.titulo}
                >
                    {tarefa.titulo}
                </p>
            </div>
            {tarefa.blocker && !concluida && (
                <p
                    className="min-w-0 truncate text-[0.65rem] text-destructive"
                    title={`Bloqueada: ${tarefa.blocker}`}
                >
                    ⚠ {tarefa.blocker}
                </p>
            )}
            <div
                className={cn(
                    'flex items-center justify-between gap-2 text-[0.65rem] text-muted-foreground',
                    concluida && 'mb-1',
                )}
            >
                <span className="min-w-0 truncate" title={`Criada em ${dataPt(tarefa.criadaEm)}`}>
                    + {dataCurtaPt(tarefa.criadaEm)}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                    {tarefa.dataFim && (
                        <span
                            className="inline-flex items-center gap-1"
                            title={`Data fim: ${dataPt(tarefa.dataFim)}`}
                        >
                            <CalendarClock className="h-3 w-3" />
                            {dataCurtaPt(tarefa.dataFim)}
                        </span>
                    )}
                    {tarefa.concluidaEm && (
                        <span title={`Concluída em ${dataPt(tarefa.concluidaEm)}`}>
                            {dataCurtaPt(tarefa.concluidaEm)}
                        </span>
                    )}
                </span>
            </div>
            {/* Relay: ligada a uma issue → links úteis; backlog sem issue → promover. */}
            {mostrarLinksCodigo && (
                <div className="flex items-center justify-between gap-2 text-[0.65rem]">
                    {hrefCodigo ? (
                        <>
                            <span className="flex min-w-0 items-center gap-2">
                                <a
                                    className="inline-flex min-w-0 items-center gap-1 text-muted-foreground hover:text-foreground"
                                    href={hrefCodigo}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={hrefCodigo}
                                >
                                    {tarefa.relayPrUrl ? (
                                        <GitPullRequest className="h-3 w-3 shrink-0" />
                                    ) : (
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                    )}
                                    <span className="truncate">
                                        {tarefa.relayPrUrl
                                            ? `PR #${prNumero(tarefa.relayPrUrl) ?? tarefa.issueGithub}`
                                            : `issue #${tarefa.issueGithub}`}
                                    </span>
                                </a>
                                {tarefa.relayEstado === 'processando' && tarefa.relayProgresso ? (
                                    // Sub-passo LIVE (ronda/provider/ação) enquanto corre — mata o
                                    // blackout entre fases e mostra o provider a trabalhar (#160).
                                    <span
                                        className="min-w-0 animate-pulse truncate capitalize text-muted-foreground"
                                        title={tarefa.relayProgresso}
                                    >
                                        {tarefa.relayProgresso}
                                    </span>
                                ) : (
                                    tarefa.relayFase && (
                                        <span className="shrink-0 text-muted-foreground">
                                            {RELAY_FASE_LABEL[tarefa.relayFase] ?? tarefa.relayFase}
                                        </span>
                                    )
                                )}
                            </span>
                            {!concluida && repoPath && (
                                <a
                                    className="inline-flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
                                    href={pathVsCode(repoPath)}
                                    title={`Abrir ${repoPath} no VS Code`}
                                >
                                    <Code2 className="h-3 w-3" />
                                    VS Code
                                </a>
                            )}
                        </>
                    ) : (
                        <Button
                            type="button"
                            variant="link"
                            className="ml-auto h-auto p-0 text-[0.65rem]"
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
    // Relay: repos ligados (picker da promoção + path local) e aviso do disparo.
    const [reposLigados, setReposLigados] = useState<string[]>([]);
    const [repoPaths, setRepoPaths] = useState<Record<string, string>>({});
    const [promover, setPromover] = useState<Tarefa | null>(null);
    const [repoEscolhido, setRepoEscolhido] = useState('');
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

    const relayEmCurso = abertas.some((t) => t.relayEstado === 'processando');

    useEffect(() => {
        if (!relayEmCurso) return;
        const id = window.setInterval(carregarTarefas, 5000);
        return () => window.clearInterval(id);
    }, [relayEmCurso, carregarTarefas]);

    // Repos ligados para o picker da promoção (a key nunca vem; só os nomes).
    useEffect(() => {
        void runClientAction({ area: 'kanban', action: 'lerReposLigados', meta: {} }, () =>
            getJson<DefinicoesVista>('/api/definicoes'),
        ).then((d) => {
            if (!d) return;
            setReposLigados(d.githubRepos.map((r) => r.repo));
            setRepoPaths(
                Object.fromEntries(
                    d.githubRepos.flatMap((r) => (r.path ? [[r.repo, r.path]] : [])),
                ),
            );
        });
    }, []);

    function abrirPromover(t: Tarefa) {
        setPromover(t);
        setRepoEscolhido(reposLigados[0] ?? '');
    }

    function abrirKillSwitch(t: Tarefa) {
        const repoPath = t.repoGithub ? (repoPaths[t.repoGithub] ?? null) : null;
        // #M7-C: auto-send — o agente engata logo o diagnóstico do kill-switch (salta o send manual).
        emitirPrefillChat(promptKillSwitchRelay(t, repoPath), true);
        setRelayInfo(
            `Recuperação do kill-switch enviada ao chat: ${t.repoGithub ?? ''} #${t.issueGithub ?? ''}`,
        );
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
        const relayAlvo =
            ESTADOS_TRIGGER_RELAY.includes(estado) && t.repoGithub && t.issueGithub
                ? { repo: t.repoGithub, issue: t.issueGithub }
                : null;
        if (relayAlvo) {
            // Checa precedências antes de mudar de coluna: bloqueada não entra no relay.
            if (bloqueadaPorDependencia(t)) {
                setRelayInfo('Relay não disparado: a tarefa está bloqueada por uma dependência.');
                return;
            }
        }
        mutacao('mudarEstadoTarefa', { id: t.id, estado }, () => mudarEstadoTarefa(t.id, estado));
        // Trigger do relay: arrastar para Análise ou Em Desenvolvimento dispara
        // o pipeline para a issue ligada. Cartões leves (sem issue) só mudam de coluna.
        if (relayAlvo) {
            void dispararRelay(relayAlvo.repo, relayAlvo.issue).then((r) => {
                setRelayInfo(r.detalhe);
                carregarTarefas();
                notificarWorkspaceMudou();
            });
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
                                    repoPaths={repoPaths}
                                    onHoverBloqueio={setMaeDestacada}
                                    onPromover={abrirPromover}
                                    onAbrirKillSwitch={abrirKillSwitch}
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
