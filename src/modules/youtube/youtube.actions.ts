'use server';

import { createClient } from '@/lib/supabase/server';
import { ingerirVideoCom } from './youtube.service';
import { YoutubeError } from './youtube';

export interface IngestaoResult {
    slug: string;
    title: string;
    author: string;
}

export async function ingerirVideoAction(url: unknown): Promise<IngestaoResult> {
    if (typeof url !== 'string' || !url.trim()) throw new Error('Cola o link do vídeo.');
    try {
        const r = await ingerirVideoCom(await createClient(), url.trim());
        return { slug: r.slug, title: r.title, author: r.author };
    } catch (e) {
        // YoutubeError já traz mensagem amigável; o resto vira genérico.
        if (e instanceof YoutubeError) throw new Error(e.message);
        throw new Error('Não consegui ingerir o vídeo.');
    }
}
