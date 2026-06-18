import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify } from './knowledge.links';
import type { EscritaKnowledge, NotaCandidata } from './knowledge.schema';
import { tagsDoAgente, unirTags } from './knowledge.props';
import {
    atualizarNotaPorIdCom,
    escreverNotaCom,
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
    return escreverNotaCom(db, input, author);
}
