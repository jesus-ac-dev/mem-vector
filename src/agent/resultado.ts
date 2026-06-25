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
    acao: 'criada' | 'concluida' | 'operacional';
    id: string;
    titulo: string;
}

export type RegistoEscrita = RegistoNota | RegistoDaily | RegistoTarefa;

// #45: URL consultado pelas tools de web (procurar_web/ler_url) — não é uma
// escrita, é proveniência: o pai mostra-os como fontes 🌐 distintas do workspace.
export interface RegistoWeb {
    tipo: 'web';
    url: string;
    titulo: string;
}

export function registarEscrita(file: string, registo: RegistoEscrita): void {
    appendFileSync(file, `${JSON.stringify(registo)}\n`, 'utf8');
}

export function registarWeb(file: string, registo: RegistoWeb): void {
    appendFileSync(file, `${JSON.stringify(registo)}\n`, 'utf8');
}

// Lê os URLs de web consultados (dedup por url, ordem de consulta) — proveniência
// do turno com web. Ignora os registos de escrita da destilação.
export function lerWebConsultado(file: string): RegistoWeb[] {
    let raw = '';
    try {
        raw = readFileSync(file, 'utf8');
    } catch {
        return [];
    }
    const vistos = new Set<string>();
    const web: RegistoWeb[] = [];
    for (const linha of raw.split('\n')) {
        if (!linha.trim()) continue;
        try {
            const r = JSON.parse(linha) as RegistoWeb;
            if (r?.tipo === 'web' && r.url && !vistos.has(r.url)) {
                vistos.add(r.url);
                web.push({ tipo: 'web', url: r.url, titulo: r.titulo ?? r.url });
            }
        } catch {
            // linha corrompida não custa o resto
        }
    }
    return web;
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
        else if (r.acao === 'concluida') tarefas.concluidas.push({ id: r.id, titulo: r.titulo });
        // 'operacional': registado no ficheiro (auditoria das escritas), fora do resumo.
    }
    return { notas, daily, tarefas };
}

// M7-A: pedido de despacho de relay registado pela tool disparar_relay (subprocesso
// MCP). O responder-tools (Next context) lê-o após o turno e chama dispararRelay —
// o subprocesso não é contexto Next, não pode correr o orquestrador.
export interface RegistoRelay {
    tipo: 'relay';
    repo: string;
    issue: number;
}

export function registarRelay(file: string, registo: RegistoRelay): void {
    appendFileSync(file, `${JSON.stringify(registo)}\n`, 'utf8');
}

export function lerRelaysPedidos(file: string): RegistoRelay[] {
    let raw = '';
    try {
        raw = readFileSync(file, 'utf8');
    } catch {
        return [];
    }
    const vistos = new Set<string>();
    const out: RegistoRelay[] = [];
    for (const linha of raw.split('\n')) {
        if (!linha.trim()) continue;
        try {
            const r = JSON.parse(linha) as RegistoRelay;
            if (r?.tipo === 'relay' && r.repo && Number.isInteger(r.issue)) {
                const k = `${r.repo}#${r.issue}`;
                if (!vistos.has(k)) {
                    vistos.add(k);
                    out.push({ tipo: 'relay', repo: r.repo, issue: r.issue });
                }
            }
        } catch {
            // linha de outro tipo (nota/web/...) — ignora
        }
    }
    return out;
}
