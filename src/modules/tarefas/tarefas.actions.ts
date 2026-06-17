'use server';

import { z } from 'zod';

import {
    AtualizarTarefaSchema,
    ESTADOS_TAREFA,
    NovaTarefaSchema,
    type Tarefa,
} from './tarefas.schema';
import {
    criarTarefa as criarTarefaService,
    atualizarTarefaCom,
    mudarEstadoTarefaCom,
    concluirTarefaCom,
    apagarTarefaCom,
} from './tarefas.service';
import { createClient } from '@/lib/supabase/server';

// A porta do servidor: valida SEMPRE o que vem do browser antes de tocar nos dados.
export async function criarTarefa(input: unknown) {
    const dados = NovaTarefaSchema.parse(input);
    await criarTarefaService(dados);
}

// Painel de tarefas (#21) migrou para `GET /api/tarefas-painel` (#73):
// abertas + concluídas + projetos (#47), chamando os serviços planos.

const idSchema = z.string().uuid();
const estadoSchema = z.enum(
    ESTADOS_TAREFA.filter((e) => e !== 'terminado') as [string, ...string[]],
);

// Edição pelo quick-add (#55): clicar no card → tokens → Enter atualiza.
export async function atualizarTarefa(idInput: unknown, input: unknown): Promise<Tarefa> {
    const id = idSchema.parse(idInput);
    const campos = AtualizarTarefaSchema.parse(input);
    return atualizarTarefaCom(await createClient(), id, campos);
}

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
