import { z } from 'zod';

// #21: estados do kanban canónico (agentic-os-brief): a tarefa anda pelo ciclo.
export const ESTADOS_TAREFA = [
    'backlog',
    'analise',
    'desenvolvimento',
    'testes',
    'documentacao',
    'terminado',
] as const;
export type EstadoTarefa = (typeof ESTADOS_TAREFA)[number];

export const PRIORIDADES_TAREFA = ['baixa', 'normal', 'alta'] as const;
export type PrioridadeTarefa = (typeof PRIORIDADES_TAREFA)[number];

/** Validação do input do browser (a action usa isto na porta do servidor). */
export const NovaTarefaSchema = z
    .object({
        titulo: z.string().min(1, 'O título é obrigatório').max(200),
        projeto: z.string().max(60).optional(),
        prioridade: z.enum(PRIORIDADES_TAREFA).default('normal'),
        descricao: z.string().max(2000).optional(),
        dependeDe: z.string().uuid().optional(),
        visibility: z.enum(['privado', 'protected']).default('privado'),
        groupId: z.string().uuid().optional(),
    })
    .refine((d) => d.visibility !== 'protected' || !!d.groupId, {
        message: 'Escolhe um grupo para tarefas protegidas',
        path: ['groupId'],
    });

export type NovaTarefa = z.infer<typeof NovaTarefaSchema>;

// Envelope da destilação (#21): tarefas que o agente propõe criar num turno.
// Na dúvida cria (decisão do Carlos) — apagar é barato.
export const TarefaDestiladaSchema = z.object({
    titulo: z.string().min(1).max(200),
    projeto: z
        .string()
        .max(60)
        .nullish()
        .transform((v) => v ?? undefined),
    prioridade: z.enum(PRIORIDADES_TAREFA).default('normal'),
});
export type TarefaDestilada = z.infer<typeof TarefaDestiladaSchema>;

export interface Tarefa {
    id: string;
    titulo: string;
    estado: EstadoTarefa;
    prioridade: PrioridadeTarefa;
    projeto: string | null;
    descricao: string | null;
    dependeDe: string | null;
    criadaEm: string; // ISO
    concluidaEm: string | null; // ISO
}
