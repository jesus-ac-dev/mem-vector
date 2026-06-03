'use client';

import { useState } from 'react';
import { ask } from '@/modules/chat/chat.actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Message {
    role: 'user' | 'assistant';
    content: string;
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
            setMessages((prev) => [...prev, { role: 'assistant', content: res.answer }]);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro desconhecido');
        } finally {
            setPending(false);
        }
    }

    return (
        <main className="mx-auto flex h-dvh max-w-2xl flex-col gap-4 p-6">
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
        </main>
    );
}
