# File Explorer F4 (`[[` autocomplete) + F5 (arquivar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as 5 funcionalidades do file explorer do mem-vector: autocomplete de `[[wikilinks]]` no editor (cross-type: knowledge + daily) e arquivar notas (sair da memória ativa, com vista de arquivados e repor).

**Architecture:** Lógica pura testável em módulos isolados (resolução de href por heurística de data; deteção do gatilho `[[` e filtro de notas), consumida por um componente de editor focado (`nota-editor.tsx`). Arquivar é uma flag `knowledge.archived` que filtra o explorer/dropdown e apaga os chunks (sai do RAG); repor reindexa. Branch `feat/folders` (PR #17), empilhado em F0–F3.

**Tech Stack:** Next.js (App Router, server actions), Supabase (Postgres + RLS), Zod, vitest, scripts headless com `tsx`.

---

## Notas de contexto (ler antes de começar)

- O editor atual é um `<Textarea>` controlado em `src/components/layout/file-pane.tsx` (vista `editor`, ~linhas 336-363), com estado `rascunho`/`setRascunho`.
- Wikilinks resolvem por `slugify`; `preprocessWikilinks` em `src/components/ui/markdown.tsx:12-17` manda **sempre** para `/knowledge/<slug>`.
- O explorer carrega via `listarKnowledge` em `src/app/(app)/layout.tsx:31`; a árvore renderiza em `src/components/layout/file-explorer.tsx`; o header (botões Nova nota / Nova pasta / **Archive placeholder**) está em `src/components/layout/workspace-shell.tsx:179-241`; o `FileExplorer` é renderizado na linha 246.
- O RAG/indexação usa `reindexEntity` (`src/lib/indexing.ts:97`); os chunks de uma nota têm `metadata->>entity_id = <nota.id>`.
- Testes: vitest puro (ver `src/modules/folders/folders.tree.test.ts`). Headless: `tsx` sob sessão RLS do utilizador (ver `scripts/folders-ops.ts`). Sem React Testing Library — componentes provam-se por smoke manual.
- Verificação: `npm run verify` (format:check + lint + typecheck + test:run). Um teste só: `npx vitest run <path>`.
- A BD local tem de estar a correr: `npm run db:status` (se não, `npm run db:up`).

## File Structure

**F4 — autocomplete:**
- Modificar `src/modules/knowledge/knowledge.links.ts` — + `alvoParaHref` (puro, heurística de data).
- Modificar `src/modules/knowledge/knowledge.links.test.ts` — testes de `alvoParaHref`.
- Modificar `src/components/ui/markdown.tsx` — `preprocessWikilinks` usa `alvoParaHref`.
- Criar `src/modules/workspace/wikilink-autocomplete.ts` — `NotaLinkavel`, `detetarGatilho`, `filtrarNotasParaLink` (puros).
- Criar `src/modules/workspace/wikilink-autocomplete.test.ts` — testes.
- Modificar `src/modules/workspace/workspace.actions.ts` — + `listarNotasLinkaveis`, `criarNotaComTitulo`.
- Criar `src/components/layout/nota-editor.tsx` — `<Textarea>` + dropdown de autocomplete.
- Modificar `src/components/layout/file-pane.tsx` — usar `<NotaEditor>` em vez do `<Textarea>` direto.

**F5 — arquivar:**
- Criar `supabase/migrations/20260606170000_knowledge_archived.sql`.
- Modificar `src/modules/knowledge/knowledge.service.ts` — filtro em `listarKnowledgeCom`; + `arquivarNotaCom/arquivarNota`, `reporNotaCom/reporNota`, `listarArquivadosCom/listarArquivados`.
- Modificar `src/modules/workspace/workspace.actions.ts` — + `arquivarNotaAction`, `reporNotaAction`, `listarArquivadosAction`.
- Modificar `src/components/layout/file-pane.tsx` — ligar o botão Arquivar (~linha 250).
- Criar `src/components/layout/arquivados-lista.tsx` — lista de arquivados com Repor.
- Modificar `src/components/layout/workspace-shell.tsx` — toggle no header (botão Archive ~linha 203) + estado + render condicional.
- Criar `scripts/arquivo.ts` + entrada `arquivo` em `package.json`.
- Modificar `docs/FOLDERS.md`.

---

# FATIA A — F4 `[[` autocomplete

### Task A1: Resolução de href por heurística de data

**Files:**
- Modify: `src/modules/knowledge/knowledge.links.ts`
- Test: `src/modules/knowledge/knowledge.links.test.ts`
- Modify: `src/components/ui/markdown.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao fim de `src/modules/knowledge/knowledge.links.test.ts` (e importar `alvoParaHref` na primeira linha do import existente):

```ts
describe('alvoParaHref', () => {
    it('alvo com cara de data aponta para o daily desse dia', () => {
        expect(alvoParaHref('2026-06-06')).toBe('/daily/2026-06-06');
    });
    it('alvo normal aponta para a nota knowledge (por slug)', () => {
        expect(alvoParaHref('Cães do Carlos')).toBe('/knowledge/caes-do-carlos');
    });
    it('ignora espaços à volta', () => {
        expect(alvoParaHref('  2026-01-02  ')).toBe('/daily/2026-01-02');
    });
});
```

Atualizar a linha de import do teste:

```ts
import { alvoParaHref, parseWikilinks, reescreverWikilinks, slugify } from './knowledge.links';
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/modules/knowledge/knowledge.links.test.ts`
Expected: FAIL (`alvoParaHref is not a function` / não exportado).

- [ ] **Step 3: Implementar `alvoParaHref`**

Acrescentar a `src/modules/knowledge/knowledge.links.ts` (depois de `slugify`):

```ts
const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Resolve o alvo de um [[wikilink]] para um href interno. Alvos com cara de data
// (YYYY-MM-DD) apontam para o daily desse dia; o resto para uma nota knowledge.
export function alvoParaHref(target: string): string {
    const t = target.trim();
    if (PADRAO_DATA.test(t)) return `/daily/${t}`;
    return `/knowledge/${slugify(t)}`;
}
```

- [ ] **Step 4: Correr o teste para confirmar que passa**

Run: `npx vitest run src/modules/knowledge/knowledge.links.test.ts`
Expected: PASS (todos, incluindo os pré-existentes).

- [ ] **Step 5: Usar `alvoParaHref` no markdown**

Em `src/components/ui/markdown.tsx`, trocar o import e o corpo de `preprocessWikilinks`:

```ts
import { alvoParaHref } from '@/modules/knowledge/knowledge.links';
```

(remover o import de `slugify` se deixar de ser usado)

```ts
function preprocessWikilinks(content: string): string {
    return content.replace(/\[\[([^\]|]+)\]\]/g, (_match, target: string) => {
        return `[${target.trim()}](${alvoParaHref(target)})`;
    });
}
```

- [ ] **Step 6: Verificar e commitar**

Run: `npm run verify`
Expected: tudo verde.

```bash
git add src/modules/knowledge/knowledge.links.ts src/modules/knowledge/knowledge.links.test.ts src/components/ui/markdown.tsx
git commit -m "feat(folders): F4 — resolvedor de wikilinks cross-type (data → /daily/)"
```

---

### Task A2: Deteção do gatilho `[[` e filtro de notas (puros)

**Files:**
- Create: `src/modules/workspace/wikilink-autocomplete.ts`
- Test: `src/modules/workspace/wikilink-autocomplete.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/modules/workspace/wikilink-autocomplete.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    detetarGatilho,
    filtrarNotasParaLink,
    type NotaLinkavel,
} from './wikilink-autocomplete';

describe('detetarGatilho', () => {
    it('sem [[ não há gatilho', () => {
        expect(detetarGatilho('texto normal', 5)).toBeNull();
    });
    it('[[ aberto devolve o termo até ao cursor', () => {
        const t = 'ver [[Cães';
        expect(detetarGatilho(t, t.length)).toEqual({ termo: 'Cães', inicio: 6 });
    });
    it('[[ já fechado antes do cursor não é gatilho', () => {
        const t = 'ver [[Cães]] e mais';
        expect(detetarGatilho(t, t.length)).toBeNull();
    });
    it('quebra de linha entre [[ e o cursor cancela o gatilho', () => {
        const t = 'ver [[\nCães';
        expect(detetarGatilho(t, t.length)).toBeNull();
    });
    it('usa o [[ mais próximo à esquerda do cursor', () => {
        const t = 'a [[x]] b [[Em';
        expect(detetarGatilho(t, t.length)).toEqual({ termo: 'Em', inicio: 12 });
    });
});

describe('filtrarNotasParaLink', () => {
    const notas: NotaLinkavel[] = [
        { tipo: 'daily', titulo: '2026-06-06', chave: '2026-06-06' },
        { tipo: 'knowledge', titulo: 'Cães do Carlos', chave: 'caes-do-carlos' },
        { tipo: 'knowledge', titulo: 'Embeddings', chave: 'embeddings' },
    ];
    it('filtra por substring case-insensitive', () => {
        expect(filtrarNotasParaLink(notas, 'cães').map((n) => n.chave)).toEqual(['caes-do-carlos']);
    });
    it('knowledge aparece antes de daily', () => {
        expect(filtrarNotasParaLink(notas, '2026').map((n) => n.tipo)).toEqual(['daily']);
        const todos = filtrarNotasParaLink(notas, '');
        expect(todos[0].tipo).toBe('knowledge');
        expect(todos[todos.length - 1].tipo).toBe('daily');
    });
    it('termo vazio devolve tudo, respeitando o limite', () => {
        expect(filtrarNotasParaLink(notas, '', 2)).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/modules/workspace/wikilink-autocomplete.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o módulo**

Criar `src/modules/workspace/wikilink-autocomplete.ts`:

```ts
export interface NotaLinkavel {
    tipo: 'knowledge' | 'daily';
    titulo: string; // texto mostrado e inserido entre [[ ]]
    chave: string; // slug (knowledge) ou dia (daily)
}

export interface GatilhoLink {
    termo: string; // texto já escrito a seguir ao [[
    inicio: number; // índice do primeiro caractere depois do [[
}

// Deteta se o cursor está dentro de um [[ aberto (sem ]] nem quebra de linha até
// ao cursor) e devolve o termo escrito. Devolve null se não há gatilho ativo.
export function detetarGatilho(texto: string, cursor: number): GatilhoLink | null {
    const antes = texto.slice(0, cursor);
    const abre = antes.lastIndexOf('[[');
    if (abre === -1) return null;
    const depois = antes.slice(abre + 2);
    if (depois.includes(']]') || depois.includes('\n')) return null;
    return { termo: depois, inicio: abre + 2 };
}

// Filtra as notas linkáveis pelo termo (substring, case-insensitive), com as
// knowledge antes das daily, limitado a `limite`.
export function filtrarNotasParaLink(
    notas: NotaLinkavel[],
    termo: string,
    limite = 8,
): NotaLinkavel[] {
    const t = termo.trim().toLowerCase();
    const corresponde = t ? notas.filter((n) => n.titulo.toLowerCase().includes(t)) : notas;
    const ordenadas = [...corresponde].sort((a, b) =>
        a.tipo === b.tipo ? 0 : a.tipo === 'knowledge' ? -1 : 1,
    );
    return ordenadas.slice(0, limite);
}
```

- [ ] **Step 4: Correr o teste para confirmar que passa**

Run: `npx vitest run src/modules/workspace/wikilink-autocomplete.test.ts`
Expected: PASS.

- [ ] **Step 5: Commitar**

```bash
git add src/modules/workspace/wikilink-autocomplete.ts src/modules/workspace/wikilink-autocomplete.test.ts
git commit -m "feat(folders): F4 — deteção do gatilho [[ + filtro de notas (puro, TDD)"
```

---

### Task A3: Actions — listar notas linkáveis e criar nota por título

**Files:**
- Modify: `src/modules/workspace/workspace.actions.ts`

- [ ] **Step 1: Acrescentar imports e as actions**

No topo de `src/modules/workspace/workspace.actions.ts`, juntar aos imports de daily e adicionar o tipo:

```ts
import { getDaily, substituirDaily, listarVersoesDaily, listarDailies } from '@/modules/daily/daily.service';
import type { NotaLinkavel } from '@/modules/workspace/wikilink-autocomplete';
```

No fim do ficheiro:

```ts
/**
 * Notas linkáveis por [[ ]]: knowledge (já filtra arquivadas via listarKnowledge)
 * + dailies. Fonte única do autocomplete; tipos futuros entram aqui.
 */
export async function listarNotasLinkaveis(): Promise<NotaLinkavel[]> {
    const [notas, dailies] = await Promise.all([listarKnowledge(), listarDailies()]);
    return [
        ...notas.map((n) => ({ tipo: 'knowledge' as const, titulo: n.title, chave: n.slug })),
        ...dailies.map((d) => ({ tipo: 'daily' as const, titulo: d.dia, chave: d.dia })),
    ];
}

/**
 * Cria (ou reabre, se já existir o mesmo slug) uma nota knowledge com o título
 * dado. Usada pela opção "Criar «termo»" do autocomplete.
 */
export async function criarNotaComTitulo(titulo: string): Promise<{ chave: string; titulo: string }> {
    const res = await escreverNota(
        { title: titulo, content_md: `# ${titulo}\n\n`, links: [], reason: 'nota criada pelo [[ autocomplete' },
        'user',
    );
    return { chave: res.slug, titulo: res.title };
}
```

- [ ] **Step 2: Verificar (typecheck/lint apanham erros de import/tipo)**

Run: `npm run verify`
Expected: verde.

- [ ] **Step 3: Commitar**

```bash
git add src/modules/workspace/workspace.actions.ts
git commit -m "feat(folders): F4 — actions listarNotasLinkaveis + criarNotaComTitulo"
```

---

### Task A4: Componente `NotaEditor` com dropdown e integração no pane

**Files:**
- Create: `src/components/layout/nota-editor.tsx`
- Modify: `src/components/layout/file-pane.tsx`

- [ ] **Step 1: Criar o componente `NotaEditor`**

Criar `src/components/layout/nota-editor.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CalendarDays, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import {
    detetarGatilho,
    filtrarNotasParaLink,
    type NotaLinkavel,
} from '@/modules/workspace/wikilink-autocomplete';
import { listarNotasLinkaveis, criarNotaComTitulo } from '@/modules/workspace/workspace.actions';

interface NotaEditorProps {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}

// Editor de Markdown com autocomplete de [[wikilinks]]. A lógica de deteção e
// filtro é pura (wikilink-autocomplete); aqui fica só o estado e o teclado.
export function NotaEditor({ value, onChange, placeholder }: NotaEditorProps) {
    const router = useRouter();
    const taRef = useRef<HTMLTextAreaElement>(null);
    const [notas, setNotas] = useState<NotaLinkavel[]>([]);
    const [termo, setTermo] = useState<string | null>(null); // null = dropdown fechado
    const [sel, setSel] = useState(0);

    useEffect(() => {
        let cancelled = false;
        listarNotasLinkaveis()
            .then((ns) => {
                if (!cancelled) setNotas(ns);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const sugestoes = termo !== null ? filtrarNotasParaLink(notas, termo) : [];
    const podeCriar = termo !== null && termo.trim().length > 0;
    const totalOpcoes = sugestoes.length + (podeCriar ? 1 : 0);

    function recalcular(texto: string, cursor: number) {
        const g = detetarGatilho(texto, cursor);
        setTermo(g ? g.termo : null);
        setSel(0);
    }

    function fechar() {
        setTermo(null);
        setSel(0);
    }

    // Substitui o termo escrito (entre [[ e o cursor) por `texto]]` e repõe o cursor.
    function inserir(texto: string) {
        const ta = taRef.current;
        if (!ta) return;
        const cursor = ta.selectionStart;
        const g = detetarGatilho(value, cursor);
        if (!g) return fechar();
        const novo = value.slice(0, g.inicio) + texto + ']]' + value.slice(cursor);
        const pos = g.inicio + texto.length + 2;
        onChange(novo);
        fechar();
        requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(pos, pos);
        });
    }

    async function escolher(i: number) {
        if (i < sugestoes.length) {
            inserir(sugestoes[i].titulo);
            return;
        }
        // Última opção: criar nota nova com o termo.
        const t = (termo ?? '').trim();
        if (!t) return;
        inserir(t);
        await criarNotaComTitulo(t);
        router.refresh();
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (termo === null || totalOpcoes === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel((s) => (s + 1) % totalOpcoes);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel((s) => (s - 1 + totalOpcoes) % totalOpcoes);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            void escolher(sel);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            fechar();
        }
    }

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <Textarea
                ref={taRef}
                value={value}
                onChange={(e) => {
                    onChange(e.target.value);
                    recalcular(e.target.value, e.target.selectionStart);
                }}
                onClick={(e) => recalcular(value, e.currentTarget.selectionStart)}
                onKeyUp={(e) => {
                    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
                        recalcular(value, e.currentTarget.selectionStart);
                    }
                }}
                onKeyDown={onKeyDown}
                onBlur={() => setTimeout(fechar, 120)}
                className="min-h-0 flex-1 resize-none font-mono text-sm"
                placeholder={placeholder}
            />
            {termo !== null && totalOpcoes > 0 && (
                <ul className="absolute bottom-2 left-2 z-20 max-h-60 w-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {sugestoes.map((n, i) => {
                        const Icon = n.tipo === 'daily' ? CalendarDays : FileText;
                        return (
                            <li key={`${n.tipo}:${n.chave}`}>
                                <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => void escolher(i)}
                                    className={cn(
                                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                                        i === sel ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span className="truncate">{n.titulo}</span>
                                </button>
                            </li>
                        );
                    })}
                    {podeCriar && (
                        <li>
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void escolher(sugestoes.length)}
                                className={cn(
                                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm',
                                    sel === sugestoes.length
                                        ? 'bg-accent text-accent-foreground'
                                        : 'hover:bg-muted',
                                )}
                            >
                                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">Criar «{termo?.trim()}»</span>
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Integrar no `file-pane.tsx`**

Em `src/components/layout/file-pane.tsx`:

1. Acrescentar o import (junto aos outros de `@/components/...`):

```tsx
import { NotaEditor } from '@/components/layout/nota-editor';
```

2. Substituir o bloco do `<Textarea>` na vista editor (atualmente ~linhas 338-343) por:

```tsx
<NotaEditor
    value={rascunho}
    onChange={setRascunho}
    placeholder="Escreve em Markdown..."
/>
```

3. Remover o import de `Textarea` em `file-pane.tsx` se deixar de ser usado nesse ficheiro (o typecheck/lint avisa).

- [ ] **Step 3: Verificar e construir**

Run: `npm run verify && npm run build`
Expected: ambos verdes.

- [ ] **Step 4: Commitar**

```bash
git add src/components/layout/nota-editor.tsx src/components/layout/file-pane.tsx
git commit -m "feat(folders): F4 — editor com dropdown de [[ autocomplete (knowledge+daily, criar-novo)"
```

---

### Task A5: Smoke manual da fatia A

- [ ] **Step 1: Arrancar o dev server (se não estiver a correr)**

Run: `npm run db:status` (garantir BD up; senão `npm run db:up`)
Run: `npm run dev` (porta 2500)

- [ ] **Step 2: Smoke no browser**

Abrir `http://localhost:2500`, abrir/criar uma nota, entrar em modo edição e confirmar:
- Escrever `[[` + algumas letras abre o dropdown e filtra (knowledge primeiro, dailies a seguir).
- ↑/↓ navega, Enter insere `[[Título]]` e fecha os colchetes, cursor a seguir.
- Um daily inserido (`[[2026-…]]`) abre `/daily/...` ao clicar (não cria knowledge errado).
- "Criar «termo»" cria a nota e insere o link; a nota aparece no explorer.

Registar o resultado do smoke (para o recap). Se algo falhar, voltar à task respetiva.

---

# FATIA B — F5 arquivar

### Task B1: Migration `archived` + filtro no explorer

**Files:**
- Create: `supabase/migrations/20260606170000_knowledge_archived.sql`
- Modify: `src/modules/knowledge/knowledge.service.ts`

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260606170000_knowledge_archived.sql`:

```sql
-- F5 do file explorer: arquivar notas. Uma nota arquivada sai da memória ativa
-- (explorer, dropdown de links e RAG — os chunks são apagados ao arquivar) mas
-- mantém versões e edges (auditoria) e pode ser reposta. Só knowledge arquiva.
alter table knowledge
    add column archived boolean not null default false;

-- Índice parcial: as listagens ativas filtram por archived = false.
create index knowledge_owner_ativas on knowledge (owner_id) where archived = false;
```

- [ ] **Step 2: Aplicar a migration localmente**

Run: `npm run db:up` (aplica migrations pendentes na BD local)
Expected: aplica `20260606170000_knowledge_archived` sem erro.

- [ ] **Step 3: Filtrar arquivadas em `listarKnowledgeCom`**

Em `src/modules/knowledge/knowledge.service.ts`, na função `listarKnowledgeCom` (~linha 137), acrescentar o filtro `.eq('archived', false)`:

```ts
export async function listarKnowledgeCom(db: SupabaseClient): Promise<NotaKnowledge[]> {
    const { data, error } = await db
        .from('knowledge')
        .select('id, slug, title, content_md, updated_at, folder_id')
        .eq('archived', false)
        .order('updated_at', { ascending: false });
    if (error) throw new Error(`listar knowledge: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        contentMd: r.content_md,
        updatedAt: r.updated_at,
        folderId: r.folder_id ?? null,
    }));
}
```

- [ ] **Step 4: Verificar e commitar**

Run: `npm run verify`
Expected: verde (testes existentes não dependem da coluna).

```bash
git add supabase/migrations/20260606170000_knowledge_archived.sql src/modules/knowledge/knowledge.service.ts
git commit -m "feat(folders): F5 — coluna knowledge.archived + explorer esconde arquivadas"
```

---

### Task B2: Serviço — arquivar, repor, listar arquivados

**Files:**
- Modify: `src/modules/knowledge/knowledge.service.ts`

- [ ] **Step 1: Implementar as funções**

Acrescentar a `src/modules/knowledge/knowledge.service.ts` (junto às outras de knowledge). Reusa `reindexEntity` (já importado na linha 3) e `createClient`:

```ts
// Arquivar: tira a nota da memória ativa. Marca archived=true e apaga os chunks
// (sai do RAG). Versões e edges mantêm-se (auditoria).
export async function arquivarNotaCom(db: SupabaseClient, slug: string): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { data: nota, error } = await db
        .from('knowledge')
        .select('id')
        .eq('owner_id', user.id)
        .eq('slug', slug)
        .maybeSingle();
    if (error) throw new Error(`ler nota: ${error.message}`);
    if (!nota) throw new Error('nota não encontrada');

    const up = await db.from('knowledge').update({ archived: true }).eq('id', nota.id);
    if (up.error) throw new Error(`arquivar nota: ${up.error.message}`);

    const del = await db
        .from('chunks')
        .delete()
        .eq('owner_id', user.id)
        .eq('metadata->>entity_id', nota.id);
    if (del.error) throw new Error(`apagar chunks: ${del.error.message}`);
}
export const arquivarNota = async (slug: string) => arquivarNotaCom(await createClient(), slug);

// Repor: archived=false e reindexa (re-embeda o conteúdo, volta ao RAG).
export async function reporNotaCom(db: SupabaseClient, slug: string): Promise<void> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { data: nota, error } = await db
        .from('knowledge')
        .select('id, slug, title, content_md')
        .eq('owner_id', user.id)
        .eq('slug', slug)
        .maybeSingle();
    if (error) throw new Error(`ler nota: ${error.message}`);
    if (!nota) throw new Error('nota não encontrada');

    const up = await db.from('knowledge').update({ archived: false }).eq('id', nota.id);
    if (up.error) throw new Error(`repor nota: ${up.error.message}`);

    await reindexEntity(db, {
        ownerId: user.id,
        entityType: 'knowledge',
        entityId: nota.id,
        source: 'knowledge',
        contentMd: nota.content_md,
        metadata: { slug: nota.slug, title: nota.title },
    });
}
export const reporNota = async (slug: string) => reporNotaCom(await createClient(), slug);

// Notas arquivadas do utilizador (para a vista de arquivados do explorer).
export async function listarArquivadosCom(db: SupabaseClient): Promise<NotaKnowledge[]> {
    const { data, error } = await db
        .from('knowledge')
        .select('id, slug, title, content_md, updated_at, folder_id')
        .eq('archived', true)
        .order('updated_at', { ascending: false });
    if (error) throw new Error(`listar arquivados: ${error.message}`);
    return (data ?? []).map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        contentMd: r.content_md,
        updatedAt: r.updated_at,
        folderId: r.folder_id ?? null,
    }));
}
export const listarArquivados = async () => listarArquivadosCom(await createClient());
```

- [ ] **Step 2: Verificar**

Run: `npm run verify`
Expected: verde.

- [ ] **Step 3: Commitar**

```bash
git add src/modules/knowledge/knowledge.service.ts
git commit -m "feat(folders): F5 — service arquivar/repor (apaga/reindexa chunks) + listarArquivados"
```

---

### Task B3: Actions de arquivo

**Files:**
- Modify: `src/modules/workspace/workspace.actions.ts`

- [ ] **Step 1: Acrescentar imports e actions**

Em `src/modules/workspace/workspace.actions.ts`, juntar ao import de `knowledge.service`:

```ts
import { arquivarNota, reporNota, listarArquivados } from '@/modules/knowledge/knowledge.service';
import type { NotaKnowledge } from '@/modules/knowledge/knowledge.schema';
```

No fim do ficheiro:

```ts
/** Arquiva uma nota knowledge (sai do explorer e do RAG). */
export async function arquivarNotaAction(slug: string): Promise<void> {
    await arquivarNota(slug);
}

/** Repõe uma nota arquivada (volta ao explorer e ao RAG). */
export async function reporNotaAction(slug: string): Promise<void> {
    await reporNota(slug);
}

/** Lista as notas arquivadas (para a vista de arquivados do explorer). */
export async function listarArquivadosAction(): Promise<NotaKnowledge[]> {
    return listarArquivados();
}
```

- [ ] **Step 2: Verificar e commitar**

Run: `npm run verify`
Expected: verde.

```bash
git add src/modules/workspace/workspace.actions.ts
git commit -m "feat(folders): F5 — actions arquivar/repor/listarArquivados"
```

---

### Task B4: Botão Arquivar no file-pane

**Files:**
- Modify: `src/components/layout/file-pane.tsx`

- [ ] **Step 1: Ligar o botão Arquivar**

Em `src/components/layout/file-pane.tsx`:

1. Acrescentar o import da action:

```tsx
import { arquivarNotaAction } from '@/modules/workspace/workspace.actions';
```

2. Substituir o botão Arquivar placeholder (atualmente `onClick={() => {}}`, ~linhas 250-259) por uma versão que só aparece para knowledge e arquiva + fecha a tab + refresca:

```tsx
{ficheiro.tipo === 'knowledge' && (
    <Button
        variant="ghost"
        size="icon"
        onClick={() => {
            void arquivarNotaAction(ficheiro.chave).then(() => {
                fecharFicheiro(ficheiroAtivo);
                router.refresh();
            });
        }}
        title="Arquivar"
        aria-label="Arquivar"
        className="h-6 w-6 text-muted-foreground"
    >
        <Archive className="h-3.5 w-3.5" />
    </Button>
)}
```

Nota: `fecharFicheiro` e `ficheiroAtivo` vêm de `useWorkspace()`. `FicheiroVista` já usa `useWorkspace` para `abrirFicheiro`; acrescentar `fecharFicheiro` e `ficheiroAtivo` à desestruturação dessa chamada:

```tsx
const { abrirFicheiro, fecharFicheiro, ficheiroAtivo } = useWorkspace();
```

- [ ] **Step 2: Verificar e construir**

Run: `npm run verify && npm run build`
Expected: verde.

- [ ] **Step 3: Commitar**

```bash
git add src/components/layout/file-pane.tsx
git commit -m "feat(folders): F5 — botão Arquivar do pane arquiva e fecha a tab"
```

---

### Task B5: Toggle no header + vista de arquivados no explorer

**Files:**
- Create: `src/components/layout/arquivados-lista.tsx`
- Modify: `src/components/layout/workspace-shell.tsx`

- [ ] **Step 1: Criar a lista de arquivados**

Criar `src/components/layout/arquivados-lista.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { ArchiveRestore, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/layout/workspace-context';
import { reporNotaAction } from '@/modules/workspace/workspace.actions';
import type { NotaKnowledge } from '@/modules/knowledge/knowledge.schema';

interface ArquivadosListaProps {
    arquivados: NotaKnowledge[];
    onMudou: () => void; // recarregar a lista após repor
}

// Vista de arquivados dentro do explorer: cada nota abre numa tab e tem Repor.
export function ArquivadosLista({ arquivados, onMudou }: ArquivadosListaProps) {
    const router = useRouter();
    const { abrirFicheiro } = useWorkspace();

    if (arquivados.length === 0) {
        return <p className="px-3 py-2 text-xs text-muted-foreground">Sem notas arquivadas.</p>;
    }

    return (
        <ul className="py-1">
            {arquivados.map((n) => (
                <li key={n.id} className="group flex items-center justify-between pr-1 hover:bg-muted">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                            abrirFicheiro({ tipo: 'knowledge', chave: n.slug, titulo: n.title });
                            router.push('/chat');
                        }}
                        title={n.title}
                        className="h-auto min-w-0 flex-1 justify-start gap-2 rounded-none py-1.5 pl-3 text-sm text-foreground hover:bg-transparent"
                    >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{n.title}</span>
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Repor"
                        aria-label="Repor"
                        onClick={() => {
                            void reporNotaAction(n.slug).then(() => {
                                onMudou();
                                router.refresh();
                            });
                        }}
                        className="h-6 w-6 shrink-0 text-muted-foreground"
                    >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                    </Button>
                </li>
            ))}
        </ul>
    );
}
```

- [ ] **Step 2: Toggle + estado no `workspace-shell.tsx`**

Em `src/components/layout/workspace-shell.tsx`, dentro do componente que renderiza o header e o `FileExplorer` (o que tem `handleNovaPasta`, `activePanel`, etc.):

1. Imports: juntar `ArchiveRestore` ao import de `lucide-react` e os novos módulos:

```tsx
import { ArquivadosLista } from '@/components/layout/arquivados-lista';
import { listarArquivadosAction } from '@/modules/workspace/workspace.actions';
import type { NotaKnowledge } from '@/modules/knowledge/knowledge.schema';
```

2. Estado (junto aos outros `useState` do componente):

```tsx
const [verArquivados, setVerArquivados] = useState(false);
const [arquivados, setArquivados] = useState<NotaKnowledge[]>([]);

async function carregarArquivados() {
    setArquivados(await listarArquivadosAction());
}

function toggleArquivados() {
    setVerArquivados((v) => {
        const novo = !v;
        if (novo) void carregarArquivados();
        return novo;
    });
}
```

3. Substituir o botão Archive do header (atualmente "Arquivar selecção", `onClick={() => {}}`, ~linhas 203-212) por um toggle com estado ativo:

```tsx
<Button
    variant="ghost"
    size="icon"
    title={verArquivados ? 'Ver notas' : 'Ver arquivados'}
    aria-label="Ver arquivados"
    aria-pressed={verArquivados}
    onClick={toggleArquivados}
    className={cn(
        'h-6 w-6 text-muted-foreground',
        verArquivados && 'bg-accent text-accent-foreground',
    )}
>
    <Archive className="h-3.5 w-3.5" />
</Button>
```

(`cn` já está importado em `workspace-shell.tsx`; confirmar — se não, importar de `@/lib/utils`.)

4. No corpo do painel (onde está `<FileExplorer arvore={arvore} dailies={dailies} />`, ~linha 246), renderizar condicionalmente:

```tsx
{activePanel === 'explorer' ? (
    verArquivados ? (
        <ArquivadosLista arquivados={arquivados} onMudou={carregarArquivados} />
    ) : (
        <FileExplorer arvore={arvore} dailies={dailies} />
    )
) : (
    <ConversasPanel />
)}
```

- [ ] **Step 3: Verificar e construir**

Run: `npm run verify && npm run build`
Expected: verde.

- [ ] **Step 4: Commitar**

```bash
git add src/components/layout/arquivados-lista.tsx src/components/layout/workspace-shell.tsx
git commit -m "feat(folders): F5 — toggle no header troca a árvore pela lista de arquivados (com Repor)"
```

---

### Task B6: Prova headless do arquivo

**Files:**
- Create: `scripts/arquivo.ts`
- Modify: `package.json`

- [ ] **Step 1: Escrever o headless**

Criar `scripts/arquivo.ts` (modelo: `scripts/folders-ops.ts`):

```ts
import { createClient } from '@supabase/supabase-js';

import {
    escreverNotaCom,
    listarKnowledgeCom,
    arquivarNotaCom,
    reporNotaCom,
    listarArquivadosCom,
} from '../src/modules/knowledge/knowledge.service';
import { slugify } from '../src/modules/knowledge/knowledge.links';
import { getSupabaseAdmin } from '../src/lib/supabase-admin';

process.loadEnvFile('.env.local');

const EMAIL = 'dev@mem-vector.local';
const PASSWORD = 'dev-password-123';

async function contarChunks(db: ReturnType<typeof createClient>, entityId: string): Promise<number> {
    const { count, error } = await db
        .from('chunks')
        .select('id', { count: 'exact', head: true })
        .eq('metadata->>entity_id', entityId);
    if (error) throw new Error(error.message);
    return count ?? 0;
}

async function main(): Promise<void> {
    const admin = getSupabaseAdmin();
    const c = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
    if (c.error && !c.error.message.includes('already been registered')) throw new Error(c.error.message);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const si = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (si.error) throw new Error(si.error.message);

    const titulo = `Arquivo FP ${Date.now() % 100000}`;
    const slug = slugify(titulo);
    const nota = await escreverNotaCom(db, {
        title: titulo,
        content_md: `# ${titulo}\n\nlinha de conteúdo para gerar chunks.`,
        links: [],
        reason: 'p',
    });

    const chunksAntes = await contarChunks(db, nota.id);
    const eixo0 = chunksAntes > 0;
    console.log(`${eixo0 ? '✅' : '❌'} eixo 0 — a nota tem chunks antes de arquivar (${chunksAntes})`);

    await arquivarNotaCom(db, slug);
    const ativas = await listarKnowledgeCom(db);
    const eixo1 = !ativas.some((n) => n.slug === slug);
    console.log(`${eixo1 ? '✅' : '❌'} eixo 1 — arquivada saiu do explorer (listarKnowledge)`);

    const chunksDepois = await contarChunks(db, nota.id);
    const eixo2 = chunksDepois === 0;
    console.log(`${eixo2 ? '✅' : '❌'} eixo 2 — arquivar apagou os chunks (RAG) (${chunksDepois})`);

    const arq = await listarArquivadosCom(db);
    const eixo3 = arq.some((n) => n.slug === slug);
    console.log(`${eixo3 ? '✅' : '❌'} eixo 3 — aparece na lista de arquivados`);

    await reporNotaCom(db, slug);
    const ativas2 = await listarKnowledgeCom(db);
    const eixo4 = ativas2.some((n) => n.slug === slug);
    console.log(`${eixo4 ? '✅' : '❌'} eixo 4 — repor devolveu ao explorer`);

    const chunksRepor = await contarChunks(db, nota.id);
    const eixo5 = chunksRepor > 0;
    console.log(`${eixo5 ? '✅' : '❌'} eixo 5 — repor reindexou os chunks (RAG) (${chunksRepor})`);

    const ok = eixo0 && eixo1 && eixo2 && eixo3 && eixo4 && eixo5;
    console.log(ok ? 'PROVA VERDE' : 'PROVA VERMELHA');
    process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});
```

- [ ] **Step 2: Adicionar o script ao `package.json`**

Acrescentar à secção `scripts` (junto aos `folders-*`):

```json
"arquivo": "tsx scripts/arquivo.ts",
```

- [ ] **Step 3: Correr a prova**

Run: `npm run arquivo`
Expected: `PROVA VERDE` (eixos 0-5 todos ✅).

- [ ] **Step 4: Commitar**

```bash
git add scripts/arquivo.ts package.json
git commit -m "test(folders): F5 — prova headless do arquivo (sai/volta de explorer+RAG)"
```

---

### Task B7: Docs + verificação final da fatia

**Files:**
- Modify: `docs/FOLDERS.md`

- [ ] **Step 1: Atualizar a doc**

Acrescentar a `docs/FOLDERS.md` uma secção "F4/F5 (fatia 3)" descrevendo:
- `[[` autocomplete: fonte cross-type (`listarNotasLinkaveis`), filtro puro (`wikilink-autocomplete`), resolvedor por data (`alvoParaHref`), opção "Criar «termo»".
- Arquivar: coluna `knowledge.archived`; arquivar apaga chunks (sai do RAG), repor reindexa; `listarKnowledge`/`listarArquivados`; toggle no header troca a árvore pela lista (Repor).
- **Pendente (reconciliação no merge):** esconder do **grafo** (`grafoDadosCom`, no PR #16) precisa de `.eq('archived', false)` quando #16/#17 forem integrados.

- [ ] **Step 2: Verificação final da fatia**

Run: `npm run verify && npm run build`
Expected: ambos verdes.
Run: `npm run arquivo`
Expected: `PROVA VERDE`.

- [ ] **Step 3: Commitar**

```bash
git add docs/FOLDERS.md
git commit -m "docs(folders): F4/F5 — autocomplete e arquivo (com nota da reconciliação do grafo)"
```

- [ ] **Step 4: Smoke manual de F5**

Com `npm run dev`: arquivar uma nota pelo botão do pane (some do explorer e fecha a tab); clicar no toggle Archive do header (mostra a lista de arquivados); Repor (volta à árvore). Registar o resultado.

---

## Self-Review (preenchido)

**Spec coverage:**
- F4 fonte cross-type → Task A3 (`listarNotasLinkaveis`). ✓
- F4 deteção/filtro puros → Task A2. ✓
- F4 resolvedor por data → Task A1. ✓
- F4 dropdown + criar-novo → Task A4. ✓
- F5 migration → Task B1. ✓
- F5 arquivar=explorer+RAG → Task B1 (explorer) + B2 (chunks). ✓
- F5 grafo → documentado como pendente de merge (Task B7); não cabe neste branch. ✓
- F5 botão pane → Task B4. ✓
- F5 toggle/lista/repor → Task B5. ✓
- Provas → A5 (smoke F4), B6 (headless), B7 (smoke F5). ✓

**Placeholder scan:** sem TBD/TODO; todos os passos com código e comandos concretos.

**Type consistency:** `NotaLinkavel` (workspace) e `NotaKnowledge` (knowledge.schema) usados de forma consistente; `arquivarNotaCom/arquivarNota`, `reporNotaCom/reporNota`, `listarArquivadosCom/listarArquivados`, `listarNotasLinkaveis`, `criarNotaComTitulo`, `alvoParaHref`, `detetarGatilho`, `filtrarNotasParaLink` com nomes estáveis entre tasks.

## Links
[[mem-vector]] · spec: `docs/superpowers/specs/2026-06-06-file-explorer-f4-f5-design.md` · `docs/FOLDERS.md`
