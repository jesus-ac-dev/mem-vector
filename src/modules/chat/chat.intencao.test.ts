import { describe, it, expect } from 'vitest';

import { classificarIntencao } from './chat.intencao';

describe('classificarIntencao', () => {
    // O caso de aceitação do #19: as 3 frases da Sofia são factos a registar.
    it('declarativa sem marcas de pergunta é facto (sequência Sofia)', () => {
        expect(classificarIntencao('o carlos gosta da sofia')).toEqual({
            tipo: 'declarativa',
            incerta: false,
        });
        expect(classificarIntencao('a sofia e o carlos têm 2 filhos')).toEqual({
            tipo: 'declarativa',
            incerta: false,
        });
        expect(classificarIntencao('os filhos são o lucas e o filipe')).toEqual({
            tipo: 'declarativa',
            incerta: false,
        });
    });

    it('"?" em qualquer ponto da mensagem é pergunta', () => {
        expect(classificarIntencao('o carlos gosta da sofia?').tipo).toBe('pergunta');
        expect(classificarIntencao('gosta da sofia? é importante').tipo).toBe('pergunta');
    });

    it('arranque interrogativo sem "?" é pergunta', () => {
        expect(classificarIntencao('será que o carlos gosta da sofia').tipo).toBe('pergunta');
        expect(classificarIntencao('sera que o carlos gosta da sofia').tipo).toBe('pergunta');
        expect(classificarIntencao('achas que a sofia gosta do carlos').tipo).toBe('pergunta');
        expect(classificarIntencao('quem são os filhos do carlos').tipo).toBe('pergunta');
        expect(classificarIntencao('quando é que decidimos o threshold').tipo).toBe('pergunta');
        expect(classificarIntencao('o que decidimos sobre auth').tipo).toBe('pergunta');
        expect(classificarIntencao('porquê o pgvector').tipo).toBe('pergunta');
    });

    it('pedido de consulta é pergunta, não facto', () => {
        expect(classificarIntencao('mostra o que sabes sobre a sofia').tipo).toBe('pergunta');
        expect(classificarIntencao('procura as notas do grafo').tipo).toBe('pergunta');
        expect(classificarIntencao('diz-me o que decidi sobre o RAG').tipo).toBe('pergunta');
        expect(classificarIntencao('lembra-me o que ficou aberto ontem').tipo).toBe('pergunta');
        expect(classificarIntencao('lista as tarefas do mem-vector').tipo).toBe('pergunta');
    });

    it('expressão de dúvida do utilizador é pergunta', () => {
        expect(classificarIntencao('não sei se a sofia gosta de gatos').tipo).toBe('pergunta');
        expect(classificarIntencao('pergunto-me se o threshold está certo').tipo).toBe('pergunta');
    });

    it('declarativa com hedge é facto incerto (regista + sinaliza)', () => {
        expect(classificarIntencao('a sofia talvez goste de gatos')).toEqual({
            tipo: 'declarativa',
            incerta: true,
        });
        expect(classificarIntencao('acho que o lucas nasceu em 2020')).toEqual({
            tipo: 'declarativa',
            incerta: true,
        });
        expect(classificarIntencao('se calhar mudamos o threshold')).toEqual({
            tipo: 'declarativa',
            incerta: true,
        });
    });

    // "acho que" (1ª pessoa, hedge) ≠ "achas que" (2ª pessoa, pergunta).
    it('distingue "acho que" (facto incerto) de "achas que" (pergunta)', () => {
        expect(classificarIntencao('acho que a sofia gosta do carlos').tipo).toBe('declarativa');
        expect(classificarIntencao('achas que a sofia gosta do carlos').tipo).toBe('pergunta');
    });

    // Saudações classificam como declarativa; a trivialidade é julgada pelo LLM
    // no prompt (contrato: o classificador só separa pergunta de afirmação).
    it('saudação é declarativa (trivialidade fica para o prompt)', () => {
        expect(classificarIntencao('bom dia').tipo).toBe('declarativa');
    });

    it('é insensível a maiúsculas e espaços à volta', () => {
        expect(classificarIntencao('  Será que vale a pena  ').tipo).toBe('pergunta');
        expect(classificarIntencao('O Carlos gosta da Sofia').tipo).toBe('declarativa');
    });
});
