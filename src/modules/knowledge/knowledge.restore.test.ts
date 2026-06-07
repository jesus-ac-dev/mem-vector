import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
    reindexEntity: vi.fn(),
}));

vi.mock('@/lib/indexing', () => ({
    reindexEntity: mocks.reindexEntity,
}));

import { reporNotaCom } from './knowledge.service';

describe('reporNotaCom', () => {
    beforeEach(() => {
        mocks.reindexEntity.mockReset();
    });

    it('volta a arquivar a nota quando a reindexacao falha depois do restore', async () => {
        mocks.reindexEntity.mockRejectedValueOnce(new Error('embedding offline'));
        const db = fakeDb();

        await expect(reporNotaCom(db, 'nota-restaurada')).rejects.toThrow(
            'reindex falhou; nota voltou aos arquivados: embedding offline',
        );

        expect(db.rpc).toHaveBeenCalledWith('restore_knowledge_entry', {
            p_slug: 'nota-restaurada',
        });
        expect(db.rpc).toHaveBeenCalledWith('archive_knowledge_entry', {
            p_slug: 'nota-restaurada',
        });
    });
});

function fakeDb(): SupabaseClient & { rpc: ReturnType<typeof vi.fn> } {
    return {
        auth: {
            getUser: vi.fn(async () => ({
                data: { user: { id: 'owner-1' } },
            })),
        },
        rpc: vi.fn((name: string) => {
            if (name === 'restore_knowledge_entry') {
                return {
                    single: vi.fn(async () => ({
                        data: {
                            id: 'note-1',
                            slug: 'nota-restaurada',
                            title: 'Nota Restaurada',
                            content_md: '# Nota restaurada',
                        },
                        error: null,
                    })),
                };
            }

            if (name === 'archive_knowledge_entry') {
                return Promise.resolve({ error: null });
            }

            return Promise.resolve({ error: new Error(`rpc inesperada: ${name}`) });
        }),
    } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}
