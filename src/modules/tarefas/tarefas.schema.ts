import { z } from 'zod';

/** Validação do input do browser (a action usa isto na porta do servidor). */
export const NovaTarefaSchema = z
    .object({
        titulo: z.string().min(1, 'O título é obrigatório').max(200),
        visibility: z.enum(['privado', 'protected']).default('privado'),
        groupId: z.string().uuid().optional(),
    })
    .refine((d) => d.visibility !== 'protected' || !!d.groupId, {
        message: 'Escolhe um grupo para tarefas protegidas',
        path: ['groupId'],
    });

export type NovaTarefa = z.infer<typeof NovaTarefaSchema>;

export interface Tarefa {
    id: string;
    titulo: string;
    feita: boolean;
    criadaEm: string; // ISO
}
