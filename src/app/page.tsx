import { Button } from '@/components/ui/button';

export default function Home() {
    return (
        <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
            <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
                codename: mem-vector
            </span>
            <h1 className="text-4xl font-semibold tracking-tight">O núcleo do MythosEngine</h1>
            <p className="text-balance text-muted-foreground">
                Falas, os agentes escrevem. Tasks, daily, conhecimento e RAG num só sítio — a
                acumulação de contexto é o fosso.
            </p>
            <div className="flex gap-3">
                <Button>Começar</Button>
                <Button variant="outline">Ver o plano</Button>
            </div>
        </main>
    );
}
