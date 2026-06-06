'use server';

import { getNota, listarVersoes } from '@/modules/knowledge/knowledge.service';
import { getDaily, listarVersoesDaily } from '@/modules/daily/daily.service';
import type { Versao } from '@/modules/knowledge/knowledge.schema';

export interface ConteudoFicheiro {
    titulo: string;
    contentMd: string;
}

/**
 * Carrega o conteúdo de um ficheiro (knowledge ou daily) pelo tipo e chave.
 * Usado pelo FilePane via useEffect.
 */
export async function lerFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
): Promise<ConteudoFicheiro | null> {
    if (tipo === 'knowledge') {
        const nota = await getNota(chave);
        if (!nota) return null;
        return { titulo: nota.title, contentMd: nota.contentMd };
    }

    // tipo === 'daily'
    const daily = await getDaily(chave);
    if (!daily) return null;
    return { titulo: daily.dia, contentMd: daily.contentMd };
}

/**
 * Devolve as versões de um ficheiro (knowledge ou daily), da mais recente para a mais antiga.
 * Devolve [] se o ficheiro não existir ou não tiver versões.
 */
export async function versoesFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
): Promise<Versao[]> {
    if (tipo === 'knowledge') {
        const nota = await getNota(chave);
        if (!nota) return [];
        return listarVersoes(nota.id);
    }

    // tipo === 'daily'
    const daily = await getDaily(chave);
    if (!daily) return [];
    return listarVersoesDaily(daily.id);
}
