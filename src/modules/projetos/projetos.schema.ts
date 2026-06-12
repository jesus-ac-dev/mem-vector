import { z } from 'zod';

// #47: projetos reais — toda a tarefa pertence a um. "Pessoal" é o
// projeto-vida default, semeado por utilizador (como o Kernel).

export const PROJETO_PESSOAL = 'Pessoal';

export const NovoProjetoSchema = z.object({
    nome: z.string().min(1, 'O nome é obrigatório').max(60),
    descricao: z.string().max(2000).optional(),
});

export type NovoProjeto = z.infer<typeof NovoProjetoSchema>;

export interface Projeto {
    id: string;
    nome: string;
    descricao: string | null;
    folderId: string | null; // a pasta real do projeto no knowledge
    criadoEm: string; // ISO
}
