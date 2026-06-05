'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ask } from '@/modules/chat/chat.actions';
import { provenance } from '@/modules/chat/chat.provenance';
import type { Source } from '@/modules/chat/chat.prompt';
import type { NotaEscrita } from '@/modules/chat/chat.service';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    sources?: Source[];
    escrita?: NotaEscrita | null;
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
                {sources.map((s, i) => (
                    <li key={i}>
                        <span className="font-medium">{s.source ?? 'workspace'}</span>
                        {` · ${Math.round(s.similarity * 100)}%`}
                        <span className="block truncate">{s.content}</span>
                    </li>
                ))}
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

export default function ChatPage() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [pending, setPending] = useState(false);
    const [conversationId, setConversationId] = useState<string | undefined>(undefined);
    const [lastCost, setLastCost] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleSend() {
        const question = input.trim();
        if (!question || pending) return;
        setError(null);
        setMessages((prev) => [...prev, { role: 'user', content: question }]);
        setInput('');
        setPending(true);
        try {
            const res = await ask({ question, conversationId });
            setConversationId(res.conversationId);
            setLastCost(res.costUsd);
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: res.answer,
                    sources: res.sources,
                    escrita: res.escrita,
                },
            ]);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro desconhecido');
        } finally {
            setPending(false);
        }
    }

    return (
        <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 p-6">
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
                {messages.map((m, i) => (
                    <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                        <span
                            className={
                                'inline-block whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ' +
                                (m.role === 'user'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-foreground')
                            }
                        >
                            {m.content}
                        </span>
                        {m.role === 'assistant' && m.sources && (
                            <ProvenanceLine sources={m.sources} />
                        )}
                        {m.role === 'assistant' && m.escrita && (
                            <div>
                                <NotaEscritaChip escrita={m.escrita} />
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
