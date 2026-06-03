import { z } from 'zod';

export const NovoGrupoSchema = z.object({
    nome: z.string().min(1, 'O nome é obrigatório').max(100),
    descricao: z.string().max(500).optional(),
});
export type NovoGrupo = z.infer<typeof NovoGrupoSchema>;

export const ConviteSchema = z.object({
    grupoId: z.string().uuid(),
    email: z.string().email('Email inválido'),
});
export type Convite = z.infer<typeof ConviteSchema>;

export interface Grupo {
    id: string;
    nome: string;
    descricao: string | null;
    created_at: string;
}

export interface ConvitePendente {
    id: string;
    grupo_id: string;
    email: string;
    estado: string;
    created_at: string;
}
