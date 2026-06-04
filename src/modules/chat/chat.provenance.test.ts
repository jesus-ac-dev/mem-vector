import { describe, it, expect } from 'vitest';

import { provenance } from './chat.provenance';
import type { Source } from './chat.prompt';

const s = (similarity = 0.9): Source => ({ content: 'x', source: 'seed', similarity });

describe('provenance', () => {
    it('sem fontes → conhecimento geral, fora do workspace', () => {
        const p = provenance([]);
        expect(p.fromWorkspace).toBe(false);
        expect(p.label).toMatch(/conhecimento geral/i);
    });

    it('uma fonte → singular', () => {
        const p = provenance([s()]);
        expect(p.fromWorkspace).toBe(true);
        expect(p.label).toBe('1 fonte do workspace');
    });

    it('várias fontes → plural', () => {
        const p = provenance([s(), s()]);
        expect(p.fromWorkspace).toBe(true);
        expect(p.label).toBe('2 fontes do workspace');
    });
});
