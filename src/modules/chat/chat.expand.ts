import type { SupabaseClient } from '@supabase/supabase-js';
import type { Source, SourceMetadata } from './chat.prompt';

export interface EntidadeFonte {
    type: 'knowledge' | 'daily';
    id: string;
}

// Entidades (knowledge/daily) por trás das fontes recuperadas — o ponto de
// partida do expand pela teia. chat_message não tem edges, fica de fora.
export function entidadesDasFontes(sources: Source[]): EntidadeFonte[] {
    const vistas = new Set<string>();
    const out: EntidadeFonte[] = [];
    for (const s of sources) {
        const t = s.metadata?.entity_type;
        const id = s.metadata?.entity_id;
        if ((t === 'knowledge' || t === 'daily') && id && !vistas.has(id)) {
            vistas.add(id);
            out.push({ type: t, id });
        }
    }
    return out;
}

interface VizinhoBruto {
    type: 'knowledge' | 'daily';
    id: string;
}

// Expand 1-hop pela teia: a partir das entidades das fontes recuperadas, segue as
// edges nos DOIS sentidos (forward = o que a entidade liga; backward = quem liga a
// ela) e junta o conteúdo das entidades vizinhas como contexto extra. Daily como
// hub: bate-se no resumo e puxam-se as notas ligadas (e vice-versa). Conservador:
// só knowledge/daily (conversa não tem corpo), limitado por `cap`, sem repetir as
// fontes diretas. As expandidas alimentam o PROMPT — NÃO a proveniência, que fica
// honesta com o que bateu diretamente no retrieval.
export async function expandirFontesCom(
    db: SupabaseClient,
    sources: Source[],
    cap = 5,
): Promise<Source[]> {
    const entidades = entidadesDasFontes(sources);
    if (!entidades.length) return [];

    const ids = entidades.map((e) => e.id);
    const jaPresentes = new Set(ids);

    // Forward: edges que SAEM das entidades (to_id resolvido) → notas ligadas.
    const { data: fwd } = await db
        .from('edges')
        .select('to_type, to_id')
        .in('from_id', ids)
        .not('to_id', 'is', null);
    // Backward: edges que ENTRAM nas entidades → dailies/notas que as mencionam.
    const { data: bwd } = await db.from('edges').select('from_type, from_id').in('to_id', ids);

    const vizinhos: VizinhoBruto[] = [];
    const add = (type: string | null, id: string | null) => {
        if ((type === 'knowledge' || type === 'daily') && id && !jaPresentes.has(id)) {
            jaPresentes.add(id);
            vizinhos.push({ type, id });
        }
    };
    for (const e of fwd ?? []) add(e.to_type as string | null, e.to_id as string | null);
    for (const e of bwd ?? []) add(e.from_type as string | null, e.from_id as string | null);

    const escolhidos = vizinhos.slice(0, cap);
    if (!escolhidos.length) return [];

    const knowledgeIds = escolhidos.filter((v) => v.type === 'knowledge').map((v) => v.id);
    const dailyIds = escolhidos.filter((v) => v.type === 'daily').map((v) => v.id);

    const conteudo = new Map<string, Source>();
    if (knowledgeIds.length) {
        const { data } = await db
            .from('knowledge')
            .select('id, slug, title, content_md')
            .in('id', knowledgeIds)
            .eq('archived', false);
        for (const r of data ?? []) {
            const meta: SourceMetadata = {
                entity_type: 'knowledge',
                entity_id: String(r.id),
                slug: r.slug as string,
                title: r.title as string,
            };
            conteudo.set(String(r.id), {
                content: String(r.content_md ?? ''),
                source: (r.title as string) ?? null,
                similarity: 0,
                metadata: meta,
            });
        }
    }
    if (dailyIds.length) {
        const { data } = await db.from('dailies').select('id, dia, content_md').in('id', dailyIds);
        for (const r of data ?? []) {
            const meta: SourceMetadata = {
                entity_type: 'daily',
                entity_id: String(r.id),
                dia: r.dia as string,
            };
            conteudo.set(String(r.id), {
                content: String(r.content_md ?? ''),
                source: (r.dia as string) ?? null,
                similarity: 0,
                metadata: meta,
            });
        }
    }

    return escolhidos.map((v) => conteudo.get(v.id)).filter((s): s is Source => Boolean(s));
}
