import { appendFileSync, readFileSync } from 'node:fs';

// Contrato do ficheiro de resultado entre o MCP server (subprocesso do claude
// CLI) e o job de destilação (processo Next). As tools registam cada escrita
// numa linha JSON; o pai reduz a TurnoDestilado a partir daqui — nunca do
// texto do modelo, que não é evidência de escrita.
export interface RegistoNota {
    tipo: 'nota';
    slug: string;
    title: string;
    criada: boolean;
}

export interface RegistoDaily {
    tipo: 'daily';
    dia: string;
    criado: boolean;
}

export interface RegistoTarefa {
    tipo: 'tarefa';
    acao: 'criada' | 'concluida';
    id: string;
    titulo: string;
}

export type RegistoEscrita = RegistoNota | RegistoDaily | RegistoTarefa;

export function registarEscrita(file: string, registo: RegistoEscrita): void {
    appendFileSync(file, `${JSON.stringify(registo)}\n`, 'utf8');
}

export function lerEscritas(file: string): RegistoEscrita[] {
    let raw = '';
    try {
        raw = readFileSync(file, 'utf8');
    } catch {
        // Turno trivial legítimo: o agente não escreveu nada e o ficheiro não existe.
        return [];
    }
    const registos: RegistoEscrita[] = [];
    for (const linha of raw.split('\n')) {
        if (!linha.trim()) continue;
        try {
            const o: unknown = JSON.parse(linha);
            const r = o as RegistoEscrita;
            if (r && (r.tipo === 'nota' || r.tipo === 'daily' || r.tipo === 'tarefa'))
                registos.push(r);
        } catch {
            // linha corrompida não custa o resto do resultado
        }
    }
    return registos;
}

// Reduz a lista de escritas ao formato do job: as notas do turno (1 bloco → N
// notas, dedup por slug — a última escrita do mesmo slug vence) e o ÚLTIMO daily.
export function reduzirEscritas(registos: RegistoEscrita[]): {
    notas: Omit<RegistoNota, 'tipo'>[];
    daily: Omit<RegistoDaily, 'tipo'> | null;
    tarefas: {
        criadas: { id: string; titulo: string }[];
        concluidas: { id: string; titulo: string }[];
    };
} {
    const notas: Omit<RegistoNota, 'tipo'>[] = [];
    let daily: Omit<RegistoDaily, 'tipo'> | null = null;
    const tarefas = {
        criadas: [] as { id: string; titulo: string }[],
        concluidas: [] as { id: string; titulo: string }[],
    };
    for (const r of registos) {
        if (r.tipo === 'nota') {
            const i = notas.findIndex((n) => n.slug === r.slug);
            const entrada = { slug: r.slug, title: r.title, criada: r.criada };
            if (i >= 0) notas[i] = entrada;
            else notas.push(entrada);
        } else if (r.tipo === 'daily') daily = { dia: r.dia, criado: r.criado };
        else if (r.acao === 'criada') tarefas.criadas.push({ id: r.id, titulo: r.titulo });
        else tarefas.concluidas.push({ id: r.id, titulo: r.titulo });
    }
    return { notas, daily, tarefas };
}
