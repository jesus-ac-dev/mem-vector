import { getDaily, getDailyPorId } from '@/modules/daily/daily.service';
import {
    getNota,
    getNotaPorId,
    getPropriedadesNotaPorId,
} from '@/modules/knowledge/knowledge.service';
import type { PropriedadesNota } from '@/modules/knowledge/knowledge.props';

export interface ConteudoFicheiro {
    titulo: string;
    contentMd: string;
    folderId?: string | null;
    propriedades?: PropriedadesNota; // só knowledge (dailies não têm propriedades editáveis)
}

export async function lerConteudoFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
    id?: string,
): Promise<ConteudoFicheiro | null> {
    if (tipo === 'knowledge') {
        const nota = id ? await getNotaPorId(id) : await getNota(chave);
        if (!nota) return null;
        const propriedades = (await getPropriedadesNotaPorId(nota.id)) ?? undefined;
        return {
            titulo: nota.title,
            contentMd: nota.contentMd,
            folderId: nota.folderId ?? null,
            propriedades,
        };
    }

    const daily = id ? await getDailyPorId(id) : await getDaily(chave);
    if (!daily) return null;
    return { titulo: daily.dia, contentMd: daily.contentMd };
}
