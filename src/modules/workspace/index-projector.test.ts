import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { projectarIndicesBestEffortCom } from './index-projector';

describe('projectarIndicesBestEffortCom', () => {
    it('resolve (não lança) mesmo quando a projeção falha', async () => {
        // db cujo getUser lança → criarDerivedIndexJobCom lança → a projeção lança.
        // O best-effort deve engolir: a nota já está gravada, o sweeper retoma.
        const dbQueFalha = {
            auth: {
                getUser: async () => {
                    throw new Error('boom');
                },
            },
        } as unknown as SupabaseClient;
        await expect(
            projectarIndicesBestEffortCom(dbQueFalha, {
                entityType: 'knowledge',
                entityId: '00000000-0000-0000-0000-000000000000',
            }),
        ).resolves.toBeUndefined();
    });
});
