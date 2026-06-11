import { describe, expect, it } from 'vitest';

import { preprocessWikilinks } from './markdown';

describe('preprocessWikilinks', () => {
    it('renderiza wikilink simples como link interno com o proprio alvo', () => {
        expect(preprocessWikilinks('ver [[Embeddings E5]]')).toBe(
            'ver [Embeddings E5](/knowledge/embeddings-e5)',
        );
    });

    it('renderiza alias como texto visivel mantendo o alvo do link', () => {
        expect(preprocessWikilinks('ver [[Embeddings E5|a nota de embeddings]]')).toBe(
            'ver [a nota de embeddings](/knowledge/embeddings-e5)',
        );
    });

    it('mantem datas como links para daily mesmo com alias', () => {
        expect(preprocessWikilinks('ver [[2026-06-07|hoje]]')).toBe(
            'ver [hoje](/daily/2026-06-07)',
        );
    });
    it('mantem caminho de pasta no href para resolver notas homónimas', () => {
        expect(preprocessWikilinks('ver [[Pasta/Teste|Teste]]')).toBe(
            'ver [Teste](/knowledge/teste?path=Pasta%2FTeste)',
        );
    });

    it('compoe com linkCitations na ordem do chat sem interferencia', async () => {
        // O chat corre linkCitations primeiro e o Markdown pré-processa os
        // wikilinks depois — uma resposta com citação [N] E [[wikilink]] tem
        // de produzir os dois links (era o wikilink morto do smoke da #27).
        const { linkCitations } = await import('@/modules/chat/chat.provenance');
        const sources: Parameters<typeof linkCitations>[1] = [
            {
                id: 'c1',
                content: 'trecho',
                source: 'knowledge',
                similarity: 0.9,
                metadata: { entity_type: 'knowledge', slug: 'carlos-e-sofia' },
            },
        ];

        const comCitacao = linkCitations('Segundo a nota [[carlos-e-sofia]] [1].', sources);
        const final = preprocessWikilinks(comCitacao);
        expect(final).toContain('[carlos-e-sofia](/knowledge/carlos-e-sofia)');
        expect(final).toContain('[1](');
    });
});
