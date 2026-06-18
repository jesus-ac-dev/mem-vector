import { z } from 'zod';

import { normalizarTags } from './knowledge.props';

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
// `summary` (#22): resumo de 1 linha da NOTA INTEIRA como ficou — refresca a
// cada create/CONTINUAR sem chamada extra; o guard de autoria vive no SQL.
export const EscritaKnowledgeSchema = z.object({
    title: z.string().min(1).max(200),
    content_md: z.string().min(1),
    links: z.array(z.string()).default([]),
    reason: z.string().min(1),
    // Truncar em vez de max(): um summary longo demais do LLM não pode custar
    // a nota inteira (o safeParse rejeitaria o objeto todo em silêncio).
    summary: z
        .string()
        .transform((s) => s.trim().slice(0, 500))
        .optional(),
    // tags (#90): o agente classifica o assunto reusando as existentes.
    // Normaliza à Obsidian e limita (8) para a tab Tags ser navegável, não
    // ruído — transform (não max) para não custar a nota inteira no safeParse.
    tags: z
        .array(z.string())
        .transform((arr) => normalizarTags(arr).slice(0, 8))
        .optional(),
    // projeto (#96): destino da nota — nome de projeto (ou "Pessoal") ancora-a à
    // pasta desse projeto; ausente/null = Knowledge (referência do mundo). O
    // placement não tem de ser perfeito (o user arruma com drag-drop) e continuar
    // herda a pasta da candidata.
    projeto: z.string().nullish(),
});
export type EscritaKnowledge = z.infer<typeof EscritaKnowledgeSchema>;

// Resumo de nota para listagens/árvore/grafo (perf): SEM o `content_md`, que é
// um payload grande que a listagem não usa. Só `getNota*` traz o corpo.
export interface NotaResumo {
    id: string;
    slug: string;
    title: string;
    updatedAt: string;
    folderId?: string | null; // pasta onde vive (null/undefined = raiz)
    tags?: string[]; // do frontmatter (preenchido onde a listagem precisa, ex.: explorer)
}

// Nota completa (de getNota*): o resumo + o corpo.
export interface NotaKnowledge extends NotaResumo {
    contentMd: string;
}

// Nota existente oferecida ao agente-autor como candidata a CONTINUAR (UPDATE-bias),
// em vez de criar uma nota nova por facto.
export interface NotaCandidata {
    id: string;
    slug: string;
    title: string;
    contentMd: string;
    tags?: string[]; // tags atuais (#90): contexto p/ o agente + união aditiva ao continuar
}

export interface Versao {
    id: string;
    contentMd: string;
    author: string; // 'agent' | 'user' (quem: autorNome)
    autorNome: string | null; // display name/email do author_id (null = desconhecido)
    createdAt: string;
}
