import { describe, it, expect } from 'vitest';

import { notaCandidataCorrespondente } from './knowledge.continuar';
import type { NotaCandidata } from './knowledge.schema';

const candidatos: NotaCandidata[] = [
    {
        id: 'id-coisas',
        slug: 'coisas-que-acontecem',
        title: 'coisas que acontecem',
        contentMd: '# coisas que acontecem\n\n[[que fará]]',
    },
    {
        id: 'id-bd',
        slug: 'bd-tipada-vs-memsearch',
        title: 'BD tipada vs memsearch',
        contentMd: '…',
    },
];

describe('notaCandidataCorrespondente', () => {
    // Smoke 2026-06-10: "continuar" uma candidata dentro de pasta criava um
    // duplicado homónimo na raiz (upsert por slug não vê pastas). Título igual
    // ao de uma candidata tem de resolver para ELA (update por id).
    it('título exatamente igual ao da candidata devolve-a', () => {
        const out = notaCandidataCorrespondente('coisas que acontecem', candidatos);
        expect(out?.id).toBe('id-coisas');
    });

    it('é insensível a maiúsculas e espaços à volta', () => {
        const out = notaCandidataCorrespondente('  Coisas QUE Acontecem ', candidatos);
        expect(out?.id).toBe('id-coisas');
    });

    it('título que slugifica para o slug da candidata também corresponde', () => {
        const out = notaCandidataCorrespondente('BD Tipada vs Memsearch!', candidatos);
        expect(out?.id).toBe('id-bd');
    });

    it('assunto novo não corresponde a nenhuma candidata', () => {
        expect(notaCandidataCorrespondente('Carlos e Sofia', candidatos)).toBeNull();
    });

    it('sem candidatos devolve null', () => {
        expect(notaCandidataCorrespondente('coisas que acontecem', [])).toBeNull();
    });
});
