// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createClient as createAnonClient, type SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Mock só o fetch (yt-dlp) — a ingestão (folders + nota) testa-se sem YouTube.
vi.mock('./youtube', async (importOriginal) => {
    const real = await importOriginal<typeof import('./youtube')>();
    return { ...real, buscarVideo: vi.fn() };
});
import { buscarVideo } from './youtube';
import { ingerirVideoCom } from './youtube.service';
import { listarPastasCom } from '@/modules/folders/folders.service';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const FAKE = {
    videoId: 'abc12345678',
    title: 'Review da Ferramenta X',
    author: 'Canal Tech',
    url: 'https://www.youtube.com/watch?v=abc12345678',
    transcript: '[00:00] olá isto é uma review da ferramenta X muito fixe',
};

describe('ingerirVideoCom (#101)', () => {
    let db: SupabaseClient;
    beforeAll(async () => {
        const admin = getSupabaseAdmin();
        const email = 'youtube-ingest@test.local';
        const { error } = await admin.auth.admin.createUser({
            email,
            password: 'pw-yt-123',
            email_confirm: true,
        });
        if (error && !error.message.includes('already been registered')) throw error;
        db = createAnonClient(URL, ANON);
        await db.auth.signInWithPassword({ email, password: 'pw-yt-123' });
    });

    it('escreve a nota em YouTube/<autor> com cabeçalho + transcript', async () => {
        vi.mocked(buscarVideo).mockResolvedValue(FAKE);
        const r = await ingerirVideoCom(db, FAKE.url);
        expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(r.title).toBe(FAKE.title);
        expect(r.author).toBe(FAKE.author);

        const { data } = await db
            .from('knowledge')
            .select('content_md, folder_id, frontmatter')
            .eq('slug', r.slug)
            .single();
        expect(data?.content_md).toContain('Review da Ferramenta X');
        expect(data?.content_md).toContain('Canal Tech');
        expect(data?.content_md).toContain('review da ferramenta X muito fixe'); // o transcript
        expect((data?.frontmatter as { tags?: string[] })?.tags).toContain('youtube');

        // a nota está dentro de YouTube/Canal Tech
        const pastas = await listarPastasCom(db);
        const youtube = pastas.find((p) => p.name === 'YouTube' && p.parentId === null);
        const canal = pastas.find((p) => p.name === 'Canal Tech' && p.parentId === youtube?.id);
        expect(canal).toBeTruthy();
        expect(data?.folder_id).toBe(canal?.id);
    });

    it('re-ingerir o mesmo vídeo reusa as pastas e continua a nota (idempotente)', async () => {
        vi.mocked(buscarVideo).mockResolvedValue(FAKE);
        const r2 = await ingerirVideoCom(db, FAKE.url);
        expect(r2.criada).toBe(false); // continuou, não criou

        const pastas = await listarPastasCom(db);
        expect(pastas.filter((p) => p.name === 'YouTube' && p.parentId === null)).toHaveLength(1);
        expect(pastas.filter((p) => p.name === 'Canal Tech')).toHaveLength(1);
    });
});
