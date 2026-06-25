import { describe, expect, it } from 'vitest';

import {
    detetarGatilhoTarefa,
    faltaObrigatorios,
    hintQuickAdd,
    parseNovaTarefa,
    serializarTarefa,
    sugestoesParaGatilho,
} from './tarefas-quickadd';
import {
    agruparPorEstado,
    ordenarTarefasAbertas,
    TarefaDestiladaSchema,
    type Tarefa,
} from './tarefas.schema';

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

    it('sem tokens devolve só o título; prioridade ausente fica undefined (#55 r4)', () => {
        expect(parseNovaTarefa('comprar pão')).toEqual({
            titulo: 'comprar pão',
            prioridade: undefined,
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
        expect(r.prioridade).toBeUndefined();
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

describe('serializarTarefa (clicar para editar, #55)', () => {
    it('round-trip na ordem canónica: !prioridade #projeto tarefa @data // descrição', () => {
        const t = tarefa({
            id: 'x',
            titulo: 'testar emails',
            projeto: 'crmcredito',
            prioridade: 'alta',
            dataFim: '2026-06-14',
            descricao: 'smoke completo',
        });
        expect(serializarTarefa(t)).toBe(
            '!alta #crmcredito testar emails @2026-06-14 // smoke completo',
        );
        const r = parseNovaTarefa(serializarTarefa(t));
        expect(r).toEqual({
            titulo: 'testar emails',
            projeto: 'crmcredito',
            prioridade: 'alta',
            dataFim: '2026-06-14',
            descricao: 'smoke completo',
        });
    });

    it('prioridade vai sempre (é obrigatória ao guardar); opcionais ausentes não', () => {
        expect(serializarTarefa(tarefa({ id: 'x', titulo: 'comprar pão' }))).toBe(
            '!normal comprar pão',
        );
    });
});

describe('hint e obrigatórios (#55, ronda 4)', () => {
    it('input vazio mostra a hint completa na ordem canónica', () => {
        expect(hintQuickAdd('')).toBe('!prioridade #projeto tarefa @data-fim // descrição');
    });

    it('a hint encolhe à medida que os tokens entram', () => {
        expect(hintQuickAdd('!alta #vida')).toBe('tarefa @data-fim // descrição');
        expect(hintQuickAdd('!alta #vida pagar renda @2026-06-30 // os papéis')).toBe('');
    });

    it('faltaObrigatorios exige !prioridade #projeto tarefa', () => {
        expect(faltaObrigatorios('pagar renda')).toEqual(['!prioridade', '#projeto']);
        expect(faltaObrigatorios('!alta #vida')).toEqual(['tarefa']);
        expect(faltaObrigatorios('!alta #vida pagar renda')).toEqual([]);
    });
});

describe('TarefaDestiladaSchema (envelope do agente)', () => {
    it('aceita dataFim válida', () => {
        const r = TarefaDestiladaSchema.parse({
            titulo: 'Testar emails do crmcredito',
            projeto: 'crmcredito',
            dataFim: '2026-06-14',
        });
        expect(r.dataFim).toBe('2026-06-14');
    });

    it('dataFim malformada não custa a tarefa — cai para undefined', () => {
        const r = TarefaDestiladaSchema.parse({
            titulo: 'Testar emails do crmcredito',
            dataFim: 'domingo',
        });
        expect(r.titulo).toBe('Testar emails do crmcredito');
        expect(r.dataFim).toBeUndefined();
    });
});

function tarefa(parcial: Partial<Tarefa> & { id: string }): Tarefa {
    return {
        titulo: parcial.id,
        estado: 'backlog',
        prioridade: 'normal',
        projetoId: null,
        projeto: null,
        descricao: null,
        dependeDe: null,
        dataFim: null,
        criadaEm: '2026-06-12T00:00:00Z',
        concluidaEm: null,
        repoGithub: null,
        issueGithub: null,
        relayEstado: null,
        relayFase: null,
        relayPrUrl: null,
        acceptance: null,
        blocker: null,
        evidence: null,
        ...parcial,
    };
}

describe('agruparPorEstado (kanban #58)', () => {
    it('distribui abertas pelas colunas e concluídas em terminado', () => {
        const grupos = agruparPorEstado(
            [
                tarefa({ id: 'a', estado: 'backlog' }),
                tarefa({ id: 'b', estado: 'desenvolvimento' }),
                tarefa({ id: 'c', estado: 'backlog' }),
            ],
            [tarefa({ id: 'feita', estado: 'terminado' })],
        );
        expect(grupos.backlog.map((t) => t.id)).toEqual(['a', 'c']);
        expect(grupos.desenvolvimento.map((t) => t.id)).toEqual(['b']);
        expect(grupos.analise).toEqual([]);
        expect(grupos.terminado.map((t) => t.id)).toEqual(['feita']);
    });
});

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
