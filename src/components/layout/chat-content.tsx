'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Info, Radio, X } from 'lucide-react';
import { processarDestilacaoJob } from '@/modules/chat/chat.actions';
import { getJson } from '@/lib/api-get';
import { linkCitations, provenance, sourceHref, sourceLabel } from '@/modules/chat/chat.provenance';
import type { Source } from '@/modules/chat/chat.prompt';
import type { DailyEscrito, NotaEscrita, TarefasDoTurno } from '@/modules/chat/chat.service';
import type { MensagemHist } from '@/modules/chat/chat.conversas';
import {
    formatarTokens,
    totaisDoTrace,
    traceBadgeLabel,
    traceModelEvidence,
    traceProviderLabel,
    type ChatTrace,
} from '@/modules/chat/chat.trace';
import { Button } from '@/components/ui/button';
import { logClientError } from '@/lib/client-error-log';
import { Markdown } from '@/components/ui/markdown';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspace } from '@/components/layout/workspace-context';
import { runClientAction } from '@/lib/client-error-log';
import { gravarEscolhaChat } from '@/modules/definicoes/definicoes.actions';
import { ProviderIcon } from '@/components/layout/provider-icon';
import { DEFINICOES_MUDARAM_EVENT, pedirDefinicoes } from '@/components/layout/definicoes-modal';
import {
    ESFORCOS,
    MODELOS_SUGERIDOS,
    PROVIDER_LABEL,
    PROVIDERS,
    type AgenteVista,
    type DefinicoesVista,
    type Esforco,
    type Provider,
} from '@/modules/definicoes/definicoes.schema';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Message {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    sources?: Source[];
    escritas?: NotaEscrita[];
    daily?: DailyEscrito | null;
    tarefas?: TarefasDoTurno | null;
    distillationJobId?: string;
    destilando?: boolean;
    destilacaoErro?: boolean;
    trace?: ChatTrace | null;
}

// Eventos do stream do chat (#66, ndjson de POST /api/chat/stream).
interface EventoDone {
    tipo: 'done';
    conversationId: string;
    distillationJobId: string;
    provider: Provider;
    modelo?: string | null;
    modeloPedido?: string | null;
    costUsd: number | null;
    tokensIn: number | null;
    tokensCache: number | null;
    tokensOut: number | null;
    latencyMs: number;
    sources: Source[];
}

type EventoStreamCliente =
    | { tipo: 'inicio'; conversationId: string }
    | { tipo: 'fase'; fase: 'consultar' | 'gerar'; fontes?: number }
    | { tipo: 'delta'; texto: string }
    | EventoDone
    | { tipo: 'erro'; mensagem: string };

// Label da fase do turno para o indicador dinâmico (#66).
function labelFase(fase: 'consultar' | 'gerar', fontes?: number): string {
    if (fase === 'consultar') return 'a consultar o workspace';
    return fontes ? `a gerar (${fontes} ${fontes === 1 ? 'fonte' : 'fontes'})` : 'a gerar';
}

// Proveniência honesta: de onde veio a resposta — fontes do workspace ou
// conhecimento geral do modelo (quando o threshold cortou tudo).
function ProvenanceLine({ sources }: { sources: Source[] }) {
    const p = provenance(sources);
    if (!p.fromWorkspace) {
        return <p className="mt-1 text-xs text-muted-foreground">🌐 {p.label}</p>;
    }
    return (
        <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer">📚 {p.label}</summary>
            <ul className="mt-1 space-y-1 pl-4">
                {sources.map((s, i) => {
                    const href = sourceHref(s);
                    const label = sourceLabel(s, i);
                    return (
                        <li key={i}>
                            {href ? (
                                <Link href={href} className="font-medium text-primary">
                                    {label}
                                </Link>
                            ) : (
                                <span className="font-medium">{label}</span>
                            )}
                            {` · ${Math.round(s.similarity * 100)}%`}
                            <span className="block truncate">{s.content}</span>
                        </li>
                    );
                })}
            </ul>
        </details>
    );
}

function NotaEscritaChip({ escrita }: { escrita: NotaEscrita }) {
    return (
        <Link
            href={`/knowledge/${escrita.slug}`}
            className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-primary hover:bg-accent"
        >
            📝 {escrita.criada ? 'Nota criada' : 'Nota atualizada'}: {escrita.title}
        </Link>
    );
}

function DailyEscritoChip({ daily }: { daily: DailyEscrito }) {
    return (
        <Link
            href={`/daily/${daily.dia}`}
            className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-primary hover:bg-accent"
        >
            📅 Daily {daily.criado ? 'criado' : 'atualizado'}: {daily.dia}
        </Link>
    );
}

function formatarCusto(value: number | null | undefined): string {
    if (value === null || value === undefined) return 'não reportado pelo provider';
    return `$${value.toFixed(4)}`;
}

function formatarLatencia(value: number | null | undefined): string {
    if (value === null || value === undefined) return 'não reportada pelo provider';
    if (value < 1000) return `${value} ms`;
    return `${(value / 1000).toFixed(1)} s`;
}

function formatarHora(value: string | null | undefined): string {
    if (!value) return 'agora';
    return new Intl.DateTimeFormat('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

function TraceStateIcon({ trace }: { trace: ChatTrace | null | undefined }) {
    if (!trace) return <Info className="h-3.5 w-3.5" />;
    const evidence = traceModelEvidence(trace);
    if (evidence.state === 'divergente') return <AlertTriangle className="h-3.5 w-3.5" />;
    if (evidence.state === 'confirmado') return <CheckCircle2 className="h-3.5 w-3.5" />;
    return <Info className="h-3.5 w-3.5" />;
}

function TraceChip({
    trace,
    fallback,
    onClick,
}: {
    trace: ChatTrace | null;
    fallback: { provider: Provider; modelo?: string };
    onClick: () => void;
}) {
    const label = trace
        ? traceBadgeLabel(trace)
        : `${PROVIDER_LABEL[fallback.provider]} · ${fallback.modelo ?? 'default'}`;
    const evidence = trace ? traceModelEvidence(trace) : null;

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            title="Ver trace da conversa"
            className={cn(
                'h-6 min-w-0 max-w-full justify-start gap-1.5 px-2 text-[0.7rem] font-normal',
                evidence?.state === 'divergente'
                    ? 'text-destructive hover:text-destructive'
                    : 'text-muted-foreground hover:text-foreground',
            )}
        >
            <Activity className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
            <TraceStateIcon trace={trace} />
        </Button>
    );
}

const PROVIDERS_COM_ESFORCO: Provider[] = ['codex'];

function selectTriggerClass(className?: string) {
    return cn(
        'h-6 w-auto min-w-0 flex-row-reverse justify-end gap-1 border-none bg-transparent px-1 text-[0.7rem] text-muted-foreground shadow-none focus:ring-0',
        className,
    );
}

function agenteDefault(): AgenteVista {
    return { ativo: true, modo: 'cli', temApiKey: false };
}

function ChatControls({
    defs,
    lastTrace,
    onTraceClick,
    onEscolha,
}: {
    defs: DefinicoesVista | null;
    lastTrace: ChatTrace | null;
    onTraceClick: () => void;
    onEscolha: (defs: DefinicoesVista) => void;
}) {
    const provider = defs?.chatProvider ?? 'claude';
    const atual = defs?.agentes[provider] ?? agenteDefault();
    const modelos = defs
        ? atual.modelos?.length
            ? atual.modelos
            : MODELOS_SUGERIDOS[provider]
        : [];
    const ativos = defs ? PROVIDERS.filter((p) => defs.agentes[p]?.ativo) : [];

    function escolher(campos: {
        provider?: Provider;
        modelo?: string | null;
        esforco?: Esforco | null;
    }) {
        if (!defs) return;
        const proximoProvider = campos.provider ?? defs.chatProvider;
        const proximoAtual = defs.agentes[proximoProvider] ?? agenteDefault();
        const novoAgente: AgenteVista = {
            ...proximoAtual,
            ...(campos.modelo !== undefined ? { modelo: campos.modelo ?? undefined } : {}),
            ...(campos.esforco !== undefined ? { esforco: campos.esforco ?? undefined } : {}),
        };
        const novasDefs: DefinicoesVista = {
            ...defs,
            chatProvider: proximoProvider,
            agentes: { ...defs.agentes, [proximoProvider]: novoAgente },
        };
        onEscolha(novasDefs);
        void runClientAction({ area: 'chat-controls', action: 'gravarEscolhaChat' }, () =>
            gravarEscolhaChat({
                provider: proximoProvider,
                modelo: campos.modelo,
                esforco: campos.esforco,
            }),
        );
    }

    // Caminho (a): sem provider ativo, em vez dos dropdowns mostra-se o erro
    // + atalho para configurar (não há default que use a conta da máquina).
    if (defs && ativos.length === 0) {
        return (
            <div className="flex shrink-0 flex-wrap items-center gap-2 text-[0.7rem] text-muted-foreground">
                <span>Sem provider configurado.</span>
                <Button
                    type="button"
                    variant="link"
                    onClick={() => pedirDefinicoes('agentes')}
                    className="h-auto p-0 text-[0.7rem]"
                >
                    Configurar em Definições &gt; Agentes
                </Button>
            </div>
        );
    }

    return (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-muted-foreground">
            <TraceChip
                trace={lastTrace}
                fallback={{ provider, modelo: atual.modelo }}
                onClick={onTraceClick}
            />

            <Select
                value={provider}
                onValueChange={(v) => escolher({ provider: v as Provider })}
                disabled={!defs}
            >
                <SelectTrigger className={selectTriggerClass('max-w-[9rem]')}>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {(ativos.length ? ativos : (['claude'] as Provider[])).map((p) => (
                        <SelectItem key={p} value={p}>
                            <span className="flex items-center gap-2">
                                <ProviderIcon provider={p} className="h-5 w-5" />
                                {PROVIDER_LABEL[p]}
                            </span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select
                value={atual.modelo ?? 'default'}
                onValueChange={(m) => escolher({ modelo: m === 'default' ? null : m })}
                disabled={!defs}
            >
                <SelectTrigger
                    title={
                        modelos.length
                            ? 'Modelo que responde ao chat'
                            : 'Sem lista descoberta; usar default do provider'
                    }
                    className={selectTriggerClass('max-w-[12rem]')}
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="default">modelo default</SelectItem>
                    {modelos.map((m) => (
                        <SelectItem key={m} value={m}>
                            {m}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {PROVIDERS_COM_ESFORCO.includes(provider) && (
                <Select
                    value={atual.esforco ?? 'default'}
                    onValueChange={(v) =>
                        escolher({ esforco: v === 'default' ? null : (v as Esforco) })
                    }
                    disabled={!defs}
                >
                    <SelectTrigger
                        title="Esforço de raciocínio"
                        className={selectTriggerClass('max-w-[8rem]')}
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">esforço default</SelectItem>
                        {ESFORCOS.map((e) => (
                            <SelectItem key={e} value={e}>
                                {e}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </div>
    );
}

function TraceInspector({
    open,
    onOpenChange,
    messages,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    messages: Message[];
}) {
    const turnos = messages.reduce<Array<{ message: Message; pergunta?: string }>>(
        (acc, message, index) => {
            if (message.role !== 'assistant') return acc;
            const pergunta = [...messages.slice(0, index)]
                .reverse()
                .find((m) => m.role === 'user')?.content;
            acc.push({ message, pergunta });
            return acc;
        },
        [],
    );
    const totais = totaisDoTrace(turnos.map((t) => t.message.trace));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="left-auto right-0 top-0 flex h-dvh w-[min(30rem,100vw)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 sm:rounded-none">
                <DialogHeader className="border-b px-4 py-3">
                    <DialogTitle className="flex items-center gap-2 text-sm">
                        <Radio className="h-4 w-4" />
                        Trace da conversa
                    </DialogTitle>
                    <DialogDescription>
                        Provider, modelo e sinais técnicos guardados por resposta.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto">
                    {turnos.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-muted-foreground">
                            Ainda não há chamadas de modelo nesta conversa.
                        </p>
                    ) : (
                        <div className="divide-y">
                            {turnos.map(({ message, pergunta }, index) => {
                                const trace = message.trace;
                                const evidence = trace ? traceModelEvidence(trace) : null;
                                return (
                                    <section key={message.id} className="space-y-3 px-4 py-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-medium uppercase text-muted-foreground">
                                                    Turno {index + 1}
                                                </p>
                                                <p className="mt-1 line-clamp-2 text-sm">
                                                    {pergunta ?? 'Pergunta indisponível'}
                                                </p>
                                            </div>
                                            <span
                                                className={cn(
                                                    'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                                                    evidence?.state === 'divergente'
                                                        ? 'border-destructive text-destructive'
                                                        : 'border-border text-muted-foreground',
                                                )}
                                            >
                                                <TraceStateIcon trace={trace} />
                                                {evidence?.label ?? 'trace indisponível'}
                                            </span>
                                        </div>

                                        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-xs">
                                            <dt className="text-muted-foreground">provider</dt>
                                            <dd>{traceProviderLabel(trace?.provider)}</dd>
                                            <dt className="text-muted-foreground">modelo pedido</dt>
                                            <dd>
                                                {trace?.requestedModel ?? 'default do provider'}
                                            </dd>
                                            <dt className="text-muted-foreground">
                                                modelo efetivo
                                            </dt>
                                            <dd>
                                                {trace?.effectiveModel ??
                                                    'não reportado pelo provider'}
                                            </dd>
                                            <dt className="text-muted-foreground">fontes</dt>
                                            <dd>
                                                {trace?.sourcesCount ??
                                                    message.sources?.length ??
                                                    0}
                                            </dd>
                                            <dt className="text-muted-foreground">latência</dt>
                                            <dd className="inline-flex items-center gap-1">
                                                <Clock3 className="h-3 w-3" />
                                                {formatarLatencia(trace?.latencyMs)}
                                            </dd>
                                            <dt className="text-muted-foreground">custo</dt>
                                            <dd>{formatarCusto(trace?.costUsd)}</dd>
                                            <dt className="text-muted-foreground">tokens</dt>
                                            <dd>
                                                {formatarTokens(
                                                    trace?.tokensIn,
                                                    trace?.tokensCache,
                                                    trace?.tokensOut,
                                                )}
                                            </dd>
                                            <dt className="text-muted-foreground">hora</dt>
                                            <dd>{formatarHora(trace?.createdAt)}</dd>
                                            <dt className="text-muted-foreground">job</dt>
                                            <dd>
                                                {trace?.distillationJobId
                                                    ? trace.distillationJobId.slice(0, 8)
                                                    : (message.distillationJobId?.slice(0, 8) ??
                                                      'não ligado')}
                                            </dd>
                                        </dl>
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>
                {turnos.length > 0 && (
                    // Footer fixo (pedido do Carlos): os turnos fazem scroll, o
                    // total da conversa fica sempre à vista.
                    <div className="border-t px-4 py-3 text-xs">
                        <p className="font-medium uppercase text-muted-foreground">
                            Total da conversa
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-3">
                            <span>
                                {formatarTokens(
                                    totais.tokensIn,
                                    totais.tokensCache,
                                    totais.tokensOut,
                                )}
                            </span>
                            <span className="font-medium">{formatarCusto(totais.custoUsd)}</span>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

// Coluna do chat, reutilizável: página /chat (coluna 50/50) e rodapé do
// kanban (#58 — visão fechada 2026-06-05: em modo kanban o chat desce para
// a faixa inferior, ao nível do grafo e do calendário). Em rodapé esconde o
// header (o X fecha o chat da página, não da faixa) e compacta o input.
export function ChatContent({ rodape = false }: { rodape?: boolean } = {}) {
    const router = useRouter();
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [pending, setPending] = useState(false);
    // #66: true assim que o 1.º token chega — esconde o indicador e deixa a
    // resposta aparecer a streamar. `faseAtual` narra o turno (consultar→gerar).
    const [respostaIniciada, setRespostaIniciada] = useState(false);
    const [faseAtual, setFaseAtual] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string | undefined>(undefined);
    const [lastTrace, setLastTrace] = useState<ChatTrace | null>(null);
    const [error, setError] = useState<string | null>(null);
    const nextIdRef = useRef(0);
    const bottomRef = useRef<HTMLDivElement>(null);
    const { conversaAberta, abrirConversa, fecharChat, notificarWorkspaceMudou } = useWorkspace();
    const conversaCarregadaRef = useRef<string | null>(null);
    // Provider/modelo do chat (#60): controlos inline abaixo da textarea.
    const [defsChat, setDefsChat] = useState<DefinicoesVista | null>(null);
    const [traceAberto, setTraceAberto] = useState(false);

    const defsCanceladoRef = useRef(false);
    useEffect(() => {
        defsCanceladoRef.current = false;
        function carregarDefs() {
            void runClientAction({ area: 'chat', action: 'lerDefinicoes' }, () =>
                getJson<DefinicoesVista>('/api/definicoes'),
            ).then((d) => {
                // ref (não closure): o cancelamento cobre também os re-fetches
                // do listener, não só a leitura inicial do mount.
                if (defsCanceladoRef.current || !d) return;
                setDefsChat(d);
            });
        }
        carregarDefs();
        // Guardar nas Definições muda o provider/modelo do chat — re-busca sem F5
        // (antes os controlos do composer ficavam presos à leitura do mount).
        window.addEventListener(DEFINICOES_MUDARAM_EVENT, carregarDefs);
        return () => {
            defsCanceladoRef.current = true;
            window.removeEventListener(DEFINICOES_MUDARAM_EVENT, carregarDefs);
        };
    }, []);

    // Mantém a vista colada ao fundo (mensagens crescem de baixo para cima).
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pending]);

    useEffect(() => {
        const alvo = conversaAberta; // string | null
        if (alvo === conversaCarregadaRef.current) return;
        let cancelled = false;
        const p = alvo
            ? getJson<MensagemHist[]>(`/api/conversa?id=${encodeURIComponent(alvo)}`)
            : Promise.resolve([] as MensagemHist[]);
        p.then((msgs) => {
            if (cancelled) return;
            conversaCarregadaRef.current = alvo;
            setConversationId(alvo ?? undefined);
            setMessages(
                msgs.map((m) => ({
                    id: nextIdRef.current++,
                    role: m.role,
                    content: m.content,
                    // Religa as citações [N] e mostra a proveniência na conversa reaberta.
                    sources: m.sources ?? undefined,
                    trace: m.trace,
                })),
            );
            const ultimoTrace = [...msgs].reverse().find((m) => m.trace)?.trace ?? null;
            setLastTrace(ultimoTrace);
        }).catch(() => {
            // on failure, don't half-load
        });
        return () => {
            cancelled = true;
        };
    }, [conversaAberta]);

    async function handleSend() {
        const question = input.trim();
        if (!question || pending) return;
        setError(null);
        // Caminho (a): sem provider configurado é estado ESPERADO — avisa inline
        // (a vermelho, acima da textarea) sem chamar o servidor nem logar como
        // erro de app. O throw no factory fica só como guarda de último recurso.
        if (defsChat && !PROVIDERS.some((p) => defsChat.agentes[p]?.ativo)) {
            setError('Configura um provider em Definições > Agentes antes de conversar.');
            return;
        }
        const userMsgId = nextIdRef.current++;
        setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: question }]);
        setInput('');
        setPending(true);
        setRespostaIniciada(false);
        setFaseAtual(null);

        // Streaming (#66): a resposta aparece token-a-token via ndjson. A bolha do
        // assistente nasce no 1.º delta (até lá fica o indicador "a pensar").
        const asstMsgId = nextIdRef.current++;
        let acumulado = '';
        let criada = false;
        const aplicarDelta = (texto: string) => {
            acumulado += texto;
            if (!criada) {
                criada = true;
                setRespostaIniciada(true);
            }
            setMessages((prev) =>
                prev.some((m) => m.id === asstMsgId)
                    ? prev.map((m) => (m.id === asstMsgId ? { ...m, content: acumulado } : m))
                    : [...prev, { id: asstMsgId, role: 'assistant', content: acumulado }],
            );
        };

        try {
            const res = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ question, conversationId }),
            });
            if (res.status === 401)
                throw new Error('A sessão expirou — recarrega e volta a entrar.');
            if (!res.ok || !res.body) throw new Error(`stream do chat: HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let done: EventoDone | null = null;
            let erro: string | null = null;

            for (;;) {
                const { value, done: terminou } = await reader.read();
                if (terminou) break;
                buffer += decoder.decode(value, { stream: true });
                let nl: number;
                while ((nl = buffer.indexOf('\n')) >= 0) {
                    const linha = buffer.slice(0, nl).trim();
                    buffer = buffer.slice(nl + 1);
                    if (!linha) continue;
                    let ev: EventoStreamCliente;
                    try {
                        ev = JSON.parse(linha) as EventoStreamCliente;
                    } catch {
                        continue; // linha malformada → ignorar (como o servidor faz)
                    }
                    if (ev.tipo === 'inicio') {
                        setConversationId(ev.conversationId);
                        if (conversaAberta === null) {
                            conversaCarregadaRef.current = ev.conversationId;
                            abrirConversa(ev.conversationId);
                        }
                    } else if (ev.tipo === 'fase') {
                        setFaseAtual(labelFase(ev.fase, ev.fontes));
                    } else if (ev.tipo === 'delta') {
                        aplicarDelta(ev.texto);
                    } else if (ev.tipo === 'done') {
                        done = ev;
                    } else if (ev.tipo === 'erro') {
                        erro = ev.mensagem;
                    }
                }
            }

            if (erro) throw new Error(erro);
            if (!done) throw new Error('o stream terminou sem resposta');

            const trace: ChatTrace = {
                provider: done.provider,
                requestedModel: done.modeloPedido ?? null,
                effectiveModel: done.modelo ?? null,
                costUsd: done.costUsd,
                tokensIn: done.tokensIn,
                tokensCache: done.tokensCache,
                tokensOut: done.tokensOut,
                latencyMs: done.latencyMs,
                sourcesCount: done.sources?.length ?? 0,
                createdAt: new Date().toISOString(),
                distillationJobId: done.distillationJobId,
            };
            setLastTrace(trace);
            // Finaliza a bolha: fontes + trace + estado de destilação (cria-a se a
            // resposta veio vazia e nenhum delta a tinha criado).
            const doneFinal = done;
            setMessages((prev) => {
                const patch = {
                    content: acumulado,
                    sources: doneFinal.sources,
                    distillationJobId: doneFinal.distillationJobId,
                    destilando: true,
                    trace,
                };
                return prev.some((m) => m.id === asstMsgId)
                    ? prev.map((m) => (m.id === asstMsgId ? { ...m, ...patch } : m))
                    : [...prev, { id: asstMsgId, role: 'assistant' as const, ...patch }];
            });
            setPending(false);

            // Processa o job de destilação (já persistido) em segundo plano.
            processarDestilacaoJob(done.distillationJobId)
                .then(({ notas, daily, tarefas }) => {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === asstMsgId
                                ? { ...m, destilando: false, escritas: notas, daily, tarefas }
                                : m,
                        ),
                    );
                    // O agente escreveu estado: o ambiente reage ao vivo — explorer,
                    // grafo, sidebar e panes abertos ouvem o workspaceVersion; o
                    // router.refresh cobre os server components (calendário, /daily).
                    if (notas.length || daily || tarefas) {
                        notificarWorkspaceMudou();
                        router.refresh();
                    }
                })
                .catch((e: unknown) => {
                    // The job is durable in agent_jobs; this only reflects the current UI attempt.
                    logClientError({ area: 'chat', action: 'processarDestilacaoJob' }, e);
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === asstMsgId
                                ? { ...m, destilando: false, destilacaoErro: true }
                                : m,
                        ),
                    );
                });
        } catch (e) {
            logClientError({ area: 'chat', action: 'chat-stream' }, e);
            setError(e instanceof Error ? e.message : 'Erro desconhecido');
            // Erro DEPOIS de já ter saído texto: a bolha existe mas está
            // incompleta — marca-a (reusa o estado que a UI já sabe mostrar) em
            // vez de a deixar pendurada como se fosse resposta completa.
            if (criada) {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === asstMsgId ? { ...m, destilando: false, destilacaoErro: true } : m,
                    ),
                );
            }
            setPending(false);
        }
    }

    return (
        <div
            className={
                rodape
                    ? 'flex h-full w-full flex-col gap-2 p-3'
                    : 'flex h-full w-full flex-col gap-3 p-6'
            }
        >
            {!rodape && (
                <header className="flex shrink-0 items-center justify-between">
                    <h1 className="text-sm font-semibold">Chat</h1>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={fecharChat}
                        title="Fechar chat"
                        aria-label="Fechar chat"
                        className="h-7 w-7 text-muted-foreground"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </header>
            )}

            {/* Lista de mensagens — coladas ao fundo, crescem para cima */}
            <div className="flex-1 overflow-y-auto rounded-lg border p-4">
                <div className="flex min-h-full flex-col justify-end space-y-3">
                    {messages.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                            Faz uma pergunta sobre o mem-vector...
                        </p>
                    )}
                    {messages.map((m) => (
                        <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                            {m.role === 'user' ? (
                                <span className="inline-block whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                                    {m.content}
                                </span>
                            ) : (
                                <span className="inline-block rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                                    {/* wikilinks ligados (#27, smoke 2026-06-11): [[slug]] na
                                        resposta abre a nota, como os chips e as citações. */}
                                    <Markdown content={linkCitations(m.content, m.sources ?? [])} />
                                </span>
                            )}
                            {m.role === 'assistant' && m.sources && (
                                <ProvenanceLine sources={m.sources} />
                            )}
                            {m.role === 'assistant' && m.destilando && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    job {m.distillationJobId?.slice(0, 8)} guardado · a destilar…
                                </p>
                            )}
                            {m.role === 'assistant' && m.destilacaoErro && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    job {m.distillationJobId?.slice(0, 8)} guardado · destilação
                                    pendente
                                </p>
                            )}
                            {m.role === 'assistant' &&
                                m.escritas?.map((e) => (
                                    <div key={e.slug}>
                                        <NotaEscritaChip escrita={e} />
                                    </div>
                                ))}
                            {m.role === 'assistant' && m.daily && (
                                <div>
                                    <DailyEscritoChip daily={m.daily} />
                                </div>
                            )}
                            {m.role === 'assistant' &&
                                m.tarefas &&
                                [
                                    ...m.tarefas.criadas.map((t) => ({ t, acao: 'criada' })),
                                    ...m.tarefas.concluidas.map((t) => ({ t, acao: 'concluída' })),
                                ].map(({ t, acao }) => (
                                    <div key={`${acao}-${t.id}`}>
                                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-primary">
                                            ☑️ Tarefa {acao}: {t.titulo}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    ))}
                    {pending && !respostaIniciada && (
                        <p className="animate-pulse text-sm text-muted-foreground">
                            {faseAtual ?? 'a pensar'}…
                        </p>
                    )}
                    <div ref={bottomRef} />
                </div>
            </div>

            {error && <p className="shrink-0 text-sm text-destructive">{error}</p>}

            <div className="flex shrink-0 gap-2">
                <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSend();
                    }}
                    placeholder="Escreve aqui... (Ctrl/Cmd+Enter envia)"
                    rows={rodape ? 2 : 3}
                    className="flex-1 resize-none"
                />
                <Button onClick={() => void handleSend()} disabled={pending} className="self-end">
                    Enviar
                </Button>
            </div>
            <ChatControls
                defs={defsChat}
                lastTrace={lastTrace}
                onTraceClick={() => setTraceAberto(true)}
                onEscolha={setDefsChat}
            />
            <TraceInspector open={traceAberto} onOpenChange={setTraceAberto} messages={messages} />
        </div>
    );
}
