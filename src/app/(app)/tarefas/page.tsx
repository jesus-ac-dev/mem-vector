import { NovaTarefaForm } from '@/modules/tarefas/nova-tarefa-form';
import { listarTarefas } from '@/modules/tarefas/tarefas.service';
import { listarMeusGrupos } from '@/modules/grupos/grupos.service';

// Ecrã: Server Component. Lê direto dos serviços; escreve via Server Action.
// A lista já inclui (via RLS) as próprias + as protected dos meus grupos.
export default async function TarefasPage() {
    const [tarefas, grupos] = await Promise.all([listarTarefas(), listarMeusGrupos()]);

    return (
        <div className="mx-auto h-full max-w-2xl overflow-y-auto p-6">
            <h1 className="mb-6 text-2xl font-semibold tracking-tight">Tarefas</h1>

            <NovaTarefaForm grupos={grupos.map((g) => ({ id: g.id, nome: g.nome }))} />

            <ul className="space-y-2">
                {tarefas.map((t) => (
                    <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                        <span className="truncate">{t.titulo}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                            {t.estado}
                            {t.projeto ? ` · #${t.projeto}` : ''}
                            {t.prioridade !== 'normal' ? ` · !${t.prioridade}` : ''}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
