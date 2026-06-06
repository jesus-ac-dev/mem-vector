# Cores de pasta + dailies no grafo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar cor aos nós do grafo por categoria — notas knowledge herdam a cor da sua pasta (`folders.color`), as dailies entram no grafo (ligadas por `edges`) com uma cor configurável; um modal no grafo mapeia pasta/daily → cor; a pasta mostra a cor no explorer.

**Architecture:** Cor = hex guardado em `folders.color` (pastas) e `profiles.daily_color` (daily), resolvido por uma paleta pura (`src/lib/cores.ts`). A geração de `edges` é extraída para um helper partilhado (`regenerarEdgesCom`) usado por `escreverNotaCom` (knowledge) e `substituirDailyCom` (daily). `grafoDadosCom` passa a unir nós knowledge+daily com a cor resolvida; `workspace-graph` pinta por `nodeColor`.

**Tech Stack:** Next.js (App Router, server actions), Supabase (Postgres + RLS), Zod, vitest, `tsx` (headless), react-force-graph.

---

## Notas de contexto (ler antes)

- Branch: `integra/file-explorer-stack` (continua a stack já integrada). BD local up (`npm run db:status`; senão `npm run db:up`).
- `folders.color` (text null) já existe e já chega à árvore (`Pasta.color` em `folders.tree.ts`).
- `escreverNotaCom` (`knowledge.service.ts`) gera edges inline: apaga `(owner, from_type='knowledge', from_id)` e insere uma por alvo (`to_slug`, resolve `to_id` em knowledge). É a lógica a extrair.
- `substituirDailyCom` (`daily.service.ts`) grava o daily + versão + `reindexEntity`, mas **não gera edges**.
- `grafoDadosCom` (`knowledge.service.ts`) devolve `{nodes: GrafoNode[], links}` só de knowledge; `GrafoNode = {id, slug, title, group}`.
- `workspace-graph.tsx` usa `props.nodeAutoColorBy: 'group'` e `abrirNo` abre sempre `tipo:'knowledge'`.
- `profiles` (migration `20260603120000`): `id uuid pk`, restantes colunas null. RLS "o próprio".
- Sem componente `Dialog` em `ui/` — o modal é um overlay próprio.
- Verificação: `npm run verify` (format+lint+typecheck+test). Teste só: `npx vitest run <path>`.
- Regra UI: usar `<Button>`/`<Input>` de `@/components/ui`, nunca `<button>`/`<input>` raw (eslint `no-restricted-syntax`).

## File Structure

- Create `supabase/migrations/20260606180000_daily_color.sql` — `profiles.daily_color`.
- Create `src/lib/cores.ts` (+ `.test.ts`) — paleta + `resolverCor`.
- Create `src/modules/knowledge/edges.ts` (+ `.test.ts` p/ a parte pura) — `regenerarEdgesCom`.
- Modify `src/modules/knowledge/knowledge.service.ts` — `escreverNotaCom` usa o helper; `grafoDadosCom` alargado; `GrafoNode` ganha `color`.
- Modify `src/modules/daily/daily.service.ts` — `substituirDailyCom` gera edges; + `definirCorDailyCom`/`corDailyCom`.
- Modify `src/modules/folders/folders.service.ts` — `definirCorPastaCom`/`definirCorPasta`.
- Modify `src/modules/workspace/workspace.actions.ts` — `definirCorPastaAction`, `definirCorDailyAction`, `listarPastasAction`, `corDailyAction`.
- Create `src/components/layout/grafo-config.tsx` — modal de cores.
- Modify `src/components/layout/workspace-graph.tsx` — `nodeColor`, abrir daily, ícone+modal.
- Modify `src/components/layout/file-explorer.tsx` — bolinha de cor na pasta.
- Create `scripts/cores.ts` + entrada `cores` em `package.json`.
- Modify `docs/FOLDERS.md`.

---

## FASE A — Fundação (migration + paleta)

### Task A1: Migration `profiles.daily_color`

**Files:**
- Create: `supabase/migrations/20260606180000_daily_color.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Cor (hex) do grupo "Daily Notes" no grafo do conhecimento. Por utilizador.
-- As dailies não têm pasta; esta é a cor partilhada por todas as dailies.
alter table profiles
    add column daily_color text;
```

- [ ] **Step 2: Aplicar**

Run: `npx supabase migration up --local`
Expected: `Applying migration 20260606180000_daily_color.sql...` sem erro.

- [ ] **Step 3: Confirmar a coluna**

Run: `docker exec supabase_db_mem-vector psql -U postgres -d postgres -tAc "select column_name from information_schema.columns where table_name='profiles' and column_name='daily_color';"`
Expected: `daily_color`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260606180000_daily_color.sql
git commit -m "feat(cores): migration profiles.daily_color"
```

### Task A2: Paleta pura (`cores.ts`)

**Files:**
- Create: `src/lib/cores.ts`
- Test: `src/lib/cores.test.ts`

- [ ] **Step 1: Escrever o teste**

Criar `src/lib/cores.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PALETA, COR_DEFAULT, COR_DAILY_DEFAULT, resolverCor } from './cores';

describe('cores', () => {
    it('a paleta tem cores com label e hex', () => {
        expect(PALETA.length).toBeGreaterThanOrEqual(8);
        for (const c of PALETA) {
            expect(c.label).toBeTruthy();
            expect(c.hex).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });
    it('resolverCor devolve o hex quando há cor', () => {
        expect(resolverCor('#3b82f6')).toBe('#3b82f6');
    });
    it('resolverCor cai no fallback quando null/vazio', () => {
        expect(resolverCor(null)).toBe(COR_DEFAULT);
        expect(resolverCor('')).toBe(COR_DEFAULT);
        expect(resolverCor(undefined, COR_DAILY_DEFAULT)).toBe(COR_DAILY_DEFAULT);
    });
});
```

- [ ] **Step 2: Correr — falha**

Run: `npx vitest run src/lib/cores.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

Criar `src/lib/cores.ts`:

```ts
export interface Cor {
    label: string;
    hex: string;
}

// Paleta curada — cores distinguíveis no grafo (tom médio, lê-se em claro/escuro).
export const PALETA: Cor[] = [
    { label: 'Azul', hex: '#3b82f6' },
    { label: 'Verde', hex: '#22c55e' },
    { label: 'Vermelho', hex: '#ef4444' },
    { label: 'Âmbar', hex: '#f59e0b' },
    { label: 'Roxo', hex: '#a855f7' },
    { label: 'Rosa', hex: '#ec4899' },
    { label: 'Ciano', hex: '#06b6d4' },
    { label: 'Lima', hex: '#84cc16' },
];

export const COR_DEFAULT = '#9ca3af'; // cinza — knowledge sem pasta/cor
export const COR_DAILY_DEFAULT = '#64748b'; // slate — daily sem cor configurada

// Resolve a cor guardada (hex ou null) para um hex utilizável, com fallback.
export function resolverCor(hex: string | null | undefined, fallback: string = COR_DEFAULT): string {
    return hex && hex.trim() ? hex : fallback;
}
```

- [ ] **Step 4: Correr — passa**

Run: `npx vitest run src/lib/cores.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cores.ts src/lib/cores.test.ts
git commit -m "feat(cores): paleta fixa + resolverCor (puro, TDD)"
```

---

## FASE B — Edges (helper partilhado + daily)

### Task B1: Helper `regenerarEdgesCom`

**Files:**
- Create: `src/modules/knowledge/edges.ts`
- Modify: `src/modules/knowledge/knowledge.service.ts` (`escreverNotaCom`)

- [ ] **Step 1: Criar o helper**

Criar `src/modules/knowledge/edges.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RegenerarEdgesInput {
    ownerId: string;
    fromType: 'knowledge' | 'daily';
    fromId: string;
    alvos: string[]; // slugs já normalizados (parseWikilinks + links explícitos)
}

// Regenera as arestas de uma entidade: apaga as antigas (owner, fromType, fromId)
// e insere uma por alvo. Resolve to_id/to_type em `knowledge` se a nota existir;
// senão fica pendente (to_slug guardado, to_id null). Partilhado por knowledge e daily.
export async function regenerarEdgesCom(
    db: SupabaseClient,
    { ownerId, fromType, fromId, alvos }: RegenerarEdgesInput,
): Promise<void> {
    const { error: dErr } = await db
        .from('edges')
        .delete()
        .eq('owner_id', ownerId)
        .eq('from_type', fromType)
        .eq('from_id', fromId);
    if (dErr) throw new Error(`apagar edges: ${dErr.message}`);

    const unicos = [...new Set(alvos)].filter(Boolean);
    if (!unicos.length) return;

    const { data: existentes } = await db
        .from('knowledge')
        .select('id, slug')
        .eq('owner_id', ownerId)
        .in('slug', unicos);
    const idPorSlug = new Map((existentes ?? []).map((r) => [r.slug, r.id]));

    const { error: iErr } = await db.from('edges').insert(
        unicos.map((to_slug) => ({
            owner_id: ownerId,
            from_type: fromType,
            from_id: fromId,
            to_type: idPorSlug.has(to_slug) ? 'knowledge' : null,
            to_slug,
            to_id: idPorSlug.get(to_slug) ?? null,
            kind: 'wikilink',
        })),
    );
    if (iErr) throw new Error(`inserir edges: ${iErr.message}`);
}
```

- [ ] **Step 2: `escreverNotaCom` passa a usar o helper**

Em `src/modules/knowledge/knowledge.service.ts`:

1. Import (junto aos outros de `./`):

```ts
import { regenerarEdgesCom } from './edges';
```

2. Substituir o bloco de edges inline (o que apaga `edges` e insere a partir de `alvos`, atualmente logo a seguir ao `reindexEntity` dentro de `escreverNotaCom`) por:

```ts
    await regenerarEdgesCom(db, {
        ownerId: user.id,
        fromType: 'knowledge',
        fromId: nota.id,
        alvos: [...new Set([...parseWikilinks(dados.content_md), ...dados.links.map(slugify)])],
    });
```

(Remove o `import` de `parseWikilinks`/`slugify` só se deixarem de ser usados noutro ponto — `slugify` continua usado; manter ambos.)

- [ ] **Step 3: Verificar (testes do agente-autor cobrem o caminho crítico)**

Run: `npm run verify`
Expected: verde (os testes `knowledge.*` continuam a passar).

- [ ] **Step 4: Prova headless do agente-autor (edges não partiram)**

Run: `npm run author-update`
Expected: `PROVA VERDE`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/knowledge/edges.ts src/modules/knowledge/knowledge.service.ts
git commit -m "refactor(edges): extrai regenerarEdgesCom (partilhado) de escreverNotaCom"
```

### Task B2: `substituirDailyCom` gera edges

**Files:**
- Modify: `src/modules/daily/daily.service.ts`

- [ ] **Step 1: Importar e gerar edges após reindex**

Em `src/modules/daily/daily.service.ts`:

1. Imports (junto aos de `@/`):

```ts
import { regenerarEdgesCom } from '@/modules/knowledge/edges';
import { parseWikilinks } from '@/modules/knowledge/knowledge.links';
```

2. No fim de `substituirDailyCom`, a seguir ao `reindexEntity(...)`, acrescentar:

```ts
    await regenerarEdgesCom(db, {
        ownerId: user.id,
        fromType: 'daily',
        fromId: daily.id,
        alvos: parseWikilinks(contentNormalizado),
    });
```

- [ ] **Step 2: Verificar**

Run: `npm run verify`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add src/modules/daily/daily.service.ts
git commit -m "feat(cores): dailies geram edges ao gravar (ligam-se no grafo)"
```

---

## FASE C — grafoDados + grafo colorido

### Task C1: `grafoDadosCom` une knowledge+daily com cor

**Files:**
- Modify: `src/modules/knowledge/knowledge.service.ts`

- [ ] **Step 1: `GrafoNode` ganha `color`**

Em `knowledge.service.ts`, na interface `GrafoNode`:

```ts
export interface GrafoNode {
    id: string;
    slug: string;
    title: string;
    group: string; // 'knowledge' | 'daily'
    color: string; // hex resolvido
}
```

- [ ] **Step 2: Reescrever `grafoDadosCom`**

Substituir o corpo de `grafoDadosCom` por (importar `resolverCor`, `COR_DEFAULT`, `COR_DAILY_DEFAULT` de `@/lib/cores` no topo do ficheiro):

```ts
export async function grafoDadosCom(db: SupabaseClient): Promise<GrafoDados> {
    const {
        data: { user },
    } = await db.auth.getUser();

    // Cor por pasta (id → hex).
    const { data: pastas } = await db.from('folders').select('id, color');
    const corPorPasta = new Map<string, string | null>(
        (pastas ?? []).map((p) => [String(p.id), (p.color as string | null) ?? null]),
    );

    // Nós knowledge (não arquivadas), cor = cor da pasta (ou default).
    const { data: notas, error } = await db
        .from('knowledge')
        .select('id, slug, title, folder_id')
        .eq('archived', false);
    if (error) throw new Error(`grafo knowledge: ${error.message}`);
    const nodesK: GrafoNode[] = (notas ?? []).map((n) => ({
        id: String(n.id),
        slug: n.slug,
        title: n.title,
        group: 'knowledge',
        color: resolverCor(n.folder_id ? corPorPasta.get(String(n.folder_id)) : null, COR_DEFAULT),
    }));

    // Cor do grupo daily (profile do utilizador).
    let corDailyHex: string | null = null;
    if (user) {
        const prof = await db
            .from('profiles')
            .select('daily_color')
            .eq('id', user.id)
            .maybeSingle();
        corDailyHex = prof.data?.daily_color ?? null;
    }
    const corDaily = resolverCor(corDailyHex, COR_DAILY_DEFAULT);

    // Nós daily.
    const { data: dailies } = await db.from('dailies').select('id, dia');
    const nodesD: GrafoNode[] = (dailies ?? []).map((d) => ({
        id: String(d.id),
        slug: d.dia,
        title: d.dia,
        group: 'daily',
        color: corDaily,
    }));

    const nodes = [...nodesK, ...nodesD];
    const idsValidos = new Set(nodes.map((n) => n.id));

    // Arestas: knowledge + daily, ambos os extremos têm de ser nós conhecidos.
    const { data: ed, error: eErr } = await db
        .from('edges')
        .select('from_id, to_id')
        .in('from_type', ['knowledge', 'daily'])
        .not('to_id', 'is', null);
    if (eErr) throw new Error(`grafo edges: ${eErr.message}`);
    const links: GrafoLink[] = (ed ?? [])
        .map((e) => ({ source: String(e.from_id), target: String(e.to_id) }))
        .filter((l) => idsValidos.has(l.source) && idsValidos.has(l.target));

    return { nodes, links };
}
```

- [ ] **Step 3: Verificar e commitar**

Run: `npm run verify`
Expected: verde.

```bash
git add src/modules/knowledge/knowledge.service.ts
git commit -m "feat(cores): grafoDados une knowledge+daily com cor resolvida"
```

### Task C2: Grafo pinta por `nodeColor` e abre dailies

**Files:**
- Modify: `src/components/layout/workspace-graph.tsx`

- [ ] **Step 1: `NoGrafo` ganha `color`+`group`, `props` usa `nodeColor`, `abrirNo` trata daily**

Em `workspace-graph.tsx`:

1. Na interface local `NoGrafo`, garantir `group` e `color`:

```ts
interface NoGrafo {
    id: string;
    slug: string;
    title: string;
    group: string;
    color: string;
}
```

2. `abrirNo` passa a abrir daily ou knowledge conforme o grupo:

```ts
    function abrirNo(node: object) {
        const n = node as NoGrafo;
        if (n.group === 'daily') {
            abrirFicheiro({ tipo: 'daily', chave: n.slug, titulo: n.title });
        } else {
            abrirFicheiro({ tipo: 'knowledge', chave: n.slug, titulo: n.title });
        }
        router.push('/chat');
    }
```

3. Em `props`, trocar `nodeAutoColorBy: 'group',` por:

```ts
        nodeColor: (n: object) => (n as NoGrafo).color,
```

- [ ] **Step 2: Verificar e construir**

Run: `npm run verify && npm run build`
Expected: verde.

```bash
git add src/components/layout/workspace-graph.tsx
git commit -m "feat(cores): grafo pinta por nodeColor + clicar num daily abre o daily"
```

---

## FASE D — Actions de cor

### Task D1: `definirCorPasta` (folders) + `definirCorDaily`/`corDaily` (daily)

**Files:**
- Modify: `src/modules/folders/folders.service.ts`
- Modify: `src/modules/daily/daily.service.ts`

- [ ] **Step 1: `definirCorPastaCom` em folders.service**

Em `src/modules/folders/folders.service.ts`, acrescentar (segue o padrão `*Com` + wrapper; importa `createClient` já usado no módulo):

```ts
// Define a cor (hex) de uma pasta. null limpa a cor.
export async function definirCorPastaCom(
    db: SupabaseClient,
    folderId: string,
    cor: string | null,
): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const { error } = await db
        .from('folders')
        .update({ color: cor })
        .eq('owner_id', user.id)
        .eq('id', folderId);
    if (error) throw new Error(`definir cor pasta: ${error.message}`);
}
export const definirCorPasta = async (folderId: string, cor: string | null) =>
    definirCorPastaCom(await createClient(), folderId, cor);
```

- [ ] **Step 2: `definirCorDailyCom` + `corDailyCom` em daily.service**

Em `src/modules/daily/daily.service.ts`, acrescentar:

```ts
// Cor (hex) do grupo daily, guardada no profile do utilizador. null limpa.
export async function definirCorDailyCom(db: SupabaseClient, cor: string | null): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');
    const { error } = await db
        .from('profiles')
        .upsert({ id: user.id, daily_color: cor }, { onConflict: 'id' });
    if (error) throw new Error(`definir cor daily: ${error.message}`);
}
export const definirCorDaily = async (cor: string | null) =>
    definirCorDailyCom(await createClient(), cor);

export async function corDailyCom(db: SupabaseClient): Promise<string | null> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) return null;
    const { data } = await db
        .from('profiles')
        .select('daily_color')
        .eq('id', user.id)
        .maybeSingle();
    return data?.daily_color ?? null;
}
export const corDaily = async () => corDailyCom(await createClient());
```

- [ ] **Step 3: Verificar e commitar**

Run: `npm run verify`
Expected: verde.

```bash
git add src/modules/folders/folders.service.ts src/modules/daily/daily.service.ts
git commit -m "feat(cores): definirCorPasta (folders) + definirCorDaily/corDaily (profile)"
```

### Task D2: Actions de cor + listar pastas

**Files:**
- Modify: `src/modules/workspace/workspace.actions.ts`

- [ ] **Step 1: Imports + actions**

Em `workspace.actions.ts`:

1. Imports:

```ts
import { criarPasta, renomearPasta, definirCorPasta, listarPastas } from '@/modules/folders/folders.service';
import { definirCorDaily, corDaily } from '@/modules/daily/daily.service';
import type { Pasta } from '@/modules/folders/folders.service';
```

(funde com os imports já existentes desses módulos — não duplicar linhas de import.)

2. No fim do ficheiro:

```ts
/** Lista as pastas do utilizador (para o modal de cores do grafo). */
export async function listarPastasAction(): Promise<Pasta[]> {
    return listarPastas();
}

/** Define a cor (hex) de uma pasta. */
export async function definirCorPastaAction(folderId: string, cor: string | null): Promise<void> {
    await definirCorPasta(folderId, cor);
}

/** Define a cor (hex) do grupo daily. */
export async function definirCorDailyAction(cor: string | null): Promise<void> {
    await definirCorDaily(cor);
}

/** Cor atual do grupo daily (ou null). */
export async function corDailyAction(): Promise<string | null> {
    return corDaily();
}
```

- [ ] **Step 2: Verificar e commitar**

Run: `npm run verify`
Expected: verde.

```bash
git add src/modules/workspace/workspace.actions.ts
git commit -m "feat(cores): actions definirCorPasta/Daily + listarPastas + corDaily"
```

---

## FASE E — Modal de config no grafo

### Task E1: Componente `GrafoConfig`

**Files:**
- Create: `src/components/layout/grafo-config.tsx`

- [ ] **Step 1: Criar o modal**

Criar `src/components/layout/grafo-config.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PALETA } from '@/lib/cores';
import {
    listarPastasAction,
    definirCorPastaAction,
    definirCorDailyAction,
    corDailyAction,
} from '@/modules/workspace/workspace.actions';
import type { Pasta } from '@/modules/folders/folders.service';

// Linha de paleta: as cores + um "limpar" (default). Marca a cor ativa.
function LinhaPaleta({
    cor,
    onEscolher,
}: {
    cor: string | null;
    onEscolher: (hex: string | null) => void;
}) {
    return (
        <div className="flex items-center gap-1">
            {PALETA.map((c) => (
                <Button
                    key={c.hex}
                    type="button"
                    variant="ghost"
                    size="icon"
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => onEscolher(c.hex)}
                    className="h-5 w-5 rounded-full p-0"
                    style={{ backgroundColor: c.hex }}
                >
                    {cor === c.hex && <Check className="h-3 w-3 text-white" />}
                </Button>
            ))}
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEscolher(null)}
                className="h-5 px-1 text-[0.65rem] text-muted-foreground"
            >
                limpar
            </Button>
        </div>
    );
}

export function GrafoConfig({ onFechar }: { onFechar: () => void }) {
    const router = useRouter();
    const [pastas, setPastas] = useState<Pasta[]>([]);
    const [corDaily, setCorDaily] = useState<string | null>(null);

    useEffect(() => {
        void Promise.all([listarPastasAction(), corDailyAction()]).then(([ps, cd]) => {
            setPastas(ps);
            setCorDaily(cd);
        });
    }, []);

    async function escolherPasta(folderId: string, hex: string | null) {
        setPastas((prev) => prev.map((p) => (p.id === folderId ? { ...p, color: hex } : p)));
        await definirCorPastaAction(folderId, hex);
        router.refresh();
    }

    async function escolherDaily(hex: string | null) {
        setCorDaily(hex);
        await definirCorDailyAction(hex);
        router.refresh();
    }

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-3">
            <div className="max-h-full w-full max-w-xs overflow-y-auto rounded-md border bg-popover p-3 shadow-md">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Cores do grafo
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onFechar}
                        title="Fechar"
                        aria-label="Fechar"
                        className="h-5 w-5 text-muted-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>

                <div className="space-y-2">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-foreground">Daily Notes</span>
                        <LinhaPaleta cor={corDaily} onEscolher={(hex) => void escolherDaily(hex)} />
                    </div>
                    {pastas.map((p) => (
                        <div key={p.id} className="flex flex-col gap-1">
                            <span className="truncate text-xs text-foreground" title={p.name}>
                                {p.name}
                            </span>
                            <LinhaPaleta
                                cor={p.color}
                                onEscolher={(hex) => void escolherPasta(p.id, hex)}
                            />
                        </div>
                    ))}
                    {pastas.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                            Sem pastas. Cria pastas no explorer para lhes dar cor.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verificar (typecheck/lint)**

Run: `npm run typecheck && npx eslint src/components/layout/grafo-config.tsx`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/grafo-config.tsx
git commit -m "feat(cores): modal GrafoConfig (paleta por pasta + daily)"
```

### Task E2: Ligar o modal ao grafo

**Files:**
- Modify: `src/components/layout/workspace-graph.tsx`

- [ ] **Step 1: Ícone Palette + estado do modal**

Em `workspace-graph.tsx`:

1. Imports:

```ts
import { Play, Palette } from 'lucide-react';
import { GrafoConfig } from '@/components/layout/grafo-config';
```

2. Estado (junto aos outros `useState`):

```ts
    const [config, setConfig] = useState(false);
```

3. Na barra de controlos, ao lado do botão animate (dentro do mesmo container à direita), acrescentar antes do botão Play:

```tsx
                <Button
                    variant="ghost"
                    size="icon"
                    title="Cores do grafo"
                    aria-label="Cores do grafo"
                    onClick={() => setConfig(true)}
                    className="h-5 w-5 text-muted-foreground"
                >
                    <Palette className="h-3 w-3" />
                </Button>
```

(Para os dois botões à direita ficarem juntos, envolve-os num `<div className="flex items-center gap-0.5">…</div>` se ainda não estiverem.)

4. No `return`, dentro do `<div className="flex h-full w-full flex-col overflow-hidden">` (que precisa de `relative` para o overlay ancorar), acrescentar no fim, antes de fechar esse div:

```tsx
            {config && <GrafoConfig onFechar={() => setConfig(false)} />}
```

E mudar a classe do container raiz para incluir `relative`:

```tsx
        <div className="relative flex h-full w-full flex-col overflow-hidden">
```

- [ ] **Step 2: Verificar e construir**

Run: `npm run verify && npm run build`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/workspace-graph.tsx
git commit -m "feat(cores): ícone de cores no grafo abre o modal de config"
```

---

## FASE F — Cor da pasta no explorer

### Task F1: Bolinha de cor no `FolderNode`

**Files:**
- Modify: `src/components/layout/file-explorer.tsx`

- [ ] **Step 1: Pintar o ícone da pasta com `no.pasta.color`**

Em `file-explorer.tsx`, no `FolderNode`, o ícone `<Folder ... />` (dentro do `<Button>` da pasta) passa a refletir a cor: quando há `no.pasta.color`, mostra uma bolinha cheia dessa cor; senão o ícone `Folder` neutro. Substituir a linha do `<Folder ... />` por:

```tsx
                    {no.pasta.color ? (
                        <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: no.pasta.color }}
                            aria-hidden
                        />
                    ) : (
                        <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
```

- [ ] **Step 2: Verificar e construir**

Run: `npm run verify && npm run build`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/file-explorer.tsx
git commit -m "feat(cores): pasta mostra a sua cor no explorer (bolinha)"
```

---

## FASE G — Prova headless + docs

### Task G1: Headless `cores`

**Files:**
- Create: `scripts/cores.ts`
- Modify: `package.json`

- [ ] **Step 1: Escrever o headless**

Criar `scripts/cores.ts` (modelo: `scripts/folders-ops.ts`):

```ts
import { createClient } from '@supabase/supabase-js';

import {
    escreverNotaCom,
    moverNotaCom,
    grafoDadosCom,
} from '../src/modules/knowledge/knowledge.service';
import { criarPastaCom, definirCorPastaCom } from '../src/modules/folders/folders.service';
import { substituirDailyCom, definirCorDailyCom } from '../src/modules/daily/daily.service';
import { slugify } from '../src/modules/knowledge/knowledge.links';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function main(): Promise<void> {
    const admin = getSupabaseAdmin();
    const c = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
    });
    if (c.error && !c.error.message.includes('already been registered'))
        throw new Error(c.error.message);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const si = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (si.error) throw new Error(si.error.message);

    const COR = '#3b82f6';
    const COR_D = '#ef4444';

    // Pasta com cor + nota nessa pasta.
    const pasta = await criarPastaCom(db, `Cores FP ${Date.now() % 100000}`);
    await definirCorPastaCom(db, pasta.id, COR);
    const titulo = `Nota Cores FP ${Date.now() % 100000}`;
    const slug = slugify(titulo);
    const nota = await escreverNotaCom(db, {
        title: titulo,
        content_md: `# ${titulo}`,
        links: [],
        reason: 'p',
    });
    await moverNotaCom(db, slug, pasta.id);

    // Daily com [[link]] para a nota + cor de daily.
    await definirCorDailyCom(db, COR_D);
    const dia = '2099-01-01';
    await substituirDailyCom(db, dia, `# ${dia}\n\nver [[${titulo}]]`, 'user');

    const grafo = await grafoDadosCom(db);
    const noNota = grafo.nodes.find((n) => n.id === nota.id);
    const noDaily = grafo.nodes.find((n) => n.group === 'daily' && n.slug === dia);

    const eixo1 = noNota?.color === COR;
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — nó knowledge tem a cor da pasta (${noNota?.color})`);

    const eixo2 = !!noDaily && noDaily.color === COR_D;
    console.log(`${eixo2 ? '✅' : '❌'} eixo 2 — nó daily presente com a cor daily (${noDaily?.color})`);

    const eixo3 =
        !!noNota &&
        !!noDaily &&
        grafo.links.some((l) => l.source === noDaily.id && l.target === noNota.id);
    console.log(`${eixo3 ? '✅' : '❌'} eixo 3 — aresta daily → nota (edge de daily criada)`);

    const ok = eixo1 && eixo2 && eixo3;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
```

- [ ] **Step 2: Adicionar o script ao `package.json`**

Junto aos `folders-*`/`arquivo`:

```json
"cores": "tsx scripts/cores.ts",
```

- [ ] **Step 3: Correr a prova**

Run: `npm run cores`
Expected: `PROVA VERDE` (eixos 1-3 ✅).

- [ ] **Step 4: Commit**

```bash
git add scripts/cores.ts package.json
git commit -m "test(cores): headless — cor da pasta no nó + daily ligado e colorido"
```

### Task G2: Docs + verificação final

**Files:**
- Modify: `docs/FOLDERS.md`

- [ ] **Step 1: Documentar**

Acrescentar a `docs/FOLDERS.md` uma secção "Cores (pasta + grafo)":
- Paleta `src/lib/cores.ts` (hex); pasta → `folders.color`, daily → `profiles.daily_color`; sem herança; default cinza.
- Edges de daily via `regenerarEdgesCom` (partilhado com knowledge); limite daily→daily pendente.
- `grafoDadosCom` une knowledge+daily com cor; grafo pinta por `nodeColor`; clicar num daily abre o daily.
- Modal `GrafoConfig` (ícone Palette no grafo); cor da pasta no explorer (bolinha).

- [ ] **Step 2: Verificação final**

Run: `npm run verify && npm run build`
Expected: ambos verdes.
Run: `npm run cores && npm run grafo-data && npm run author-update`
Expected: todos `PROVA VERDE`.

- [ ] **Step 3: Commit**

```bash
git add docs/FOLDERS.md
git commit -m "docs(cores): cores de pasta + dailies no grafo"
```

- [ ] **Step 4: Smoke manual**

Com `npm run dev`: no grafo, ícone Palette → modal; dar cor a uma pasta → os nós das suas notas mudam de cor; dar cor ao Daily → as bolas de daily mudam; a pasta mostra a bolinha no explorer; clicar num nó de daily abre o daily. Registar o resultado.

---

## Self-Review (preenchido)

**Spec coverage:**
- Paleta fixa (hex) → A2. ✓
- `profiles.daily_color` → A1. ✓
- Edges de daily + helper DRY → B1 (helper + escreverNota) + B2 (daily). ✓
- grafoDados knowledge+daily com cor → C1; grafo nodeColor + abrir daily → C2. ✓
- Actions cor (pasta/daily) → D1/D2. ✓
- Modal de config → E1/E2. ✓
- Cor da pasta no explorer → F1. ✓
- Sem herança (cor da pasta direta, default senão) → C1 (`folder_id → corPorPasta`, senão `COR_DEFAULT`). ✓
- Limite daily→daily pendente → B1 (resolve em knowledge; senão to_id null, omitido em C1 por `idsValidos`). ✓
- Provas → G1 (headless) + G2 (verify/build/headless/smoke). ✓

**Placeholder scan:** sem TBD/TODO; todos os passos com código e comandos.

**Type consistency:** `regenerarEdgesCom`/`RegenerarEdgesInput`, `GrafoNode.color`, `definirCorPasta(Com)`, `definirCorDaily(Com)`/`corDaily(Com)`, `listarPastasAction`/`corDailyAction`, `resolverCor`/`PALETA`/`COR_DEFAULT`/`COR_DAILY_DEFAULT`, `GrafoConfig` — nomes estáveis entre tarefas.

## Links
[[mem-vector]] · spec: `docs/superpowers/specs/2026-06-06-cores-pasta-grafo-design.md` · `docs/FOLDERS.md`
