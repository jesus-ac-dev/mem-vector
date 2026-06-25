import { beforeEach, describe, expect, it } from 'vitest';

import { ocuparOuEnfileirar, proximaOuLibertar, _resetFila } from './relay.fila';

describe('fila do relay (um por repo; o 2º disparo enfileira)', () => {
    beforeEach(() => _resetFila());

    it('repo livre → corre já', () => {
        expect(ocuparOuEnfileirar('/r', 1)).toEqual({ correr: true, posicao: 0 });
    });

    it('repo ocupado → enfileira, posição cresce', () => {
        ocuparOuEnfileirar('/r', 1); // ocupa
        expect(ocuparOuEnfileirar('/r', 2)).toEqual({ correr: false, posicao: 1 });
        expect(ocuparOuEnfileirar('/r', 3)).toEqual({ correr: false, posicao: 2 });
    });

    it('dedup: re-disparo da issue ativa não a mete na fila', () => {
        ocuparOuEnfileirar('/r', 1); // ocupa
        expect(ocuparOuEnfileirar('/r', 1)).toEqual({ correr: false, posicao: 0 });
        expect(proximaOuLibertar('/r')).toBeNull();
    });

    it('dedup: re-disparo devolve a posição atual, não enfileira de novo', () => {
        ocuparOuEnfileirar('/r', 1); // ocupa
        ocuparOuEnfileirar('/r', 2); // posição 1
        ocuparOuEnfileirar('/r', 3); // posição 2
        expect(ocuparOuEnfileirar('/r', 2)).toEqual({ correr: false, posicao: 1 }); // dedup, não 3
        // a fila continua [2, 3]
        expect(proximaOuLibertar('/r')).toBe(2);
        expect(proximaOuLibertar('/r')).toBe(3);
        expect(proximaOuLibertar('/r')).toBeNull();
    });

    it('ao terminar sai a próxima FIFO; fila vazia → liberta o repo', () => {
        ocuparOuEnfileirar('/r', 1);
        ocuparOuEnfileirar('/r', 2);
        ocuparOuEnfileirar('/r', 3);
        expect(proximaOuLibertar('/r')).toBe(2);
        expect(proximaOuLibertar('/r')).toBe(3);
        expect(proximaOuLibertar('/r')).toBeNull();
        // libertou → um disparo novo corre já
        expect(ocuparOuEnfileirar('/r', 4)).toEqual({ correr: true, posicao: 0 });
    });

    it('repos diferentes são independentes', () => {
        ocuparOuEnfileirar('/a', 1);
        expect(ocuparOuEnfileirar('/b', 1)).toEqual({ correr: true, posicao: 0 });
    });
});
