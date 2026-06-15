import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { lerEscritas, reduzirEscritas, registarEscrita } from './resultado';

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memvector-resultado-'));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('registarEscrita / lerEscritas', () => {
    it('faz round-trip de notas e dailies por ordem', () => {
        const file = join(dir, 'r.jsonl');
        registarEscrita(file, {
            tipo: 'nota',
            slug: 'carlos-e-sofia',
            title: 'Carlos e Sofia',
            criada: true,
        });
        registarEscrita(file, { tipo: 'daily', dia: '2026-06-11', criado: false });

        expect(lerEscritas(file)).toEqual([
            { tipo: 'nota', slug: 'carlos-e-sofia', title: 'Carlos e Sofia', criada: true },
            { tipo: 'daily', dia: '2026-06-11', criado: false },
        ]);
    });

    it('ficheiro inexistente é turno trivial (sem escritas)', () => {
        expect(lerEscritas(join(dir, 'nao-existe.jsonl'))).toEqual([]);
    });

    it('linhas corrompidas não custam o resto do resultado', () => {
        const file = join(dir, 'r.jsonl');
        writeFileSync(
            file,
            '{"tipo":"nota","slug":"a","title":"A","criada":true}\nlixo{{{\n{"tipo":"x"}\n{"tipo":"daily","dia":"2026-06-11","criado":true}\n',
        );
        expect(lerEscritas(file)).toHaveLength(2);
    });
});

describe('reduzirEscritas', () => {
    it('sem escritas devolve notas vazias e daily nulo', () => {
        expect(reduzirEscritas([])).toEqual({
            notas: [],
            daily: null,
            tarefas: { criadas: [], concluidas: [] },
        });
    });

    it('junta TODAS as notas do turno (1 bloco → N notas) e o último daily', () => {
        const r = reduzirEscritas([
            { tipo: 'nota', slug: 'a', title: 'A', criada: true },
            { tipo: 'nota', slug: 'b', title: 'B', criada: false },
            { tipo: 'daily', dia: '2026-06-11', criado: true },
        ]);
        expect(r.notas).toEqual([
            { slug: 'a', title: 'A', criada: true },
            { slug: 'b', title: 'B', criada: false },
        ]);
        expect(r.daily).toEqual({ dia: '2026-06-11', criado: true });
    });

    it('dedup por slug: a última escrita do mesmo slug vence', () => {
        const r = reduzirEscritas([
            { tipo: 'nota', slug: 'a', title: 'A', criada: true },
            { tipo: 'nota', slug: 'a', title: 'A v2', criada: false },
        ]);
        expect(r.notas).toEqual([{ slug: 'a', title: 'A v2', criada: false }]);
    });
});
