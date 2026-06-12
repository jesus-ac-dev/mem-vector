import { PRIORIDADES_TAREFA, type PrioridadeTarefa, type Tarefa } from './tarefas.schema';

// Quick-add de tarefas à la Obsidian (#51): um input único onde os tokens
// compõem a tarefa — `!alta` prioridade, `#projeto` tag, `@AAAA-MM-DD` data
// fim, `// texto` descrição. Lógica pura (parse + gatilhos), espelhando o
// wikilink-autocomplete; o componente só guarda estado e teclado.
// Ordem canónica (#55, ronda 4): !prioridade #projeto tarefa @data-fim — os
// 3 primeiros são OBRIGATÓRIOS na criação manual; prioridade ausente fica
// undefined (o default é decisão de quem chama, não do parse).

export interface TarefaQuickAdd {
    titulo: string;
    projeto?: string;
    prioridade?: PrioridadeTarefa;
    dataFim?: string; // AAAA-MM-DD
    descricao?: string;
}

export function parseNovaTarefa(texto: string): TarefaQuickAdd {
    let prioridade: PrioridadeTarefa | undefined;
    let projeto: string | undefined;
    let dataFim: string | undefined;
    let descricao: string | undefined;

    const barra = texto.indexOf('//');
    let resto = texto;
    if (barra !== -1) {
        descricao = texto.slice(barra + 2).trim() || undefined;
        resto = texto.slice(0, barra);
    }

    const titulo = resto
        .replace(/!(alta|normal|baixa)\b/i, (_, p: string) => {
            prioridade = p.toLowerCase() as PrioridadeTarefa;
            return '';
        })
        .replace(/#([\p{L}\p{N}-]+)/u, (_, tag: string) => {
            projeto = tag;
            return '';
        })
        .replace(/@(\d{4}-\d{2}-\d{2})\b/, (_, d: string) => {
            dataFim = d;
            return '';
        })
        .replace(/\s+/g, ' ')
        .trim();

    return { titulo, projeto, prioridade, dataFim, descricao };
}

// Inverso do parse (#55): clicar no card reabre a tarefa como tokens no input,
// na ordem canónica. Prioridade vai sempre (é obrigatória ao guardar).
export function serializarTarefa(t: Tarefa): string {
    const partes = [
        `!${t.prioridade}`,
        t.projeto ? `#${t.projeto}` : null,
        t.titulo,
        t.dataFim ? `@${t.dataFim}` : null,
    ].filter(Boolean);
    return partes.join(' ') + (t.descricao ? ` // ${t.descricao}` : '');
}

// Hint-fantasma do input (#55, ronda 4): o que ainda falta preencher, na
// ordem canónica, para se continuar a ver enquanto se escreve.
export function hintQuickAdd(texto: string): string {
    const r = parseNovaTarefa(texto);
    const falta: string[] = [];
    if (!r.prioridade) falta.push('!prioridade');
    if (!r.projeto) falta.push('#projeto');
    if (!r.titulo) falta.push('tarefa');
    if (!r.dataFim) falta.push('@data-fim');
    if (!r.descricao) falta.push('// descrição');
    return falta.join(' ');
}

// Os 3 obrigatórios da criação manual (decisão do Carlos): sem eles não guarda.
export function faltaObrigatorios(texto: string): string[] {
    const r = parseNovaTarefa(texto);
    const falta: string[] = [];
    if (!r.prioridade) falta.push('!prioridade');
    if (!r.projeto) falta.push('#projeto');
    if (!r.titulo) falta.push('tarefa');
    return falta;
}

export interface GatilhoTarefa {
    tipo: 'prioridade' | 'projeto';
    termo: string; // texto já escrito a seguir ao símbolo
    inicio: number; // índice do símbolo (! ou #)
}

// Deteta se o cursor está logo a seguir a um `!` ou `#` aberto (sem espaço
// entre o símbolo e o cursor). Devolve null se não há gatilho ativo.
export function detetarGatilhoTarefa(texto: string, cursor: number): GatilhoTarefa | null {
    const antes = texto.slice(0, cursor);
    const simbolo = Math.max(antes.lastIndexOf('!'), antes.lastIndexOf('#'));
    if (simbolo === -1) return null;
    const termo = antes.slice(simbolo + 1);
    if (/\s/.test(termo)) return null;
    return {
        tipo: antes[simbolo] === '!' ? 'prioridade' : 'projeto',
        termo,
        inicio: simbolo,
    };
}

// Sugestões para o gatilho ativo: prioridades fixas ou projetos já usados.
export function sugestoesParaGatilho(g: GatilhoTarefa, projetos: string[]): string[] {
    const t = g.termo.toLowerCase();
    if (g.tipo === 'prioridade') {
        return PRIORIDADES_TAREFA.filter((p) => p.startsWith(t));
    }
    const unicos = [...new Set(projetos.map((p) => p.trim()).filter(Boolean))];
    return unicos
        .filter((p) => p.toLowerCase().includes(t))
        .sort((a, b) => a.localeCompare(b, 'pt'))
        .slice(0, 8);
}
