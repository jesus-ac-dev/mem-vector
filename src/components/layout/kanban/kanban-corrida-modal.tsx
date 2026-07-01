'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowRight,
    CheckCircle2,
    ExternalLink,
    Flag,
    FlaskConical,
    MessageSquare,
    XCircle,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { runClientAction } from '@/lib/client-error-log';
import { getJson } from '@/lib/api-get';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { guiarRelay } from '@/modules/relay/relay.actions';
import type { EventoRelayLido } from '@/modules/relay/relay.eventos';
import type { SteeringPendente } from '@/modules/relay/relay.steering';
import type { Tarefa } from '@/modules/tarefas/tarefas.schema';
import {
    agruparEventosPorRun,
    custoDosEventos,
    FASE_LABEL,
    formatarCusto,
    formatarDuracao,
    rotuloEvento,
} from './kanban-relay-context';

// Tem de bater com o default de lerEventosRelayCom (rota /api/relay-corrida):
// é o cap honesto da timeline — quando o atingimos, dizemo-lo (sem cortes mudos).
const LIMITE_EVENTOS = 200;

// Modal da corrida (#129): o double-click no cartão deixa de ser só o kill-switch
// e passa a mostrar a corrida COMPLETA — a timeline de eventos (quem correu, em
// que fase/ronda, veredito, custo, duração), o total gasto, e o steering a quente
// (orientar o relay a meio, sem esperar pelo 🔴). A verdade auditável continua
// nos comentários da issue; isto é a vista viva na app.

interface CorridaResposta {
    eventos: EventoRelayLido[];
    steeringPendente: SteeringPendente[];
}

function horaDoEvento(iso: string): string {
    return new Date(iso).toLocaleTimeString('pt-PT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

// Verde/vermelho do veredito fora do literal de className — o mesmo padrão dos
// semáforos do kanban (corIndicadorTarefa): são cores de ESTADO, não de tema.
function corVeredito(ok: boolean): string {
    return ok ? 'text-green-600' : 'text-destructive';
}

function IconeEvento({ e }: { e: EventoRelayLido }) {
    if (e.tipo === 'steering') return <MessageSquare className="h-3 w-3 text-primary" />;
    if (e.tipo === 'testes')
        return <FlaskConical className={cn('h-3 w-3', corVeredito(e.veredito === 'ok'))} />;
    if (e.tipo === 'transicao') return <ArrowRight className="h-3 w-3 text-muted-foreground" />;
    if (e.tipo === 'fim') return <Flag className="h-3 w-3 text-muted-foreground" />;
    if (e.veredito === 'ok') return <CheckCircle2 className={cn('h-3 w-3', corVeredito(true))} />;
    if (e.veredito === 'rejeitado')
        return <XCircle className={cn('h-3 w-3', corVeredito(false))} />;
    return <ArrowRight className="h-3 w-3 text-muted-foreground" />;
}

function LinhaEvento({ e }: { e: EventoRelayLido }) {
    const fase = e.fase ? (FASE_LABEL[e.fase] ?? e.fase) : null;
    const meta = [
        fase && e.ronda ? `${fase} · ronda ${e.ronda}` : fase,
        typeof e.custoUsd === 'number' && e.custoUsd > 0
            ? formatarCusto(e.custoUsd, e.custoEstimado ?? false)
            : null,
        typeof e.duracaoMs === 'number' ? formatarDuracao(e.duracaoMs) : null,
    ]
        .filter(Boolean)
        .join(' · ');
    return (
        <li className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 shrink-0">
                <IconeEvento e={e} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium capitalize">{rotuloEvento(e)}</span>
                    <span className="text-muted-foreground">{meta}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">
                        {horaDoEvento(e.criadoEm)}
                    </span>
                </p>
                {e.detalhe && e.tipo !== 'transicao' && (
                    <p className="mt-0.5 break-words text-muted-foreground" title={e.detalhe}>
                        {e.detalhe}
                    </p>
                )}
            </div>
        </li>
    );
}

export function KanbanCorridaModal({
    tarefa,
    onFechar,
    onDiagnosticar,
}: {
    tarefa: Tarefa | null;
    onFechar: () => void;
    onDiagnosticar: (t: Tarefa) => void;
}) {
    const [corrida, setCorrida] = useState<CorridaResposta | null>(null);
    const [orientacao, setOrientacao] = useState('');
    const [aGuiar, setAGuiar] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    // Sequência de load (padrão do kanban-board): uma resposta atrasada de um
    // cartão anterior não pinta a timeline do cartão atual.
    const loadSeqRef = useRef(0);

    const repo = tarefa?.repoGithub ?? null;
    const issue = tarefa?.issueGithub ?? null;
    const processando = tarefa?.relayEstado === 'processando';

    const carregar = useCallback(() => {
        if (!repo || !issue) return;
        const seq = ++loadSeqRef.current;
        void runClientAction({ area: 'kanban', action: 'lerCorridaRelay', meta: { issue } }, () =>
            getJson<CorridaResposta>(
                `/api/relay-corrida?repo=${encodeURIComponent(repo)}&issue=${issue}`,
            ),
        ).then((r) => {
            if (r && seq === loadSeqRef.current) setCorrida(r);
        });
    }, [repo, issue]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    // Enquanto a corrida processa, a timeline segue ao vivo (mesmo ritmo do
    // kanban). Deps por valores estáveis (carregar já depende de repo/issue) —
    // depender do OBJETO tarefa rearmava o intervalo a cada refresh do board.
    useEffect(() => {
        if (!processando) return;
        const id = window.setInterval(carregar, 5000);
        return () => window.clearInterval(id);
    }, [processando, carregar]);

    async function guiar() {
        if (!repo || !issue || !orientacao.trim()) return;
        setAGuiar(true);
        const r = await guiarRelay(repo, issue, orientacao);
        setAGuiar(false);
        setAviso(r.detalhe);
        if (r.ok) {
            setOrientacao('');
            carregar();
        }
    }

    const runs = agruparEventosPorRun(corrida?.eventos ?? []);
    const ultimaRun = runs.at(-1) ?? null;
    const custo = ultimaRun ? custoDosEventos(ultimaRun.eventos) : null;
    const pendentes = corrida?.steeringPendente ?? [];
    const truncada = (corrida?.eventos.length ?? 0) >= LIMITE_EVENTOS;

    return (
        <Dialog open={!!tarefa} onOpenChange={(o) => !o && onFechar()}>
            <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        Corrida do relay — {repo} #{issue}
                        {custo && custo.total > 0 && (
                            <span className="rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                                {formatarCusto(custo.total, custo.estimado)}
                            </span>
                        )}
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-3 text-xs">
                        <span>{tarefa?.titulo}</span>
                        {repo && issue && (
                            <a
                                className="inline-flex items-center gap-1 hover:text-foreground"
                                href={`https://github.com/${repo}/issues/${issue}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <ExternalLink className="h-3 w-3" /> issue
                            </a>
                        )}
                        {tarefa?.relayPrUrl && (
                            <a
                                className="inline-flex items-center gap-1 hover:text-foreground"
                                href={tarefa.relayPrUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <ExternalLink className="h-3 w-3" /> PR
                            </a>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {/* Timeline: última corrida aberta; as anteriores colapsadas. */}
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    {runs.length === 0 ? (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                            Ainda sem eventos desta issue — a timeline nasce quando o relay corre (o
                            histórico anterior a esta funcionalidade vive nos comentários da issue).
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {truncada && (
                                <p className="text-xs italic text-muted-foreground">
                                    A mostrar os últimos {LIMITE_EVENTOS} eventos — a corrida mais
                                    antiga pode estar incompleta (o histórico completo vive nos
                                    comentários da issue).
                                </p>
                            )}
                            {runs.slice(0, -1).map((run, i) => {
                                const c = custoDosEventos(run.eventos);
                                const custoRun =
                                    c.total > 0 ? ` · ${formatarCusto(c.total, c.estimado)}` : '';
                                return (
                                    <details
                                        key={run.runId}
                                        className="rounded-md border px-2 py-1"
                                    >
                                        <summary className="cursor-pointer text-xs text-muted-foreground">
                                            Corrida anterior {i + 1} ({run.eventos.length} eventos
                                            {custoRun})
                                        </summary>
                                        <ul className="mt-2 space-y-1.5 pb-1">
                                            {run.eventos.map((e, j) => (
                                                <LinhaEvento key={`${run.runId}-${j}`} e={e} />
                                            ))}
                                        </ul>
                                    </details>
                                );
                            })}
                            {ultimaRun && (
                                <ul className="space-y-1.5">
                                    {ultimaRun.eventos.map((e, j) => (
                                        <LinhaEvento key={`${ultimaRun.runId}-${j}`} e={e} />
                                    ))}
                                    {processando && (
                                        <li className="animate-pulse text-xs text-muted-foreground">
                                            {tarefa?.relayProgresso ?? 'a correr…'}
                                        </li>
                                    )}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* Steering a quente: orientar a corrida sem esperar pelo 🔴. */}
                <div className="shrink-0 space-y-2 border-t pt-3">
                    {pendentes.length > 0 && (
                        <div className="space-y-1">
                            {pendentes.map((p) => (
                                <p
                                    key={p.id}
                                    className="flex items-start gap-1.5 text-xs text-muted-foreground"
                                >
                                    <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                                    <span className="min-w-0 flex-1 break-words">
                                        {p.texto}{' '}
                                        <span className="italic">
                                            (pendente — entra no próximo passo de produção)
                                        </span>
                                    </span>
                                </p>
                            ))}
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        <Textarea
                            value={orientacao}
                            onChange={(e) => setOrientacao(e.target.value)}
                            placeholder="Guiar a corrida (ex.: usa a tabela X, não mexas no módulo Y)…"
                            className="min-h-[3.5rem] flex-1 text-xs"
                        />
                        <div className="flex shrink-0 flex-col gap-1.5">
                            <Button
                                type="button"
                                size="sm"
                                onClick={guiar}
                                disabled={aGuiar || !orientacao.trim()}
                            >
                                {aGuiar ? 'A guiar…' : 'Guiar'}
                            </Button>
                            {tarefa?.relayEstado === 'bloqueado' && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onDiagnosticar(tarefa)}
                                >
                                    Diagnosticar no chat
                                </Button>
                            )}
                        </div>
                    </div>
                    {aviso && <p className="text-xs text-muted-foreground">{aviso}</p>}
                </div>
            </DialogContent>
        </Dialog>
    );
}
