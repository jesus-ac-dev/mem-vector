import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getConversa, carregarConversa } from '@/modules/chat/chat.conversas';
import { Markdown } from '@/components/ui/markdown';

// Vista navegável de uma conversa completa (teia de memória): o [[conversa:<id>]]
// no heading da daily aterra aqui. Read-only, padrão server component do /daily/[dia].
export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const conversa = await getConversa(id);
    if (!conversa) notFound();

    const mensagens = await carregarConversa(id);

    return (
        <div className="mx-auto max-w-3xl px-6 py-8">
            <Link
                href="/chat"
                className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" /> Chat
            </Link>
            <h1 className="mb-1 text-2xl font-semibold text-foreground">{conversa.titulo}</h1>
            <p className="mb-6 text-sm text-muted-foreground">Conversa completa</p>

            <div className="space-y-4">
                {mensagens.map((m) => (
                    <div
                        key={m.id}
                        className={
                            m.role === 'user'
                                ? 'rounded-lg bg-muted/50 p-3'
                                : 'rounded-lg border border-border p-3'
                        }
                    >
                        <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                            {m.role === 'user' ? 'Tu' : 'Assistente'}
                        </div>
                        <Markdown content={m.content} wikilinks={false} />
                    </div>
                ))}
            </div>
        </div>
    );
}
