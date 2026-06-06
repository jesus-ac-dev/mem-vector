'use server';

import {
    getNota,
    escreverNota,
    listarVersoes,
    listarKnowledge,
} from '@/modules/knowledge/knowledge.service';
import { getDaily, substituirDaily, listarVersoesDaily } from '@/modules/daily/daily.service';
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
 * Guarda o conteúdo editado de um ficheiro (knowledge ou daily) com author='user'.
 * Cria uma nova versão imutável e regenera os chunks de embedding.
 */
export async function guardarFicheiro(
    tipo: 'knowledge' | 'daily',
    chave: string,
    contentMd: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
    try {
        if (tipo === 'knowledge') {
            const nota = await getNota(chave);
            if (!nota) return { ok: false, erro: 'nota não encontrada' };
            await escreverNota(
                {
                    title: nota.title,
                    content_md: contentMd,
                    links: [],
                    reason: 'edição pelo utilizador',
                },
                'user',
            );
            return { ok: true };
        }

        // tipo === 'daily'
        const daily = await getDaily(chave);
        if (!daily) return { ok: false, erro: 'daily não encontrado' };
        await substituirDaily(chave, contentMd, 'user');
        return { ok: true };
    } catch (e) {
        return { ok: false, erro: e instanceof Error ? e.message : 'erro ao guardar' };
    }
}

/**
 * Cria uma nota knowledge nova e vazia com um título único ("Nova nota", "Nova nota 2"…)
 * e devolve a chave para a abrir numa tab. Usada pela ação "Criar Nota" da Home.
 */
export async function criarNotaVazia(): Promise<{
    tipo: 'knowledge';
    chave: string;
    titulo: string;
}> {
    const existentes = await listarKnowledge();
    const usados = new Set(existentes.map((n) => n.title));
    let titulo = 'Nova nota';
    let n = 2;
    while (usados.has(titulo)) {
        titulo = `Nova nota ${n}`;
        n += 1;
    }
    const res = await escreverNota(
        {
            title: titulo,
            content_md: `# ${titulo}\n\n`,
            links: [],
            reason: 'nota criada pelo utilizador',
        },
        'user',
    );
    return { tipo: 'knowledge', chave: res.slug, titulo: res.title };
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
