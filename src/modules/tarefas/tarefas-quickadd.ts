import { PRIORIDADES_TAREFA, type PrioridadeTarefa } from './tarefas.schema';

// Quick-add de tarefas à la Obsidian (#51): um input único onde os tokens
// compõem a tarefa — `!alta` prioridade, `#projeto` tag, `@AAAA-MM-DD` data
// fim, `// texto` descrição. Lógica pura (parse + gatilhos), espelhando o
// wikilink-autocomplete; o componente só guarda estado e teclado.

export interface TarefaQuickAdd {
    titulo: string;
    projeto?: string;
    prioridade: PrioridadeTarefa;
    dataFim?: string; // AAAA-MM-DD
    descricao?: string;
}

export function parseNovaTarefa(texto: string): TarefaQuickAdd {
    let prioridade: PrioridadeTarefa = 'normal';
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
