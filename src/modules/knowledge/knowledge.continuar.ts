import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify } from './knowledge.links';
import type { EscritaKnowledge, NotaCandidata } from './knowledge.schema';
import { tagsDoAgente, unirTags } from './knowledge.props';
import { resolverProjetoCom } from '@/modules/projetos/projetos.service';
import {
    atualizarNotaPorIdCom,
    escreverNotaCom,
    escreverNotaEmPastaCom,
    summaryDoAgente,
    type ResultadoEscrita,
} from './knowledge.service';

// O "CONTINUA a candidata" do update-bias tem de aterrar NA candidata: o upsert
// por slug (write_knowledge_entry) escreve na raiz, e uma candidata dentro de
// pasta viraria duplicado homónimo (smoke 2026-06-10, mem-vector#19). Título
// igual ao de uma candidata resolve para ela; senão, escrita normal.
export function notaCandidataCorrespondente(
    title: string,
    candidatos: NotaCandidata[],
): NotaCandidata | null {
    const alvo = title.trim().toLowerCase();
    return (
        candidatos.find((c) => c.title.trim().toLowerCase() === alvo) ??
        candidatos.find((c) => c.slug === slugify(title)) ??
        null
    );
}

export async function escreverOuContinuarNotaCom(
    db: SupabaseClient,
    input: EscritaKnowledge,
    candidatos: NotaCandidata[],
    author: 'agent' | 'user' = 'agent',
): Promise<ResultadoEscrita> {
    const candidata = notaCandidataCorrespondente(input.title, candidatos);
    if (candidata) {
        // CONTINUAR refresca o summary na mesma escrita (#22); o guard de
        // autoria (summary do utilizador) vive no RPC. Tags (#90): união
        // aditiva com as da candidata — o agente acrescenta sem apagar as
        // existentes (incl. as do utilizador).
        return atualizarNotaPorIdCom(db, candidata.id, input.content_md, author, {
            ...summaryDoAgente(input.summary),
            ...tagsDoAgente(unirTags(candidata.tags, input.tags)),
        });
    }
    // Nota nova (#96): o agente indica o projeto (Pessoal default quando é sobre o
    // utilizador) → ancora à pasta desse projeto. Sem projeto = Knowledge (raiz).
    // O placement não precisa de ser perfeito — o utilizador refina com drag-drop.
    const projeto = input.projeto?.trim();
    if (projeto) {
        const { folderId } = await resolverProjetoCom(db, projeto);
        if (folderId) return escreverNotaEmPastaCom(db, input, folderId, author);
    }
    return escreverNotaCom(db, input, author);
}
