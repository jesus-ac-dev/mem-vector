# CLAUDE.md — mem-vector (guia operacional)

> Lido pelo Claude Code em cada sessão. Compacto por desenho. **Codename de trabalho:** `mem-vector` (a marca decide-se ao lançar).

O **núcleo SaaS do MythosEngine**: o humano fala, os **agentes são os autores** (escrevem tasks, conhecimento, docs). O valor é a **acumulação de contexto** que cresce com o uso (o fosso). Planeamento e análise vivem no vault `mythos-engine` (`projects/mem-vector/`); o código vive aqui. "Cada macaco no seu galho."

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 (strict) · Supabase (Auth + Postgres + **pgvector** + Storage) · **Tailwind v3 + shadcn/ui** · Zod 4 · React Hook Form 7 · Lucide. Tremor entra na fase de métricas.

## Divergência deliberada vs crmcredito

O `~/src/crmcredito` é a referência da casa (clean architecture, PT-PT, RHF+Zod, Supabase, skills/hooks). **MAS:** o crmcredito **proíbe Tailwind** (usa styled-jsx). O `mem-vector` **adota Tailwind + shadcn/ui + tremor** — foi decisão de produto. Não importar a regra anti-Tailwind nem os padrões styled-jsx do crmcredito. Herdar a arquitetura e as convenções; **não** a casca visual.

## Comandos

```bash
npm run dev          # Dev server (porta 2500)
npm run build        # Build de produção
npm run lint         # ESLint
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
- **Arquitetura por FEATURE** (ver `.claude/skills/arquitetura-por-feature.md`): cada feature numa pasta `src/modules/<feature>/` (`schema` + `service` + `actions` [+ `hooks`]). 3 conceitos: `ecrã → action (valida Zod) → serviço (dados+regras) → DB`. **Não** se organiza por tipo (sem pastas globais `domain/`, `use-cases/`, `repositories/`). Crescer = rebentar o serviço **dentro** do módulo, só quando dói. Partilhado vive em `src/lib` e `src/components/ui`.
- **Tipos:** DTOs e server actions são `interface` nomeadas — nunca `Record<string, any>`, nunca `any` em mapeamentos, nunca `as unknown as`.
- **Pontas soltas resolvem-se na mesma sessão.** Legado/duplicação/refactor adjacente exposto por uma tarefa → fazer no mesmo branch, não criar TODOs.
- **TDD:** RED → GREEN → REFACTOR para features e bugfixes.

## Lições que viraram regra (2026-06-12, #60 — pagas caro, não repetir)

- **Config respeitada de ponta a ponta.** Uma opção configurável só está "feita"
  quando um teste prova o caminho completo **gravar → ler → runtime** (o
  consumidor a honrá-la). UI a mostrar a opção não conta. (O `modo` cli|api
  viveu 6 rondas na UI sem o factory o ler.)
- **Um escritor por estado.** Cada pedaço de estado tem UM caminho de escrita.
  Proibido: escritores laterais (ex.: persistir descobertas durante um teste) e
  modais/forms a regravar estado que não editaram — updates cirúrgicos, só os
  campos editados viajam. (Um write lateral criou meia-config fantasma
  `modo: cli` sem key; o chat foi lê-la.)
- **Verificar antes de afirmar.** "Não existe / não suporta / não é possível"
  sobre ferramenta externa exige verificação no binário (`--help`) ou nas
  docs/SDK oficiais, **citada no comentário do código**. (3 reincidências:
  `codex debug models`, gemini CLI, `xhigh` na API da OpenAI.)
- **Causa só com evidência.** Diagnóstico parte de BD/API/git reais ("a linha
  na BD diz..."), nunca de "o que explicaria isto".
- **Garantia, não dado.** Quando o utilizador escolhe X, a resposta tem de
  PROVAR que X foi honrado (metadata do provider, nunca auto-relato) — e
  divergência dita alto na UI.
- **Inputs de segredos:** `autoComplete="new-password"` sempre — o autofill do
  browser preenche `type=password` e parece config feita sem o ser.

## Base de Dados (Supabase)

- **Híbrido numa só DB:** relacional (espinha + UX) + **pgvector** (a PESQUISA/RAG corre só na layer vetorial).
- **Split pessoal/comum via RLS** (não tabelas separadas): pessoal (`owner_id = auth.uid()`) vs comum (org). É o diferenciador — ver o esquema no vault.
- **Esquema tipado** (tabelas por natureza + tabela `edges` para o grafo). PK `BIGINT GENERATED ALWAYS AS IDENTITY`; `uuid` para exposição em URLs. RLS sempre ativo em tabelas multi-tenant.
- Fonte de verdade do schema em `supabase/` (migrations + seed) — a definir na fase RAG+Chat.

## Estrutura de pastas

```text
src/
├── app/            # Rotas (App Router). Páginas finas que importam dos módulos.
├── modules/        # Uma pasta por FEATURE — schema + service + actions [+ hooks]
│   └── tarefas/    # exemplo vivo
├── components/ui/  # Componentes shadcn partilhados
├── lib/            # Utilitários + (futuro) cliente Supabase
└── tests/          # Setup de testes
```

Detalhe e regra de "quando crescer": `.claude/skills/arquitetura-por-feature.md`.

## Ordem de construção (do vault: agentic-os-brief §8c)

0. **Scaffold** (este) → 1. **RAG + Chat** (o motor) → 2. tasks → daily → projects → glossário → 3. Kanban → 4. Grafo (último) → 5. Módulos.

## Planeamento (vault)

Decisões, glossário e esquema de dados vivem no vault `mythos-engine`: `projects/mem-vector/mem-vector.md` (hub), `projects/agentic-kanban/agentic-os-brief.md` (a imagem inteira), `references/glossary.md`, `decisions/log.md`.
