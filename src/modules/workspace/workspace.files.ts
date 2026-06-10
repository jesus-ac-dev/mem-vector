import { getDaily, getDailyPorId } from '@/modules/daily/daily.service';
import { getNota, getNotaPorId } from '@/modules/knowledge/knowledge.service';

export interface ConteudoFicheiro {
    titulo: string;
    contentMd: string;
    folderId?: string | null;
}

export async function lerConteudoFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
    id?: string,
): Promise<ConteudoFicheiro | null> {
    if (tipo === 'knowledge') {
        const nota = id ? await getNotaPorId(id) : await getNota(chave);
        if (!nota) return null;
        return { titulo: nota.title, contentMd: nota.contentMd, folderId: nota.folderId ?? null };
    }

    const daily = id ? await getDailyPorId(id) : await getDaily(chave);
    if (!daily) return null;
    return { titulo: daily.dia, contentMd: daily.contentMd };
}
