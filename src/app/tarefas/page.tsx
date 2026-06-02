import { Button } from '@/components/ui/button';
import { criarTarefa } from '@/modules/tarefas/tarefas.actions';
import { listarTarefas } from '@/modules/tarefas/tarefas.service';

// Ecrã: Server Component. Lê direto do serviço; escreve via Server Action.
// Sem hook porque não há estado de cliente (ainda).
export default async function TarefasPage() {
    const tarefas = await listarTarefas();

    return (
        <main className="mx-auto max-w-2xl p-6">
            <h1 className="mb-6 text-2xl font-semibold tracking-tight">Tarefas</h1>

            <form action={criarTarefa} className="mb-6 flex gap-2">
                <input
                    name="titulo"
                    placeholder="Nova tarefa…"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <Button type="submit">Adicionar</Button>
            </form>

            <ul className="space-y-2">
                {tarefas.map((t) => (
                    <li key={t.id} className="rounded-md border px-3 py-2 text-sm">
                        {t.titulo}
                    </li>
                ))}
            </ul>
        </main>
    );
}
