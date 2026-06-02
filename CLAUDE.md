# CLAUDE.md — mem-vector (guia operacional)

> Lido pelo Claude Code em cada sessão. Compacto por desenho. **Codename de trabalho:** `mem-vector` (a marca decide-se ao lançar).

O **núcleo SaaS do MythosEngine**: o humano fala, os **agentes são os autores** (escrevem tasks, conhecimento, docs). O valor é a **acumulação de contexto** que cresce com o uso (o fosso). Planeamento e análise vivem no vault `mythos-engine` (`projects/mem-vector/`); o código vive aqui. "Cada macaco no seu galho."

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 (strict) · Supabase (Auth + Postgres + **pgvector** + Storage) · **Tailwind v3 + shadcn/ui** · Zod 4 · React Hook Form 7 · Lucide. Tremor entra na fase de métricas.

## Divergência deliberada vs crmcredito

O `~/src/crmcredito` é a referência da casa (clean architecture, PT-PT, RHF+Zod, Supabase, skills/hooks). **MAS:** o crmcredito **proíbe Tailwind** (usa styled-jsx). O `mem-vector` **adota Tailwind + shadcn/ui + tremor** — foi decisão de produto. Não importar a regra anti-Tailwind nem os padrões styled-jsx do crmcredito. Herdar a arquitetura e as convenções; **não** a casca visual.

## Comandos

```bash
npm run dev          # Dev server (porta 3000)
npm run build        # Build de produção
npm run lint         # ESLint (inclui boundaries de clean architecture)
npm run format       # Prettier
npm run typecheck    # tsc --noEmit
npm run test:run     # Vitest (unit)
npm run test:e2e     # Playwright (e2e)
npm run verify       # format:check + lint + typecheck + test:run
```

## Como proceder em novas iterações

Antes de alterar código, em modo `Plan`, entrevista-me: que problema resolve, o que é sucesso, o que NÃO deve fazer. Resume e confirma antes de tocar em código.

## Convenções inegociáveis

- **Idioma:** PT-PT em UI, labels, mensagens, comentários. **Nunca PT-BR.** Termos técnicos em inglês quando não há tradução aceite (`useState`, `props`).
- **Imports:** alias `@/` (`@/components/...`, `@/lib/utils`). Agrupar: React → Next.js → libs → locais → tipos → estilos.
- **UI:** **Tailwind + shadcn/ui** (`src/components/ui/`). Componentes shadcn via `npx shadcn@latest add <nome>`. Forms = **RHF + Zod** (nunca estado manual). `'use client'` só quando necessário.
- **Clean Architecture (boundaries em ESLint):** cadeia `app → hooks → actions → use-cases → repositories → domain`. Páginas consomem hooks, não actions diretamente. `domain` é puro (zero dependências externas). Apresentação (formatação PT-PT) fica na UI/hooks — repositories/use-cases devolvem dados crus.
- **Tipos:** DTOs e server actions são `interface` nomeadas — nunca `Record<string, any>`, nunca `any` em mapeamentos, nunca `as unknown as`.
- **Pontas soltas resolvem-se na mesma sessão.** Legado/duplicação/refactor adjacente exposto por uma tarefa → fazer no mesmo branch, não criar TODOs.
- **TDD:** RED → GREEN → REFACTOR para features e bugfixes.

## Base de Dados (Supabase)

- **Híbrido numa só DB:** relacional (espinha + UX) + **pgvector** (a PESQUISA/RAG corre só na layer vetorial).
- **Split pessoal/comum via RLS** (não tabelas separadas): pessoal (`owner_id = auth.uid()`) vs comum (org). É o diferenciador — ver o esquema no vault.
- **Esquema tipado** (tabelas por natureza + tabela `edges` para o grafo). PK `BIGINT GENERATED ALWAYS AS IDENTITY`; `uuid` para exposição em URLs. RLS sempre ativo em tabelas multi-tenant.
- Fonte de verdade do schema em `supabase/` (migrations + seed) — a definir na fase RAG+Chat.

## Estrutura de pastas

```text
src/
├── app/           # Pages + actions + api (App Router)
├── domain/        # Entidades, rules, ports (puro)
├── use-cases/     # Casos de uso
├── repositories/  # Acesso a dados (Supabase)
├── services/      # Serviços de infraestrutura (RAG, embeddings, email)
├── hooks/         # Ponte UI → server actions
├── components/    # UI (ui/ = shadcn)
├── schemas/       # Zod (.schema.ts)
├── context/       # React context
├── constants/     # Constantes
├── types/         # Tipos partilhados
├── lib/           # Utilitários, cliente Supabase
└── tests/         # Setup de testes
```

## Ordem de construção (do vault: agentic-os-brief §8c)

0. **Scaffold** (este) → 1. **RAG + Chat** (o motor) → 2. tasks → daily → projects → glossário → 3. Kanban → 4. Grafo (último) → 5. Módulos.

## Planeamento (vault)

Decisões, glossário e esquema de dados vivem no vault `mythos-engine`: `projects/mem-vector/mem-vector.md` (hub), `projects/agentic-kanban/agentic-os-brief.md` (a imagem inteira), `references/glossary.md`, `decisions/log.md`.
