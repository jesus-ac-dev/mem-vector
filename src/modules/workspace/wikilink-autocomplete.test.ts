import { describe, it, expect } from 'vitest';
import { detetarGatilho, filtrarNotasParaLink, type NotaLinkavel } from './wikilink-autocomplete';

describe('detetarGatilho', () => {
    it('sem [[ não há gatilho', () => {
        expect(detetarGatilho('texto normal', 5)).toBeNull();
    });
    it('[[ aberto devolve o termo até ao cursor', () => {
        const t = 'ver [[Cães';
        expect(detetarGatilho(t, t.length)).toEqual({ termo: 'Cães', inicio: 6 });
    });
    it('[[ já fechado antes do cursor não é gatilho', () => {
        const t = 'ver [[Cães]] e mais';
        expect(detetarGatilho(t, t.length)).toBeNull();
    });
    it('quebra de linha entre [[ e o cursor cancela o gatilho', () => {
        const t = 'ver [[\nCães';
        expect(detetarGatilho(t, t.length)).toBeNull();
    });
    it('usa o [[ mais próximo à esquerda do cursor', () => {
        const t = 'a [[x]] b [[Em';
        expect(detetarGatilho(t, t.length)).toEqual({ termo: 'Em', inicio: 12 });
    });
});

describe('filtrarNotasParaLink', () => {
    const notas: NotaLinkavel[] = [
        { tipo: 'daily', titulo: '2026-06-06', chave: '2026-06-06' },
        { tipo: 'knowledge', titulo: 'Cães do Carlos', chave: 'caes-do-carlos' },
        { tipo: 'knowledge', titulo: 'Embeddings', chave: 'embeddings' },
    ];
    it('filtra por substring case-insensitive', () => {
        expect(filtrarNotasParaLink(notas, 'cães').map((n) => n.chave)).toEqual(['caes-do-carlos']);
    });
    it('knowledge aparece antes de daily', () => {
        expect(filtrarNotasParaLink(notas, '2026').map((n) => n.tipo)).toEqual(['daily']);
        const todos = filtrarNotasParaLink(notas, '');
        expect(todos[0].tipo).toBe('knowledge');
        expect(todos[todos.length - 1].tipo).toBe('daily');
    });
    it('termo vazio devolve tudo, respeitando o limite', () => {
        expect(filtrarNotasParaLink(notas, '', 2)).toHaveLength(2);
    });
});
