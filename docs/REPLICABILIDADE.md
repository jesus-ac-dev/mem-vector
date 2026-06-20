# Replicabilidade — o teste do PC novo

> Critério-mãe (Ponte G, #123): **"imagina um PC novo, com um CLI novo, que simplesmente instala o nosso repo."** O produto não pode herdar nada do host — nem do `~/.claude` (config global do Claude Code), nem do `~/MythosEngine/.claude` (o andaime do vault). Toda a funcionalidade está **dentro do `mem-vector`**; o que o host fornece é só o que está abaixo, e de forma explícita.

A pureza do `~/.claude` já está garantida no runner (Ponte A, #117: `--setting-sources ''` + `Skill` proibida — ver `docs/ORQUESTRADORES.md`). Este doc trata do resto: as dependências de host e a política para cada uma.

## Prerequisites (o "requirements")

Para levantar uma instância:

| Camada | Necessário | Notas |
| --- | --- | --- |
| Runtime | Node 20+ | `package.json` declara as deps JS. |
| Base de dados | Supabase (Postgres + pgvector + Storage) | Cloud (produção) ou local via Docker (dev). |
| Auth/modelo | Subscrição/key de um provider (claude/codex/gemini) | Um user novo configura em Definições > Agentes; nada herda da máquina (#40). |
| Embeddings | Modelo `e5-small` (~191M) | Vendorável; ver política abaixo. |
| YouTube (opcional) | `yt-dlp` | Só para a ingestão de vídeo; degrada com graça sem ele. |

Variáveis: ver `.env.example` (Supabase, `MEMVECTOR_KEYS_SECRET`, e as de host `MEMVECTOR_MODEL_CACHE`/`CLAUDE_BIN`/`YTDLP_BIN`).

Validação operacional:

```bash
npm run doctor
```

O `doctor` é o equivalente prático do "requirements": confirma Node/npm, `.env.local` e as variáveis obrigatórias; Docker, Supabase CLI, `gh`, Python, `yt-dlp` e CLIs dos providers aparecem como dependências recomendadas/opcionais conforme o caminho usado.

## Suposições de host e política por dependência

Política = uma de **EMBUTIR** (vendorar/pré-cachear), **DEGRADAR** (funciona sem, com aviso) ou **EXTERNALIZAR** (cloud/API por env).

| # | Suposição | Política | Estado |
| --- | --- | --- | --- |
| 1 | **Embeddings** puxados da HuggingFace em runtime (coração do RAG) | **EMBUTIR** | `MEMVECTOR_MODEL_CACHE` aponta o cache a um dir estável/vendorável (`src/lib/embeddings.ts`); falta pré-povoar no build. |
| 2 | **Supabase** local em Docker (`~/scripts/supabase-local`, `SRC_ROOT` do dono) | **EXTERNALIZAR** | URL/keys já são por env; produção = Supabase cloud. Os scripts `db:*` (dev) é que ainda dependem do wrapper local. |
| 3 | **yt-dlp** em `~/.local/bin` | **DEGRADAR** | `YTDLP_BIN` por env; sem ele a ingestão YouTube dá erro claro, o resto não cai. Em deploy (IP datacenter) → proxy/API. |
| 4 | **CLIs** dos providers (claude/codex/gemini) no PATH | **DEGRADAR** | Cada provider tem modo `api` (key) além do `cli`; o runner agentic vivo é o Claude CLI. `CLAUDE_BIN` por env. |
| 5 | `NODE_OPTIONS` herdado (tuning do laptop) | (contornado) | O subprocesso yt-dlp limpa-o (`envLimpo`, `src/modules/youtube/youtube.ts`). |
| 6 | Runner herda o `~/.claude` do host | **resolvido** | Ponte A (#117): `--setting-sources ''` + `Skill` proibida. |
| 7 | Seed **pessoal** do dono no repo | **local-only** | Ver abaixo. |

## O setup pessoal do dono nunca replica

O teste do PC novo aplica-se ao setup do **dono**, não só ao produto:

- **`seed:fresh` é o caminho canónico** — a experiência real de um user novo (só Mythos Base → onboarding). É o que um reset/instalação semeia por defeito.
- **`scripts/seed-data/kernel-pessoal.ts`** (a identidade do dono) está **`.gitignore`d** — nunca vai para outra máquina. O repo envia só o template **`kernel-pessoal.example.ts`**. O `seed:user` carrega o local se existir, senão cai no `.example`.
- **`npm run ingest`** é CLI de **operador** (bulk import do dono), não corre para um user real. A ingestão do produto vive na app (modal YouTube, #101).

## O que falta (deploy)

- Pré-povoar o cache do `e5-small` no build (vendorar o modelo) — fechar o #1.
- Dockerfile + CI; descolar os `db:*` (dev) do wrapper `~/scripts`.
- Proxy/API de transcript para o YouTube em deploy serverless.
