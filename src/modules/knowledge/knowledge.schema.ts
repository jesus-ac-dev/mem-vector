import { z } from 'zod';

export const FrontmatterSchema = z.object({
    title: z.string().min(1),
    tags: z.array(z.string()).default([]),
    created: z.string().optional(),
    summary: z.string().optional(),
});
export type Frontmatter = z.infer<typeof FrontmatterSchema>;

// Input da edição de propriedades pela UI (decisão 2026-06-06: tags, summary,
// visibility; created é read-only e o título é o H1, fora das propriedades).
export const AtualizarPropriedadesSchema = z.object({
    tags: z.array(z.string().max(80)).max(50).optional(),
    summary: z.string().max(500).optional(),
    visibility: z.enum(['privado', 'protected', 'publico']).optional(),
});
export type AtualizarPropriedades = z.infer<typeof AtualizarPropriedadesSchema>;

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
    folderId?: string | null; // pasta onde vive (null/undefined = raiz)
    tags?: string[]; // do frontmatter (preenchido onde a listagem precisa, ex.: explorer)
}

// Nota existente oferecida ao agente-autor como candidata a CONTINUAR (UPDATE-bias),
// em vez de criar uma nota nova por facto.
export interface NotaCandidata {
    id: string;
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
