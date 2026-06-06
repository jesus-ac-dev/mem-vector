import { describe, it, expect } from 'vitest';

import { linkCitations, provenance, sourceHref, sourceLabel } from './chat.provenance';
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

describe('source links', () => {
    it('liga fontes daily à rota do daily', () => {
        const source: Source = {
            ...s(),
            metadata: { entity_type: 'daily', entity_id: 'd1', dia: '2026-06-06' },
        };

        expect(sourceHref(source)).toBe('/daily/2026-06-06');
        expect(sourceLabel(source, 0)).toBe('[1] Daily 2026-06-06');
    });

    it('liga fontes knowledge à rota da nota', () => {
        const source: Source = {
            ...s(),
            metadata: {
                entity_type: 'knowledge',
                entity_id: 'k1',
                slug: 'daily-notes-do-mem-vector',
                title: 'Daily Notes do mem-vector',
            },
        };

        expect(sourceHref(source)).toBe('/knowledge/daily-notes-do-mem-vector');
        expect(sourceLabel(source, 1)).toBe('[2] Daily Notes do mem-vector');
    });

    it('mantém fontes sem destino como texto simples', () => {
        expect(sourceHref(s())).toBeNull();
        expect(sourceLabel(s(), 0)).toBe('[1] seed');
    });
});

describe('linkCitations', () => {
    const daily: Source = {
        ...s(),
        metadata: { entity_type: 'daily', entity_id: 'd1', dia: '2026-06-06' },
    };
    const knowledge: Source = {
        ...s(),
        metadata: {
            entity_type: 'knowledge',
            entity_id: 'k1',
            slug: 'prova-kernel',
            title: 'Prova Kernel',
        },
    };

    it('transforma citações numeradas em links internos', () => {
        expect(linkCitations('ver [1][2]', [daily, knowledge])).toBe(
            'ver [1](/daily/2026-06-06)[2](/knowledge/prova-kernel)',
        );
    });

    it('deixa citações sem fonte linkável intactas', () => {
        expect(linkCitations('ver [1][3]', [daily, s()])).toBe('ver [1](/daily/2026-06-06)[3]');
    });

    it('não religa markdown links já existentes', () => {
        expect(linkCitations('ver [1](/daily/antigo)', [daily])).toBe('ver [1](/daily/antigo)');
    });
});
