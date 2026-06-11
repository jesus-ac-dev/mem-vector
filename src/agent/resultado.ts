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

export type RegistoEscrita = RegistoNota | RegistoDaily;

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
            if (r && (r.tipo === 'nota' || r.tipo === 'daily')) registos.push(r);
        } catch {
            // linha corrompida não custa o resto do resultado
        }
    }
    return registos;
}

// Reduz a lista de escritas ao formato do job: a ÚLTIMA nota e o ÚLTIMO daily
// do turno (a sessão pode corrigir-se a si própria; vale o estado final).
export function reduzirEscritas(registos: RegistoEscrita[]): {
    nota: Omit<RegistoNota, 'tipo'> | null;
    daily: Omit<RegistoDaily, 'tipo'> | null;
} {
    let nota: Omit<RegistoNota, 'tipo'> | null = null;
    let daily: Omit<RegistoDaily, 'tipo'> | null = null;
    for (const r of registos) {
        if (r.tipo === 'nota') nota = { slug: r.slug, title: r.title, criada: r.criada };
        else daily = { dia: r.dia, criado: r.criado };
    }
    return { nota, daily };
}
