'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { ask, processarDestilacaoJob, carregarConversaAction } from '@/modules/chat/chat.actions';
import { linkCitations, provenance, sourceHref, sourceLabel } from '@/modules/chat/chat.provenance';
import type { Source } from '@/modules/chat/chat.prompt';
import type { DailyEscrito, NotaEscrita } from '@/modules/chat/chat.service';
import type { MensagemHist } from '@/modules/chat/chat.conversas';
import { Button } from '@/components/ui/button';
import { isUnexpectedServerActionResponse, logClientError } from '@/lib/client-error-log';
import { Markdown } from '@/components/ui/markdown';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspace } from '@/components/layout/workspace-context';
import { FilePane } from '@/components/layout/file-pane';
import { WorkspaceHome } from '@/components/layout/workspace-home';

interface Message {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    sources?: Source[];
    escrita?: NotaEscrita | null;
    daily?: DailyEscrito | null;
    distillationJobId?: string;
    destilando?: boolean;
    destilacaoErro?: boolean;
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

function ChatContent() {
    const router = useRouter();
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [pending, setPending] = useState(false);
    const [conversationId, setConversationId] = useState<string | undefined>(undefined);
    const [lastCost, setLastCost] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const nextIdRef = useRef(0);
    const bottomRef = useRef<HTMLDivElement>(null);
    const { conversaAberta, abrirConversa, fecharChat, notificarWorkspaceMudou } = useWorkspace();
    const conversaCarregadaRef = useRef<string | null>(null);

    // Mantém a vista colada ao fundo (mensagens crescem de baixo para cima).
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pending]);

    useEffect(() => {
        const alvo = conversaAberta; // string | null
        if (alvo === conversaCarregadaRef.current) return;
        let cancelled = false;
        const p = alvo ? carregarConversaAction(alvo) : Promise.resolve([] as MensagemHist[]);
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
                })),
            );
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
        const userMsgId = nextIdRef.current++;
        setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: question }]);
        setInput('');
        setPending(true);

        let asstMsgId: number;
        try {
            // Step 1: get the answer and render it immediately. Sem retry: ask() é
            // escrita (não idempotente) e num action ID morto o retry bate no mesmo ID.
            const res = await ask({ question, conversationId });
            setConversationId(res.conversationId);
            if (conversaAberta === null) {
                conversaCarregadaRef.current = res.conversationId;
                abrirConversa(res.conversationId);
            }
            setLastCost(res.costUsd);
            asstMsgId = nextIdRef.current++;
            setMessages((prev) => [
                ...prev,
                {
                    id: asstMsgId,
                    role: 'assistant',
                    content: res.answer,
                    sources: res.sources,
                    distillationJobId: res.distillationJobId,
                    destilando: true,
                },
            ]);
            setPending(false);

            // Step 2: process the already-persisted distillation job in the background.
            processarDestilacaoJob(res.distillationJobId)
                .then(({ nota, daily }) => {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === asstMsgId
                                ? { ...m, destilando: false, escrita: nota, daily }
                                : m,
                        ),
                    );
                    // O agente escreveu estado: o ambiente reage ao vivo — explorer,
                    // grafo, sidebar e panes abertos ouvem o workspaceVersion; o
                    // router.refresh cobre os server components (calendário, /daily).
                    if (nota || daily) {
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
            logClientError({ area: 'chat', action: 'ask' }, e);
            // Caso conhecido: o dev server recompilou (edição ou commit com lint-staged)
            // e este tab ficou com IDs de server actions mortos — só o reload resolve.
            setError(
                isUnexpectedServerActionResponse(e)
                    ? 'O servidor recompilou e este tab ficou desatualizado. Faz hard reload (Ctrl+Shift+R), volta a entrar e reenvia a mensagem.'
                    : e instanceof Error
                      ? e.message
                      : 'Erro desconhecido',
            );
            setPending(false);
        }
    }

    return (
        <div className="flex h-full w-full flex-col gap-3 p-6">
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
                                    <Markdown
                                        content={linkCitations(m.content, m.sources ?? [])}
                                        wikilinks={false}
                                    />
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
                            {m.role === 'assistant' && m.escrita && (
                                <div>
                                    <NotaEscritaChip escrita={m.escrita} />
                                </div>
                            )}
                            {m.role === 'assistant' && m.daily && (
                                <div>
                                    <DailyEscritoChip daily={m.daily} />
                                </div>
                            )}
                        </div>
                    ))}
                    {pending && <p className="text-sm text-muted-foreground">a pensar...</p>}
                    <div ref={bottomRef} />
                </div>
            </div>

            {error && <p className="shrink-0 text-sm text-destructive">{error}</p>}
            {lastCost !== null && (
                <p className="shrink-0 text-xs text-muted-foreground">
                    último custo: ${lastCost.toFixed(4)}
                </p>
            )}

            <div className="flex shrink-0 gap-2">
                <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSend();
                    }}
                    placeholder="Escreve aqui... (Ctrl/Cmd+Enter envia)"
                    rows={3}
                    className="flex-1 resize-none"
                />
                <Button onClick={() => void handleSend()} disabled={pending} className="self-end">
                    Enviar
                </Button>
            </div>
        </div>
    );
}

export default function ChatPage() {
    const { chatAberto, ficheirosAbertos } = useWorkspace();
    const temFicheiros = ficheirosAbertos.length > 0;

    // Tudo fechado → Home (estilo VSCode, ações ao centro).
    if (!chatAberto && !temFicheiros) {
        return <WorkspaceHome />;
    }

    return (
        <div className="flex h-full overflow-hidden">
            {/* Chat — 50% quando há ficheiros, senão preenche */}
            {chatAberto && (
                <div
                    className={
                        temFicheiros
                            ? 'flex flex-1 basis-0 overflow-hidden'
                            : 'flex flex-1 overflow-hidden'
                    }
                >
                    <ChatContent />
                </div>
            )}

            {/* Tabs de ficheiros — 50% quando o chat está aberto, senão preenche */}
            {temFicheiros && (
                <div
                    className={
                        chatAberto
                            ? 'flex flex-1 basis-0 overflow-hidden'
                            : 'flex flex-1 overflow-hidden'
                    }
                >
                    <FilePane />
                </div>
            )}
        </div>
    );
}
