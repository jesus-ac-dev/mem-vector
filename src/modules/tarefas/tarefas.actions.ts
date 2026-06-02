'use server';

import { revalidatePath } from 'next/cache';

import { NovaTarefaSchema } from './tarefas.schema';
import { criarTarefa as criarTarefaService } from './tarefas.service';

// A porta do servidor: valida SEMPRE o que vem do browser antes de tocar nos dados.
export async function criarTarefa(formData: FormData) {
    const dados = NovaTarefaSchema.parse({ titulo: formData.get('titulo') });
    await criarTarefaService(dados);
    revalidatePath('/tarefas');
}
