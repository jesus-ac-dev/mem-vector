import { beforeEach, describe, it, expect, vi } from 'vitest';

const escreverNotaCom = vi.fn();
const escreverNotaEmPastaCom = vi.fn();
const atualizarNotaPorIdCom = vi.fn();
vi.mock('./knowledge.service', () => ({
    escreverNotaCom: (...a: unknown[]) => escreverNotaCom(...a),
    escreverNotaEmPastaCom: (...a: unknown[]) => escreverNotaEmPastaCom(...a),
    atualizarNotaPorIdCom: (...a: unknown[]) => atualizarNotaPorIdCom(...a),
    summaryDoAgente: (s?: string) => (s ? { summary: s, summary_author: 'agent' } : {}),
}));
const resolverProjetoCom = vi.fn();
vi.mock('@/modules/projetos/projetos.service', () => ({
    resolverProjetoCom: (...a: unknown[]) => resolverProjetoCom(...a),
}));

import { escreverOuContinuarNotaCom, notaCandidataCorrespondente } from './knowledge.continuar';
import type { EscritaKnowledge, NotaCandidata } from './knowledge.schema';

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

describe('escreverOuContinuarNotaCom — placement por projeto (#96)', () => {
    const fakeDb = {} as never;
    const nota = (over: Partial<EscritaKnowledge> = {}): EscritaKnowledge => ({
        title: 'T',
        content_md: 'c',
        links: [],
        reason: 'r',
        ...over,
    });

    beforeEach(() => {
        escreverNotaCom.mockReset().mockResolvedValue({ id: 'n' });
        escreverNotaEmPastaCom.mockReset().mockResolvedValue({ id: 'n' });
        atualizarNotaPorIdCom.mockReset().mockResolvedValue({ id: 'n' });
        resolverProjetoCom.mockReset().mockResolvedValue({ id: 'p', folderId: 'f1' });
    });

    it('nota nova com projeto → ancora à pasta desse projeto', async () => {
        await escreverOuContinuarNotaCom(fakeDb, nota({ projeto: 'Hidroponia' }), []);
        expect(resolverProjetoCom).toHaveBeenCalledWith(fakeDb, 'Hidroponia');
        expect(escreverNotaEmPastaCom).toHaveBeenCalled();
        expect(escreverNotaEmPastaCom.mock.calls[0][2]).toBe('f1'); // folderId
        expect(escreverNotaEmPastaCom.mock.calls[0][3]).toBe('agent'); // author
        expect(escreverNotaCom).not.toHaveBeenCalled();
    });

    it('nota nova sem projeto → raiz (Knowledge)', async () => {
        await escreverOuContinuarNotaCom(fakeDb, nota(), []);
        expect(escreverNotaCom).toHaveBeenCalled();
        expect(escreverNotaEmPastaCom).not.toHaveBeenCalled();
    });

    it('com candidata correspondente → continua (ignora projeto, herda a pasta da nota)', async () => {
        const candidatos: NotaCandidata[] = [{ id: 'id-x', slug: 't', title: 'T', contentMd: 'c' }];
        await escreverOuContinuarNotaCom(fakeDb, nota({ projeto: 'Hidroponia' }), candidatos);
        expect(atualizarNotaPorIdCom).toHaveBeenCalled();
        expect(escreverNotaEmPastaCom).not.toHaveBeenCalled();
        expect(escreverNotaCom).not.toHaveBeenCalled();
    });
});
