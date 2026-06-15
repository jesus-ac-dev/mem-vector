import { describe, it, expect } from 'vitest';

import { entidadesDasFontes } from './chat.expand';
import type { Source } from './chat.prompt';

function src(entity_type: string | undefined, entity_id: string | undefined): Source {
    return {
        content: 'x',
        source: null,
        similarity: 0.9,
        metadata: entity_type || entity_id ? { entity_type, entity_id } : null,
    };
}

describe('entidadesDasFontes', () => {
    it('extrai knowledge/daily das metadata, sem duplicar', () => {
        expect(
            entidadesDasFontes([
                src('knowledge', 'k1'),
                src('daily', 'd1'),
                src('knowledge', 'k1'),
            ]),
        ).toEqual([
            { type: 'knowledge', id: 'k1' },
            { type: 'daily', id: 'd1' },
        ]);
    });

    it('ignora chat_message e fontes sem metadata', () => {
        expect(entidadesDasFontes([src('chat_message', 'm1'), src(undefined, undefined)])).toEqual(
            [],
        );
    });
});
