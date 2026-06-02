import type { NovaTarefa, Tarefa } from './tarefas.schema';

// O "serviço" da feature (estilo Angular): dados + regras numa peça.
// TODO: ligar ao Supabase quando o schema existir (supabase/). Por agora
// in-memory, só para ilustrar a estrutura da feature.
const tarefas: Tarefa[] = [
    {
        id: '1',
        titulo: 'Desenhar o esquema de dados',
        feita: false,
        criadaEm: '2026-06-02T00:00:00Z',
    },
];

export async function listarTarefas(): Promise<Tarefa[]> {
    return tarefas;
}

export async function criarTarefa(input: NovaTarefa): Promise<Tarefa> {
    const nova: Tarefa = {
        id: String(tarefas.length + 1),
        titulo: input.titulo,
        feita: false,
        criadaEm: new Date().toISOString(),
    };
    tarefas.push(nova);
    return nova;
}
