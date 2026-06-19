import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import { listarPastasCom, criarPastaCom } from '@/modules/folders/folders.service';
import { escreverNotaEmPastaCom } from '@/modules/knowledge/knowledge.service';
import { hojeLisboa } from '@/modules/daily/daily.service';
import { buscarVideo, type VideoYoutube } from './youtube';

// Find-or-create de pasta por nome+pai (criarPastaCom cria sempre): a ingestão
// repetida do mesmo autor reusa a pasta, não duplica.
async function garantirPastaCom(
    db: SupabaseClient,
    nome: string,
    parentId: string | null,
): Promise<string> {
    const pastas = await listarPastasCom(db);
    const existente = pastas.find((p) => p.name === nome && p.parentId === parentId);
    if (existente) return existente.id;
    return (await criarPastaCom(db, nome, parentId)).id;
}

// A nota é o BRUTO: cabeçalho de metadados + transcript corrido (a destilação
// acontece DEPOIS, na conversa). Idempotente por slug → re-colar o mesmo vídeo
// reescreve a mesma nota com o transcript fresco.
function montarNota(v: VideoYoutube): string {
    return (
        `# ${v.title}\n\n` +
        `> Vídeo de **${v.author}** · [${v.url}](${v.url}) · ingerido a ${hojeLisboa()}\n\n` +
        `${v.transcript}\n`
    );
}

export interface ResultadoIngestao {
    id: string;
    slug: string;
    title: string;
    author: string;
    criada: boolean;
}

// Ingere um vídeo do YouTube → nota em YouTube/<autor>/<título>. Lança
// YoutubeError (mensagem amigável) se o fetch falhar.
export async function ingerirVideoCom(db: SupabaseClient, url: string): Promise<ResultadoIngestao> {
    const v = await buscarVideo(url);
    const youtubeId = await garantirPastaCom(db, 'YouTube', null);
    const autorId = await garantirPastaCom(db, v.author, youtubeId);

    const r = await escreverNotaEmPastaCom(
        db,
        {
            title: v.title,
            content_md: montarNota(v),
            links: [],
            reason: `Transcript do vídeo ${v.url}`,
            summary: `Transcript do vídeo "${v.title}" de ${v.author}.`,
            tags: ['youtube', 'transcript'],
        },
        autorId,
        'user',
    );
    return { id: r.id, slug: r.slug, title: r.title, author: v.author, criada: r.diff === null };
}

export const ingerirVideo = async (url: string) => ingerirVideoCom(await createClient(), url);
