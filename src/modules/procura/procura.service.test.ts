import { describe, it, expect } from 'vitest';
import { dedupPorEntidade, type ChunkHit } from './procura.service';

const kHit = (id: string, entityId: string, content = 'x'): ChunkHit => ({
    id,
    content,
    source: 'knowledge',
    metadata: { entity_id: entityId },
});

describe('dedupPorEntidade (#91)', () => {
    it('mantém um resultado por entidade (o 1.º chunk = melhor match), preservando a ordem', () => {
        const chunks = [
            kHit('c1', 'nota-a', 'primeiro'),
            kHit('c2', 'nota-a', 'segundo'),
            kHit('c3', 'nota-b'),
        ];
        const out = dedupPorEntidade(chunks);
        expect(out.map((c) => c.id)).toEqual(['c1', 'c3']);
        expect(out[0].content).toBe('primeiro');
    });

    it('agrupa chat por conversation_id', () => {
        const cHit = (id: string, conv: string): ChunkHit => ({
            id,
            content: 'x',
            source: 'chat',
            metadata: { conversation_id: conv },
        });
        expect(
            dedupPorEntidade([cHit('m1', 'conv1'), cHit('m2', 'conv1')]).map((c) => c.id),
        ).toEqual(['m1']);
    });

    it('sem entidade no metadata, cai no id do chunk (não agrupa por engano)', () => {
        const sem = (id: string): ChunkHit => ({
            id,
            content: 'x',
            source: 'knowledge',
            metadata: null,
        });
        expect(dedupPorEntidade([sem('a'), sem('b')]).map((c) => c.id)).toEqual(['a', 'b']);
    });
});
