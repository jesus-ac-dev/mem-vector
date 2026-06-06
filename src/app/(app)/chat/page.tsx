'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ask, destilarTurno, carregarConversaAction } from '@/modules/chat/chat.actions';
import { linkCitations, provenance, sourceHref, sourceLabel } from '@/modules/chat/chat.provenance';
import type { Source } from '@/modules/chat/chat.prompt';
import type { DailyEscrito, NotaEscrita } from '@/modules/chat/chat.service';
import type { MensagemHist } from '@/modules/chat/chat.conversas';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspace } from '@/components/layout/workspace-context';
import { FilePane } from '@/components/layout/file-pane';

interface Message {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    sources?: Source[];
    escrita?: NotaEscrita | null;
    daily?: DailyEscrito | null;
    destilando?: boolean;
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
    const { conversaAberta, abrirConversa } = useWorkspace();
    const conversaCarregadaRef = useRef<string | null>(null);

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
            // Step 1: get the answer and render it immediately.
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
                    destilando: true,
                },
            ]);
            setPending(false);

            // Step 2: distil in the background; update the message when done.
            destilarTurno(question, res.answer)
                .then(({ nota, daily }) => {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === asstMsgId
                                ? { ...m, destilando: false, escrita: nota, daily }
                                : m,
                        ),
                    );
                    if (nota || daily) router.refresh();
                })
                .catch(() => {
                    // distillation failure is silent — just clear the hint
                    setMessages((prev) =>
                        prev.map((m) => (m.id === asstMsgId ? { ...m, destilando: false } : m)),
                    );
                });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro desconhecido');
            setPending(false);
        }
    }

    return (
        <div className="flex h-full w-full flex-col gap-4 p-6">
            <header>
                <h1 className="text-xl font-semibold">mem-vector — chat (ping-pong)</h1>
                <p className="text-sm text-muted-foreground">
                    RAG local: e5-small (CPU) + Supabase + claude CLI.
                </p>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border p-4">
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
                            <p className="mt-1 text-xs text-muted-foreground">a destilar…</p>
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
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {lastCost !== null && (
                <p className="text-xs text-muted-foreground">
                    último custo: ${lastCost.toFixed(4)}
                </p>
            )}

            <div className="flex gap-2">
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
    const { ficheiroAberto } = useWorkspace();

    return (
        <div className="flex h-full overflow-hidden">
            {/* Chat pane — shrinks to 50% when a file is open, else fills */}
            <div
                className={
                    ficheiroAberto
                        ? 'flex flex-1 basis-0 overflow-y-auto'
                        : 'flex flex-1 overflow-y-auto'
                }
            >
                <ChatContent />
            </div>

            {/* File pane — only visible when ficheiroAberto is set */}
            {ficheiroAberto && (
                <div className="flex flex-1 basis-0 overflow-hidden">
                    <FilePane ficheiro={ficheiroAberto} />
                </div>
            )}
        </div>
    );
}
