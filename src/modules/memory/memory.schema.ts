import { z } from 'zod';

export const TIPOS_OBSERVACAO_AGENTE = [
    'user-prompt',
    'assistant-response',
    'agent-write',
    'task-change',
    'job-result',
    'session-end',
] as const;

export type TipoObservacaoAgente = (typeof TIPOS_OBSERVACAO_AGENTE)[number];

export const ESTADOS_SESSAO_AGENTE = ['active', 'closed'] as const;
export type EstadoSessaoAgente = (typeof ESTADOS_SESSAO_AGENTE)[number];

export const ESTADOS_HANDOFF_AGENTE = ['open', 'accepted', 'expired'] as const;
export type EstadoHandoffAgente = (typeof ESTADOS_HANDOFF_AGENTE)[number];

const JsonPrimitivoSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonMemoria =
    | z.infer<typeof JsonPrimitivoSchema>
    | JsonMemoria[]
    | { [key: string]: JsonMemoria };

export const JsonMemoriaSchema: z.ZodType<JsonMemoria> = z.lazy(() =>
    z.union([
        JsonPrimitivoSchema,
        z.array(JsonMemoriaSchema),
        z.record(z.string(), JsonMemoriaSchema),
    ]),
);

export const VisibilityMemoriaSchema = z.enum(['privado', 'protected']);

export const AbrirSessaoInputSchema = z.object({
    conversationId: z.string().uuid().optional(),
    operator: z.string().min(1).max(80).default('web'),
    runner: z.string().min(1).max(80).default('chat'),
    metadata: z.unknown().optional(),
    visibility: VisibilityMemoriaSchema.default('privado'),
    groupId: z.string().uuid().optional(),
});

export type AbrirSessaoInput = z.input<typeof AbrirSessaoInputSchema>;

export const RegistarObservacaoInputSchema = z.object({
    sessionId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    type: z.enum(TIPOS_OBSERVACAO_AGENTE),
    content: z.string().max(12000).optional(),
    metadata: z.unknown().optional(),
    visibility: VisibilityMemoriaSchema.default('privado'),
    groupId: z.string().uuid().optional(),
});

export type RegistarObservacaoInput = z.input<typeof RegistarObservacaoInputSchema>;

export const CriarHandoffInputSchema = z.object({
    sessionId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    summary: z.string().min(1).max(12000),
    openQuestions: z.array(z.string().min(1).max(1000)).default([]),
    nextSteps: z.array(z.string().min(1).max(1000)).default([]),
    entitiesTouched: z.array(z.unknown()).default([]),
    metadata: z.unknown().optional(),
    visibility: VisibilityMemoriaSchema.default('privado'),
    groupId: z.string().uuid().optional(),
});

export type CriarHandoffInput = z.input<typeof CriarHandoffInputSchema>;

export interface SessaoAgente {
    id: string;
    conversationId: string | null;
    operator: string;
    runner: string;
    status: EstadoSessaoAgente;
    startedAt: string;
    endedAt: string | null;
}

export interface ObservacaoAgente {
    id: string;
    sessionId: string | null;
    conversationId: string | null;
    type: TipoObservacaoAgente;
    content: string | null;
    metadata: JsonMemoria;
    occurredAt: string;
}

export interface HandoffAgente {
    id: string;
    sessionId: string | null;
    conversationId: string | null;
    summary: string;
    openQuestions: string[];
    nextSteps: string[];
    entitiesTouched: JsonMemoria[];
    status: EstadoHandoffAgente;
    acceptedBy: string | null;
    acceptedAt: string | null;
    expiredAt: string | null;
    createdAt: string;
    updatedAt: string;
}
