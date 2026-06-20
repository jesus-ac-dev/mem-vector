# mem-vector

mem-vector é  uma plataforma onde agentes são autores de conhecimento, tasks e documentação. O valor acumula-se no contexto: quanto mais se usa, mais profundo e útil fica o fosso competitivo. Built com Next.js 16, React 19 e TypeScript em strict mode, apoiado por Supabase (Auth, Postgres + pgvector) e UI moderna via Tailwind + shadcn/ui. Arquitetura por feature, TDD, e convenções PT-PT — cada decisão rastreável em testes.

## Requisitos

Obrigatorio para correr a app:

| Requisito | Versao | Para que serve |
| --- | --- | --- |
| Node.js | 20+ | runtime Next.js e scripts |
| npm | incluido com Node | instalar dependencias |
| Supabase | cloud ou local | Auth, Postgres, pgvector, Storage |
| Chaves de ambiente | ver `.env.example` | ligacao Supabase e encriptacao de keys |

Recomendado para desenvolvimento completo:

| Requisito | Para que serve |
| --- | --- |
| Docker | Supabase local |
| Supabase CLI | migrations/DB local se nao usares cloud |
| GitHub CLI (`gh`) | modulo GitHub e trabalho por issues |
| Python 3 | ferramentas auxiliares e ecossistema de ingestao |
| `yt-dlp` | ingestao YouTube local |
| Claude/Codex/Gemini CLI | providers em modo CLI; a app tambem suporta modo API |

Validar a maquina:

```bash
npm run doctor
```

O `doctor` falha apenas no que bloqueia a app. As dependencias opcionais aparecem como aviso.

## Arranque rapido

```bash
git clone <repo-url> mem-vector
cd mem-vector
npm install
cp .env.example .env.local
npm run doctor
```

Preenche em `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MEMVECTOR_KEYS_SECRET=
```

Gerar segredo local:

```bash
openssl rand -hex 32
npm run dev
```

Abrir `http://localhost:2500`.

## Supabase

Tens duas opcoes:

| Caminho | Quando usar |
| --- | --- |
| Supabase cloud | mais simples para uma maquina nova |
| Supabase local via Docker | melhor para desenvolvimento isolado |

Os scripts `db:*` ainda sao auxiliares de dev local e podem depender do setup da maquina do dono. Para replicabilidade pura, usa Supabase cloud ou configura a Supabase CLI localmente e aponta `.env.local` para essa instancia.

## Seed inicial

Para testar a experiencia de um utilizador novo:

```bash
npm run seed:fresh
```

Para desenvolvimento com dados locais do operador:

```bash
npm run seed:user
```

`seed:user` pode ler `scripts/seed-data/kernel-pessoal.ts`, mas esse ficheiro e local-only e esta ignorado pelo git. O produto nao depende dele.

## Providers e isolamento

O produto nao deve herdar comportamento do host:

- Claude runner: ignora config global e proibe skills de host.
- Codex CLI: corre em tempdir, `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, sandbox read-only.
- Providers em modo API usam keys nas Definicoes/env, nao o login local do CLI.

Em modo CLI, a auth pode continuar a vir do login local do respectivo provider. Isso e apenas autenticacao; regras, skills e configuracoes pessoais nao devem definir o comportamento do produto.

## Scripts principais

| Script | O que faz |
| --- | --- |
| `npm run doctor` | valida requisitos da maquina e `.env.local` |
| `npm run dev` | dev server em `http://localhost:2500` |
| `npm run build` / `npm run start` | build / arranque de producao |
| `npm run verify` | format:check + lint + typecheck + testes |
| `npm run seed:fresh` | user limpo para onboarding |
| `npm run seed:user` | user de dev com seed local opcional |
| `npm run test:e2e` | Playwright |

## Documentacao

- `docs/REPLICABILIDADE.md` — politica de dependencia do host e teste do PC novo.
- `AGENTS.md` — regras para agentes que trabalham neste repo.
- `CLAUDE.md` — contrato operacional do projecto.

## Stack

- Next.js 16, React 19, TypeScript strict
- Supabase, Postgres, pgvector, Storage
- Tailwind v3, shadcn/ui, Zod, React Hook Form, Lucide
- Vitest, Playwright, ESLint, Prettier
