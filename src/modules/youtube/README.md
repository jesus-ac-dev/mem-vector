# youtube (#101)

Ingestão de **vídeos do YouTube → conhecimento**. Ícone na bandeja sobre o
composer do chat → modal → cola o link → o transcript vira uma nota. É um **dump
puro** (o BRUTO); a inteligência acontece **depois**, na conversa (o motor de
destilação que já existe cria/atualiza outras notas + tarefas a partir da
discussão). Single point of entrance: tudo pela porta do chat.

## Forma

- **Nota** em `YouTube/<Autor>/<Título do vídeo>` (folders find-or-create,
  idempotente por slug — re-colar reescreve a mesma nota). Conteúdo: cabeçalho de
  metadados (título, autor, URL, data) + transcript **corrido** (sem timestamps
  por-segmento) com **âncoras `[mm:ss]` a cada ~30s** (legível, mas dá para saltar
  a um momento). Tags `youtube`/`transcript`. É uma nota normal → chunked+embedded
  → o RAG encontra-a quando falas sobre ela.
- `youtube.ts` — helpers PUROS (parse do URL, formatação, limpeza com âncoras,
  parse json3) + `buscarVideo` (fetch via yt-dlp).
- `youtube.service.ts` — `ingerirVideoCom` (folders + nota).
- `youtube.actions.ts` — server action; mapeia `YoutubeError` → mensagem amigável.
- `youtube-modal.tsx` — UI (chamada DIRETA à action; o `runClientAction` engole o
  erro e devolveria undefined, comendo as mensagens).

## Dependência: yt-dlp (subprocess)

O YouTube **bloqueia o scraping direto do `timedtext`** (200-vazio, anti-bot
2024+, provado por probe). O `yt-dlp` trata disso. Instalação (binário standalone
oficial, sem pip/sudo): `curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp && chmod +x ~/.local/bin/yt-dlp`.
Caminho configurável por `YTDLP_BIN` (default `~/.local/bin/yt-dlp`).

**Gotcha resolvido:** o yt-dlp exige um runtime JS (EJS) — reusamos o **Node** que
já corre a app (`--js-runtimes node:${process.execPath}`). MAS o `NODE_OPTIONS` da
app (tuning de memória / loader tsx) herdado **parte esse Node em silêncio** → sem
legendas. Por isso o spawn usa `envLimpo()` (apaga `NODE_OPTIONS`).

**Gotcha resolvido 2:** `--print` liga modo simulação no `yt-dlp`; é obrigatório
usar `--no-simulate`, senão ele imprime título/autor mas não grava nenhum `.json3`.

## Limitações conhecidas

- **Deploy (dívida declarada):** em Vercel (IP datacenter) o yt-dlp pode ser
  bloqueado, e o `process.execPath` da função serverless pode não servir o EJS →
  ao lançar, trocar por proxy/API de transcript. Local (1.º utilizador) funciona.
- **429 (rate-limit):** muitos pedidos seguidos → o YouTube degrada a extração
  (sem legendas, sem 429 limpo). Mensagem amigável quando detetável no stderr.
- Pede legendas manuais + auto (`--write-subs` + `--write-auto-subs`), mas ainda
  depende do que o YouTube disponibiliza ao `yt-dlp`.
- Frames/multimodal (review visual) ficam para fatia futura — transcript-first.
