import { describe, expect, it } from 'vitest';

import { criarDetetorEscalada, SENTINELA_ESCALAR } from './escalada';

// #85 fatia 1: o caminho rápido (streaming) pode responder OU emitir o sentinela
// [[ESCALAR]] para pedir o agente-com-tools. O detetor segura o stream até ter a
// certeza: se for sentinela, suprime tudo (escalou=true); senão deixa passar.
function recolher(chunks: string[]): { emitido: string; escalou: boolean } {
    let emitido = '';
    const d = criarDetetorEscalada(SENTINELA_ESCALAR, (t) => (emitido += t));
    for (const c of chunks) d.processar(c);
    const { escalou } = d.finalizar();
    return { emitido, escalou };
}

describe('criarDetetorEscalada (#85)', () => {
    it('sentinela exato → escala, não emite nada', () => {
        expect(recolher(['[[ESCALAR]]'])).toEqual({ emitido: '', escalou: true });
    });

    it('sentinela partido em chunks → escala', () => {
        expect(recolher(['[[', 'ESCAL', 'AR]]'])).toEqual({ emitido: '', escalou: true });
    });

    it('sentinela com texto a seguir → escala (ignora o resto)', () => {
        expect(recolher(['[[ESCALAR]] preciso de pesquisar'])).toEqual({
            emitido: '',
            escalou: true,
        });
    });

    it('sentinela partido em chunks com texto extra no fim → escala', () => {
        expect(recolher(['[[ESCAL', 'AR]] resposta bónus'])).toEqual({
            emitido: '',
            escalou: true,
        });
    });

    it('resposta normal → não escala, emite tudo', () => {
        expect(recolher(['A versão', ' é a 19.2'])).toEqual({
            emitido: 'A versão é a 19.2',
            escalou: false,
        });
    });

    it('resposta que começa por [ mas não é o sentinela → emite', () => {
        expect(recolher(['[código] aqui'])).toEqual({ emitido: '[código] aqui', escalou: false });
    });

    it('whitespace à frente da resposta preserva-se', () => {
        expect(recolher(['\n\nOlá Carlos'])).toEqual({ emitido: '\n\nOlá Carlos', escalou: false });
    });

    it('prefixo parcial do sentinela que nunca completa → trata como resposta', () => {
        expect(recolher(['[[ESC'])).toEqual({ emitido: '[[ESC', escalou: false });
    });
});
