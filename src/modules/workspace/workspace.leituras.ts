import {
    getNota,
    getNotaPorId,
    backlinksDe,
    forwardLinksDe,
    listarVersoes,
    type LinkNota,
    type ForwardLink,
} from '@/modules/knowledge/knowledge.service';
import { getDaily, getDailyPorId, listarVersoesDaily } from '@/modules/daily/daily.service';
import { extrairOutline, type OutlineItem } from '@/lib/outline';
import type { Versao } from '@/modules/knowledge/knowledge.schema';

// Leituras read-only do ficheiro ativo, extraídas das server actions para serem
// chamáveis por rotas GET (#73 — imunes ao stale de action IDs em HMR).

export interface DadosBarraDireita {
    outline: OutlineItem[];
    backlinks: LinkNota[];
    forwardLinks: ForwardLink[];
}

/**
 * Dados da barra da direita para o ficheiro ativo: outline (headings) sempre, e
 * backlinks/forward links para knowledge. Daily mostra outline + forward links
 * (a daily também escreve edges — ex.: a destilação liga [[carlos-e-sofia]]).
 */
export async function dadosDaBarraDireita(
    tipo: 'knowledge' | 'daily',
    chave: string,
    id?: string,
): Promise<DadosBarraDireita> {
    const vazio: DadosBarraDireita = { outline: [], backlinks: [], forwardLinks: [] };

    if (tipo === 'knowledge') {
        const nota = id ? await getNotaPorId(id) : await getNota(chave);
        if (!nota) return vazio;
        const [backlinks, forwardLinks] = await Promise.all([
            backlinksDe(nota.slug, nota.id),
            forwardLinksDe(nota.id),
        ]);
        return { outline: extrairOutline(nota.contentMd!), backlinks, forwardLinks };
    }

    const daily = id ? await getDailyPorId(id) : await getDaily(chave);
    if (!daily) return vazio;
    // Simetria completa: a daily mostra os links que faz E quem aponta para ela
    // (o alvo de um wikilink para daily é o próprio dia).
    const [backlinks, forwardLinks] = await Promise.all([
        backlinksDe(daily.dia, daily.id),
        forwardLinksDe(daily.id, 'daily'),
    ]);
    return { outline: extrairOutline(daily.contentMd), backlinks, forwardLinks };
}

/** Versões (histórico) do ficheiro ativo. */
export async function versoesDoFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
    id?: string,
): Promise<Versao[]> {
    if (tipo === 'knowledge') {
        const nota = id ? await getNotaPorId(id) : await getNota(chave);
        if (!nota) return [];
        return listarVersoes(nota.id);
    }

    const daily = id ? await getDailyPorId(id) : await getDaily(chave);
    if (!daily) return [];
    return listarVersoesDaily(daily.id);
}
