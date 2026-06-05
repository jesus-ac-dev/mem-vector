# Arquitetura — mem-vector

> **mem-vector** (codename) é um workspace **agente-autor** tipo-Obsidian: o humano fala, os agentes escrevem e mantêm o conhecimento (notas, dailies, tarefas). App web Next.js + Supabase. O fosso é a acumulação de contexto personalizado.

Este é o mapa de cima. Cada módulo tem o seu próprio doc detalhado em `src/modules/<nome>/README.md`.

## A tese (o loop)

```
chat → o agente escreve estado tipado → fica pesquisável (RAG) → daily/notas refletem o trabalho
```

E a **rede de revisão**: cada escrita do agente grava uma versão → o utilizador vê o diff (o equivalente web ao `git diff`). É o que torna "o AI escreve os teus ficheiros" confiável.

## Stack

- **Next.js 16** (App Router, Server Components, server actions) — UI + porta de servidor.
- **Supabase local** — Postgres + **pgvector** (RAG) + **RLS** (isolamento) + Auth. Portas `560xx`.
- **Embeddings:** `multilingual-e5-small` local, CPU, via `@xenova/transformers` (384 dims; prefixos `passage:`/`query:`).
- **Geração:** `claude` CLI (subscrição), invocado por `@/lib/claude`.
- **Testes:** vitest (unit + integração RLS contra o Supabase local).

## Camadas

| Camada | Onde | Responsabilidade |
|---|---|---|
| **App shell / UI** | `src/app/(app)/` | Workspace de 2 colunas: **file explorer global** (`layout.tsx` + `components/layout/file-explorer.tsx`) + conteúdo (chat / ficheiro). Rotas protegidas pelo middleware. |
| **Módulos** | `src/modules/<feature>/` | Arquitetura **por feature**: `schema` (Zod) + `service` (dados+regras) + `actions` (porta servidor, valida Zod) [+ UI]. |
| **Lib partilhada** | `src/lib/` | `supabase/` (server client + middleware), `embeddings` (e5-small), `claude` (`generate`). |
| **Dados** | `supabase/migrations/` | Tabelas tipadas + genéricas + RLS + RPCs (`match_chunks`, `meus_grupos`). |

## Mapa dos módulos

| Módulo | O que faz | Doc |
|---|---|---|
| **knowledge** | O kernel de ficheiros — o agente escreve notas tipadas, versionadas, ligadas por `[[wikilinks]]`, pesquisáveis | [README](../src/modules/knowledge/README.md) |
| **daily** | Notas diárias — a destilação acumula o recap do dia | [README](../src/modules/daily/README.md) |
| **chat** | Pipeline RAG + a destilação proativa (assíncrona) que faz o agente escrever | [README](../src/modules/chat/README.md) |
| **tarefas** | Tarefas do utilizador; o exemplo vivo do padrão feature-first | [README](../src/modules/tarefas/README.md) |
| **grupos** | Grupos de pares — a base da visibilidade `protected` | [README](../src/modules/grupos/README.md) |
| **auth** | Supabase Auth — a fundação do `auth.uid()` / RLS | [README](../src/modules/auth/README.md) |

## Modelo de dados

A decisão central ([decisions/log](../../MythosEngine/decisions/log.md) 2026-06-02): **esquema TIPADO por natureza**, não uma tabela genérica. Aparência Obsidian na UI, espinha SaaS por baixo (validação forte, RLS limpo, migrations sãs).

**Tabelas tipadas (a espinha):**
- `knowledge` (notas), `dailies` (recaps por dia), `tarefas`
- `conversations` / `messages` (chat), `profiles`
- `grupos` / `grupo_membros` / `grupo_convites`

**Tabelas genéricas (infra transversal):**
- `file_versions` — trilha de auditoria (a **rede de revisão**); `entity_type` + `entity_id` → serve qualquer tipo (knowledge, daily).
- `edges` — wikilinks/grafo; liga uma linha a outra (`to_slug` resolve `to_id` quando o alvo existe).
- `chunks` — pgvector; a **pesquisa só corre aqui**. Cada chunk aponta o seu objeto via `metadata.entity_id`.

> Tipado para o domínio, genérico para a auditoria/grafo/pesquisa. Foi só no *conteúdo de domínio* que o genérico era o erro.

## RLS (segurança)

Toda a tabela de domínio segue o mesmo padrão (de `auth`):
- **privado:** `owner_id = auth.uid()`
- **protected:** `visibility = 'protected' AND group_id IN (SELECT meus_grupos())`
- **apagar:** só o dono.

`meus_grupos()` é `SECURITY DEFINER` (`search_path=''`) para quebrar a recursão de RLS. Sem sessão (auth) não há `auth.uid()` → tudo depende do módulo `auth`.

## Fluxos-chave

**Agente-autor (o coração):**
```
respond(pergunta)  → embedQuery → match_chunks → threshold(0.78) → buildPrompt → claude  → resposta JÁ
destilarTurno(...)  → (async) o CLI decide se há nota durável → escreverNota (versionada) → append ao daily → chip "📝 nota"
```
A resposta não espera pela destilação (evita dobrar a latência).

**Escrita versionada (`escreverNota`/`acrescentarAoDaily`):**
```
upsert (tipada) → file_version → re-gera chunks (pesquisa) → edges (wikilinks) → devolve diff
```

**RAG:** RAG-preferred + LLM-fallback; o threshold `0.78` é rede de segurança (o e5-small comprime os scores), não classificador.

## Estado / ordem de construção

- **Degrau 1 — RAG + Chat:** ✓
- **Degrau 2 — Kernel de ficheiros (`knowledge`):** ✓ · **`daily`:** ✓ · workspace Obsidian (explorer + diff + history) ✓
- **A seguir:** próximos tipos (`decisions`/`projects`), "a pensar" dinâmico (streaming), persistir conversas, depois kanban e grafo (último).

## Onde mais ler

- **Módulos:** os `README.md` em `src/modules/*/`.
- **docs/:** [`VISAO-PRODUTO`](VISAO-PRODUTO.md) · [`VISAO-UX`](VISAO-UX.md) · [`RAG-EMBEDDINGS`](RAG-EMBEDDINGS.md) · [`AUTH-E-SHELL`](AUTH-E-SHELL.md) · [`GRUPOS-PROTECTED`](GRUPOS-PROTECTED.md) · [`plans/`](plans/).
- **Porquê (decisões):** o vault MythosEngine `decisions/log.md` (a fonte do *porquê* de cada escolha).
