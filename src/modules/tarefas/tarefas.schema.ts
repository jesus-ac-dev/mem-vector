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
        dataFim: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data fim em AAAA-MM-DD')
            .optional(),
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

// Edição pelo quick-add (#55): clicar no card reabre os tokens; campos sem
// token ficam null (limpar projeto/data/descrição é remoção deliberada).
export const AtualizarTarefaSchema = z.object({
    titulo: z.string().min(1, 'O título é obrigatório').max(200),
    projeto: z.string().max(60).nullable(),
    prioridade: z.enum(PRIORIDADES_TAREFA),
    dataFim: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data fim em AAAA-MM-DD')
        .nullable(),
    descricao: z.string().max(2000).nullable(),
});

export type AtualizarTarefa = z.infer<typeof AtualizarTarefaSchema>;

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
    // Data fim quando a conversa traz prazo (#53). Malformada não custa a
    // tarefa — cai para undefined em vez de chumbar o parse.
    dataFim: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullish()
        .transform((v) => v ?? undefined)
        .catch(undefined),
});
export type TarefaDestilada = z.infer<typeof TarefaDestiladaSchema>;

export interface Tarefa {
    id: string;
    titulo: string;
    estado: EstadoTarefa;
    prioridade: PrioridadeTarefa;
    projetoId: string | null; // #47: FK real; null só como legado tolerado
    projeto: string | null; // nome (join) — display e serializar
    descricao: string | null;
    dependeDe: string | null;
    dataFim: string | null; // AAAA-MM-DD
    criadaEm: string; // ISO
    concluidaEm: string | null; // ISO
    // Relay: a issue de código a que o cartão está ligado (null = tarefa leve).
    repoGithub: string | null;
    issueGithub: number | null;
}

// Id curto à vista (#58, ideia do Carlos): o início do uuid identifica a
// tarefa na UI — e abre caminho ao token ⛔id no quick-add.
export function idCurtoTarefa(id: string): string {
    return id.split('-')[0];
}

// Kanban (#58): tarefas agrupadas por coluna, cada coluna já na ordem do
// painel (data fim → prioridade); concluídas caem todas em 'terminado'.
export function agruparPorEstado(
    abertas: Tarefa[],
    concluidas: Tarefa[],
): Record<EstadoTarefa, Tarefa[]> {
    const grupos = Object.fromEntries(ESTADOS_TAREFA.map((e) => [e, [] as Tarefa[]])) as Record<
        EstadoTarefa,
        Tarefa[]
    >;
    for (const t of abertas) grupos[t.estado].push(t);
    grupos.terminado = concluidas;
    return grupos;
}

const ORDEM_PRIORIDADE: Record<PrioridadeTarefa, number> = { alta: 0, normal: 1, baixa: 2 };

// Ordenação do painel (#51, decisão do Carlos): data fim primeiro (quem a tem
// vem antes, a mais próxima no topo), depois prioridade, depois estado em
// ordem DESCENDENTE do kanban (mais perto do fim primeiro).
export function ordenarTarefasAbertas(tarefas: Tarefa[]): Tarefa[] {
    return [...tarefas].sort((a, b) => {
        if (a.dataFim !== b.dataFim) {
            if (!a.dataFim) return 1;
            if (!b.dataFim) return -1;
            return a.dataFim < b.dataFim ? -1 : 1;
        }
        const p = ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade];
        if (p !== 0) return p;
        return ESTADOS_TAREFA.indexOf(b.estado) - ESTADOS_TAREFA.indexOf(a.estado);
    });
}
