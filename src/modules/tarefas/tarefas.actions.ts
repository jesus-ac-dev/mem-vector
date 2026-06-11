'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ESTADOS_TAREFA, NovaTarefaSchema, type Tarefa } from './tarefas.schema';
import {
    criarTarefa as criarTarefaService,
    listarTarefasAbertasCom,
    listarTarefasConcluidasCom,
    mudarEstadoTarefaCom,
    concluirTarefaCom,
    apagarTarefaCom,
} from './tarefas.service';
import { createClient } from '@/lib/supabase/server';

// A porta do servidor: valida SEMPRE o que vem do browser antes de tocar nos dados.
export async function criarTarefa(input: unknown) {
    const dados = NovaTarefaSchema.parse(input);
    await criarTarefaService(dados);
    revalidatePath('/tarefas');
}

// Painel de tarefas (#21): abertas + concluídas numa chamada.
export async function listarTarefasPainel(): Promise<{
    abertas: Tarefa[];
    concluidas: Tarefa[];
}> {
    const db = await createClient();
    const [abertas, concluidas] = await Promise.all([
        listarTarefasAbertasCom(db),
        listarTarefasConcluidasCom(db),
    ]);
    return { abertas, concluidas };
}

const idSchema = z.string().uuid();
const estadoSchema = z.enum(
    ESTADOS_TAREFA.filter((e) => e !== 'terminado') as [string, ...string[]],
);

export async function mudarEstadoTarefa(idInput: unknown, estadoInput: unknown): Promise<Tarefa> {
    const id = idSchema.parse(idInput);
    const estado = estadoSchema.parse(estadoInput) as Exclude<
        (typeof ESTADOS_TAREFA)[number],
        'terminado'
    >;
    return mudarEstadoTarefaCom(await createClient(), id, estado);
}

export async function concluirTarefa(idInput: unknown): Promise<Tarefa> {
    const id = idSchema.parse(idInput);
    return concluirTarefaCom(await createClient(), id);
}

export async function apagarTarefa(idInput: unknown): Promise<void> {
    const id = idSchema.parse(idInput);
    return apagarTarefaCom(await createClient(), id);
}
