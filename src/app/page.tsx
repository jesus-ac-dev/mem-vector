import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PublicHeader } from '@/components/layout/public-header';

export default function Home() {
    return (
        <div className="flex min-h-dvh flex-col">
            <PublicHeader />
            <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
                <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                    codename: mem-vector
                </span>
                <h1 className="text-4xl font-semibold tracking-tight">O teu workspace</h1>
                <p className="text-balance text-muted-foreground">
                    Falas, os agentes escrevem. Tasks, daily, conhecimento e RAG num só sítio — a
                    acumulação de contexto é o fosso.
                </p>
                <div className="flex gap-3">
                    <Button asChild>
                        <Link href="/login">Começar</Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/chat">Entrar na app</Link>
                    </Button>
                </div>
            </main>
        </div>
    );
}
