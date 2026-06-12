import { describe, expect, it } from 'vitest';

import { detetarGatilhoTarefa, parseNovaTarefa, sugestoesParaGatilho } from './tarefas-quickadd';
import { ordenarTarefasAbertas, type Tarefa } from './tarefas.schema';

describe('parseNovaTarefa', () => {
    it('extrai todos os tokens na ordem do quick-add', () => {
        expect(
            parseNovaTarefa('ligar ao contabilista !alta #vida @2026-06-20 // levar os papéis'),
        ).toEqual({
            titulo: 'ligar ao contabilista',
            prioridade: 'alta',
            projeto: 'vida',
            dataFim: '2026-06-20',
            descricao: 'levar os papéis',
        });
    });

    it('sem tokens devolve só o título com defaults', () => {
        expect(parseNovaTarefa('comprar pão')).toEqual({
            titulo: 'comprar pão',
            prioridade: 'normal',
            projeto: undefined,
            dataFim: undefined,
            descricao: undefined,
        });
    });

    it('!normal é aceite (vem do autocomplete) e descrição vazia cai fora', () => {
        expect(parseNovaTarefa('rever PR !normal // ')).toEqual({
            titulo: 'rever PR',
            prioridade: 'normal',
            projeto: undefined,
            dataFim: undefined,
            descricao: undefined,
        });
    });

    it('tokens dentro da descrição não contaminam a tarefa', () => {
        const r = parseNovaTarefa('rever doc // falar com o João do #crm !alta');
        expect(r.titulo).toBe('rever doc');
        expect(r.projeto).toBeUndefined();
        expect(r.prioridade).toBe('normal');
        expect(r.descricao).toBe('falar com o João do #crm !alta');
    });

    it('data mal formada fica no título (não é engolida em silêncio)', () => {
        const r = parseNovaTarefa('pagar renda @20-06-2026');
        expect(r.dataFim).toBeUndefined();
        expect(r.titulo).toBe('pagar renda @20-06-2026');
    });
});

describe('detetarGatilhoTarefa', () => {
    it('deteta ! com termo parcial', () => {
        const texto = 'tarefa !al';
        expect(detetarGatilhoTarefa(texto, texto.length)).toEqual({
            tipo: 'prioridade',
            termo: 'al',
            inicio: 7,
        });
    });

    it('deteta # imediatamente após o símbolo', () => {
        const texto = 'tarefa #';
        expect(detetarGatilhoTarefa(texto, texto.length)).toEqual({
            tipo: 'projeto',
            termo: '',
            inicio: 7,
        });
    });

    it('espaço depois do símbolo fecha o gatilho', () => {
        const texto = 'tarefa #vida pronta';
        expect(detetarGatilhoTarefa(texto, texto.length)).toBeNull();
    });

    it('sem símbolo não há gatilho', () => {
        expect(detetarGatilhoTarefa('tarefa simples', 6)).toBeNull();
    });
});

describe('sugestoesParaGatilho', () => {
    it('prioridades filtradas por prefixo', () => {
        expect(sugestoesParaGatilho({ tipo: 'prioridade', termo: 'a', inicio: 0 }, [])).toEqual([
            'alta',
        ]);
    });

    it('projetos únicos, filtrados e ordenados', () => {
        const projetos = ['vida', 'crm', 'vida', 'Viagens'];
        expect(sugestoesParaGatilho({ tipo: 'projeto', termo: 'vi', inicio: 0 }, projetos)).toEqual(
            ['viagens', 'vida'].map((p) => projetos.find((x) => x.toLowerCase() === p) ?? p),
        );
    });
});

function tarefa(parcial: Partial<Tarefa> & { id: string }): Tarefa {
    return {
        titulo: parcial.id,
        estado: 'backlog',
        prioridade: 'normal',
        projeto: null,
        descricao: null,
        dependeDe: null,
        dataFim: null,
        criadaEm: '2026-06-12T00:00:00Z',
        concluidaEm: null,
        ...parcial,
    };
}

describe('ordenarTarefasAbertas', () => {
    it('data fim primeiro (mais próxima no topo), sem data vai para o fim', () => {
        const ordem = ordenarTarefasAbertas([
            tarefa({ id: 'sem-data' }),
            tarefa({ id: 'longe', dataFim: '2026-07-01' }),
            tarefa({ id: 'perto', dataFim: '2026-06-15' }),
        ]).map((t) => t.id);
        expect(ordem).toEqual(['perto', 'longe', 'sem-data']);
    });

    it('empate de data desempata por prioridade e depois estado desc do kanban', () => {
        const ordem = ordenarTarefasAbertas([
            tarefa({ id: 'baixa-testes', prioridade: 'baixa', estado: 'testes' }),
            tarefa({ id: 'normal-backlog', prioridade: 'normal', estado: 'backlog' }),
            tarefa({ id: 'normal-docs', prioridade: 'normal', estado: 'documentacao' }),
            tarefa({ id: 'alta-backlog', prioridade: 'alta', estado: 'backlog' }),
        ]).map((t) => t.id);
        expect(ordem).toEqual(['alta-backlog', 'normal-docs', 'normal-backlog', 'baixa-testes']);
    });
});
