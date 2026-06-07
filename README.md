# mem-vector

> Codename de trabalho. O **núcleo SaaS do MythosEngine**: falas, os agentes escrevem (tasks, conhecimento, docs). A acumulação de contexto personalizado é o fosso.

Greenfield — sucessor da prova-de-conceito `agentic-kanban`. Zero código arrastado; o conhecimento (desenho, glossário, decisões) migra do vault `mythos-engine`.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript 5** (strict)
- **Supabase** — Auth + Postgres + **pgvector** + Storage
- **Tailwind v3 + shadcn/ui** (New York) · Zod 4 · React Hook Form 7 · Lucide
- **Qualidade:** ESLint (+ boundaries de clean architecture), Prettier, Husky + lint-staged, Vitest (unit), Playwright (e2e)

## Arranque

```bash
npm install
cp .env.example .env.local   # preencher as chaves do Supabase
npm run dev                  # http://localhost:3000
```

## Scripts

| Script | O quê |
| --- | --- |
| `npm run dev` | Dev server (porta 3000) |
| `npm run build` / `start` | Build / arranque de produção |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` / `test:run` | Vitest (watch / single) |
| `npm run test:e2e` | Playwright |
| `npm run verify` | format:check + lint + typecheck + test:run |

## Arquitetura

Clean architecture com fronteiras validadas por ESLint (`eslint-plugin-boundaries`):
`app → hooks → actions → use-cases → repositories → domain`. Ver `CLAUDE.md`.

## Estado

**Scaffold (arranque).** A seguir: RAG + Chat (o motor). Planeamento detalhado no vault `mythos-engine` → `projects/mem-vector/`.

## Forçar GIT

git push --no-verify --set-upstream origin feat/rag-chunking-hybrid
