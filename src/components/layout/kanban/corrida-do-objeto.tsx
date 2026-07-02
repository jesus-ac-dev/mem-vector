'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, MessageSquare, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { runClientAction } from '@/lib/client-error-log';
import { getJson } from '@/lib/api-get';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { guiarRelay } from '@/modules/relay/relay.actions';
import type { EventoRelayLido } from '@/modules/relay/relay.eventos';
import type { SteeringPendente } from '@/modules/relay/relay.steering';
import type { Tarefa } from '@/modules/tarefas/tarefas.schema';
import type { DefinicoesVista } from '@/modules/definicoes/definicoes.schema';
import { emitirPrefillChat } from '@/modules/chat/chat.events';
import {
    agruparEventosPorRun,
    custoDoPasso,
    custoDosEventos,
    FASE_LABEL,
    formatarCusto,
    formatarDuracao,
    promptKillSwitchRelay,
    rotuloEvento,
} from './kanban-relay-context';

// Conversa do objeto (#129 ronda 3, decisão do Carlos): o double-click no cartão
// abre AQUI, no rodapé do kanban — não num modal. A corrida lê-se como uma troca
// de mensagens (providers à esquerda, humano à direita) com o estado ATUAL sempre
// visível; escrever no composer = steering (guiar o relay a meio). A verdade
// auditável continua nos comentários da issue.

// Tem de bater com o default de lerEventosRelayCom (rota /api/relay-corrida).
const LIMITE_EVENTOS = 200;

interface CorridaResposta {
    eventos: EventoRelayLido[];
    steeringPendente: SteeringPendente[];
    tarefa: Tarefa | null;
}

function horaDoEvento(iso: string): string {
    return new Date(iso).toLocaleTimeString('pt-PT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

// Cores de ESTADO fora do literal de className (padrão dos semáforos do kanban).
function corBolaEstado(relayEstado: string | null | undefined): string {
    if (relayEstado === 'processando') return 'bg-orange-500';
    if (relayEstado === 'bloqueado') return 'bg-red-500';
    if (relayEstado === 'pronto') return 'bg-green-500';
    return 'bg-muted-foreground/30';
}

function MensagemEvento({ e }: { e: EventoRelayLido }) {
    const fase = e.fase ? (FASE_LABEL[e.fase] ?? e.fase) : null;
    const meta = [
        fase && e.ronda ? `${fase} · ronda ${e.ronda}` : fase,
        custoDoPasso(e),
        typeof e.duracaoMs === 'number' ? formatarDuracao(e.duracaoMs) : null,
        horaDoEvento(e.criadoEm),
    ]
        .filter(Boolean)
        .join(' · ');

    // Sistema (transições/fim/test-gate): linha central discreta, como os
    // separadores de um chat.
    if (e.tipo === 'transicao' || e.tipo === 'fim' || e.tipo === 'testes') {
        return (
            <p className="py-0.5 text-center text-[0.65rem] text-muted-foreground">
                {e.tipo === 'testes'
                    ? `test-gate: ${e.detalhe || (e.veredito === 'ok' ? 'suite verde' : 'suite vermelha')}`
                    : e.detalhe}{' '}
                · {horaDoEvento(e.criadoEm)}
            </p>
        );
    }

    // Steering (humano): bolha à direita, como as mensagens do utilizador.
    if (e.tipo === 'steering') {
        return (
            <div className="flex justify-end">
                <div className="max-w-[80%] rounded-lg bg-primary/10 px-3 py-1.5 text-xs">
                    <p className="mb-0.5 font-medium">Tu · steering</p>
                    <p className="break-words">{e.detalhe}</p>
                    <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{meta}</p>
                </div>
            </div>
        );
    }

    // Passo de provider: bolha à esquerda, assinada.
    return (
        <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">
                <p className="mb-0.5 flex items-center gap-2 font-medium capitalize">
                    {rotuloEvento(e)}
                    {e.veredito === 'ok' && <span className="text-[0.65rem]">✅</span>}
                    {e.veredito === 'rejeitado' && <span className="text-[0.65rem]">❌</span>}
                </p>
                {e.detalhe && <p className="break-words text-muted-foreground">{e.detalhe}</p>}
                <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{meta}</p>
            </div>
        </div>
    );
}

export function CorridaDoObjeto({
    tarefa,
    onFechar,
    onDiagnosticar,
}: {
    tarefa: Tarefa; // snapshot de abertura; o estado vivo vem da rota (corrida.tarefa)
    onFechar: () => void;
    onDiagnosticar: (t: Tarefa) => void;
}) {
    const [corrida, setCorrida] = useState<CorridaResposta | null>(null);
    const [orientacao, setOrientacao] = useState('');
    const [aGuiar, setAGuiar] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    const loadSeqRef = useRef(0);
    const fundoRef = useRef<HTMLDivElement>(null);
    const feedRef = useRef<HTMLDivElement>(null);

    const repo = tarefa.repoGithub;
    const issue = tarefa.issueGithub;
    // O cartão VIVO vem da rota (nunca stale); o prop é só o arranque.
    const viva = corrida?.tarefa ?? tarefa;
    const processando = viva.relayEstado === 'processando';

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

    // Feed vivo: poll enquanto processa; ao voltar à tab recarrega já (o browser
    // estrangula timers em fundo — a causa do "tive de fazer F5" do smoke).
    useEffect(() => {
        if (!processando) return;
        const id = window.setInterval(carregar, 5000);
        return () => window.clearInterval(id);
    }, [processando, carregar]);
    useEffect(() => {
        const aoVoltar = () => {
            if (document.visibilityState === 'visible') carregar();
        };
        document.addEventListener('visibilitychange', aoVoltar);
        window.addEventListener('focus', aoVoltar);
        return () => {
            document.removeEventListener('visibilitychange', aoVoltar);
            window.removeEventListener('focus', aoVoltar);
        };
    }, [carregar]);

    // Chat-like: novas mensagens empurram o scroll para o fundo — mas SÓ se o
    // utilizador já lá estava (achado do Audit: sem o guard, ler o histórico
    // durante uma corrida ativa era impossível, o poll puxava-o de volta).
    const totalEventos = corrida?.eventos.length ?? 0;
    useEffect(() => {
        const el = feedRef.current;
        if (!el) return;
        const pertoDoFundo = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        if (pertoDoFundo || el.scrollTop === 0) {
            fundoRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [totalEventos]);

    async function guiar() {
        // aGuiar também aqui (não só no disabled do botão): o Enter com key-repeat
        // duplicava o steering antes do await resolver (achado do Audit).
        if (aGuiar || !repo || !issue || !orientacao.trim()) return;
        setAGuiar(true);
        const r = await guiarRelay(repo, issue, orientacao);
        setAGuiar(false);
        setAviso(r.detalhe);
        if (r.ok) {
            setOrientacao('');
            carregar();
        }
    }

    // Kill-switch (#M7-C): o diagnóstico corre no chat NORMAL do agente —
    // auto-envia o prompt de recuperação e o pai troca o feed pelo chat.
    async function diagnosticar() {
        const d = await runClientAction(
            { area: 'kanban', action: 'lerReposLigados', meta: {} },
            () => getJson<DefinicoesVista>('/api/definicoes'),
        );
        const repoPath = d?.githubRepos.find((r) => r.repo === repo)?.path ?? null;
        emitirPrefillChat(promptKillSwitchRelay(viva, repoPath), true);
        onDiagnosticar(viva);
    }

    const runs = agruparEventosPorRun(corrida?.eventos ?? []);
    const ultimaRun = runs.at(-1) ?? null;
    const custo = ultimaRun ? custoDosEventos(ultimaRun.eventos) : null;
    const pendentes = corrida?.steeringPendente ?? [];
    const truncada = totalEventos >= LIMITE_EVENTOS;

    return (
        <div className="flex h-full flex-col">
            {/* Cabeçalho da conversa do objeto: bola de estado + título + links. */}
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5 text-xs">
                <span
                    title={viva.relayEstado ?? 'sem relay'}
                    className={cn('h-2 w-2 shrink-0 rounded-full', corBolaEstado(viva.relayEstado))}
                />
                <span className="min-w-0 truncate font-medium" title={viva.titulo}>
                    {viva.titulo}
                </span>
                <a
                    className="inline-flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
                    href={`https://github.com/${repo}/issues/${issue}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    <ExternalLink className="h-3 w-3" /> #{issue}
                </a>
                {viva.relayPrUrl && (
                    <a
                        className="inline-flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
                        href={viva.relayPrUrl}
                        target="_blank"
                        rel="noreferrer"
                    >
                        <ExternalLink className="h-3 w-3" /> PR
                    </a>
                )}
                {custo && custo.total > 0 && (
                    <span className="shrink-0 rounded border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                        {formatarCusto(custo.total, custo.estimado)}
                    </span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-1">
                    {viva.relayEstado === 'bloqueado' && (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[0.65rem]"
                            onClick={() => void diagnosticar()}
                        >
                            Diagnosticar no chat
                        </Button>
                    )}
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        title="Fechar a conversa do objeto (volta ao chat)"
                        onClick={onFechar}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </span>
            </div>

            {/* Feed da corrida (chat-like). */}
            <div ref={feedRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
                {truncada && (
                    <p className="text-center text-[0.65rem] italic text-muted-foreground">
                        A mostrar os últimos {LIMITE_EVENTOS} eventos — o histórico completo vive
                        nos comentários da issue.
                    </p>
                )}
                {runs.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                        Ainda sem eventos desta issue — o feed nasce quando o relay corre.
                    </p>
                )}
                {runs.slice(0, -1).map((run, i) => (
                    <details key={run.runId} className="rounded-md border px-2 py-1">
                        <summary className="cursor-pointer text-[0.65rem] text-muted-foreground">
                            Corrida anterior {i + 1} ({run.eventos.length} eventos)
                        </summary>
                        <div className="mt-1.5 space-y-1.5 pb-1">
                            {run.eventos.map((e, j) => (
                                <MensagemEvento key={`${run.runId}-${j}`} e={e} />
                            ))}
                        </div>
                    </details>
                ))}
                {ultimaRun?.eventos.map((e, j) => (
                    <MensagemEvento key={`${ultimaRun.runId}-${j}`} e={e} />
                ))}
                {processando && (
                    <p className="animate-pulse text-xs text-muted-foreground">
                        {viva.relayProgresso ?? 'a correr…'}
                    </p>
                )}
                {pendentes.map((p) => (
                    <div key={p.id} className="flex justify-end">
                        <p className="flex max-w-[80%] items-start gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
                            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                            <span className="min-w-0 break-words">
                                {p.texto}{' '}
                                <span className="italic">
                                    (pendente — entra no próximo passo de produção)
                                </span>
                            </span>
                        </p>
                    </div>
                ))}
                <div ref={fundoRef} />
            </div>

            {/* Composer = steering (decisão do Carlos): escrever aqui guia o relay. */}
            <div className="shrink-0 border-t px-3 py-2">
                <div className="flex items-end gap-2">
                    <Textarea
                        value={orientacao}
                        onChange={(e) => setOrientacao(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void guiar();
                            }
                        }}
                        placeholder="Guiar a corrida (Enter envia): ex. usa a tabela X, não mexas no módulo Y…"
                        className="min-h-[2.5rem] flex-1 text-xs"
                        rows={1}
                    />
                    <Button
                        type="button"
                        size="sm"
                        onClick={guiar}
                        disabled={aGuiar || !orientacao.trim()}
                    >
                        {aGuiar ? 'A guiar…' : 'Guiar'}
                    </Button>
                </div>
                {aviso && <p className="mt-1 text-[0.65rem] text-muted-foreground">{aviso}</p>}
            </div>
        </div>
    );
}
