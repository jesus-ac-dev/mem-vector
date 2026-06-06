import { z } from 'zod';

export const FrontmatterSchema = z.object({
    title: z.string().min(1),
    tags: z.array(z.string()).default([]),
    created: z.string().optional(),
});
export type Frontmatter = z.infer<typeof FrontmatterSchema>;

// Bloco que o claude CLI devolve quando decide destilar (ou null).
export const EscritaKnowledgeSchema = z.object({
    title: z.string().min(1).max(200),
    content_md: z.string().min(1),
    links: z.array(z.string()).default([]),
    reason: z.string().min(1),
});
export type EscritaKnowledge = z.infer<typeof EscritaKnowledgeSchema>;

export interface NotaKnowledge {
    id: string;
    slug: string;
    title: string;
    contentMd: string;
    updatedAt: string;
}

// Nota existente oferecida ao agente-autor como candidata a CONTINUAR (UPDATE-bias),
// em vez de criar uma nota nova por facto.
export interface NotaCandidata {
    slug: string;
    title: string;
    contentMd: string;
}

export interface Versao {
    id: string;
    contentMd: string;
    author: string;
    createdAt: string;
}
