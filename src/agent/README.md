# agent — destilação agentic (CLI + MCP)

Caminho agentic da destilação pós-turno ([#27](https://github.com/jesus-ac-dev/mem-vector/issues/27)):
em vez de pedir um JSON one-shot ao CLI, a sessão recebe **tools MCP sobre o
kernel** e corre o loop ler-antes-de-escrever do Claude Code — com o mesmo
binário e a mesma subscrição. Liga-se com `MEMVECTOR_AGENTIC_DISTILL=1`
(A/B contra o one-shot de `chat.turno.ts`; sem fallback, para o erro ser visível).

## Peças

| Ficheiro              | Papel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract.ts`         | **Agent Contract v0** (M1): as regras do agente-autor (update-bias, prosa wiki sem proveniência, trivial sem escrita) como system prompt estável; `buildPromptAgentic` só carrega o contexto variável.                                                                                                                                                                                                                                                                                       |
| `mcp-tools.ts`        | MCP server stdio lançado pelo claude CLI: `procurar_notas`, `ler_nota`, `criar_nota`, `continuar_nota`, `acrescentar_daily`, `ler_daily_hoje`, (#85) `ler_daily` (por data — "hoje"/"ontem"/"AAAA-MM-DD"), `listar_tarefas_abertas`, `criar_tarefa`, `concluir_tarefa` e (#45) `procurar_web`, `ler_url`. Reutiliza os serviços `...Com` (RPCs transacionais + projeção de índices) sob a **sessão do utilizador** (tokens por env → RLS real, sem service role).                                                                                                                                                       |
| `resultado.ts`        | Contrato do ficheiro de resultado: as tools registam cada escrita em JSON-lines; o job reduz a `TurnoDestilado` a partir daí — nunca do texto do modelo.                                                                                                                                                                                                                                                                                                                                     |
| `kernel.ts`           | **Kernel do workspace** (#34): pasta `Kernel` na raiz com notas do utilizador (identidade, prioridades, regras) lidas em TODOS os arranques do agente — chat, destilação one-shot e sessão agentic (junta-se ao contrato no system prompt). Caps de tamanho; arquivadas fora; **só notas diretamente na pasta** (subpastas ficam de fora); sem pasta = zero mudança. Nota p/ o A/B: no one-shot o kernel entra no user-prompt, na agentic junta-se ao contrato no system — pesos diferentes. |
| `destilar-agentic.ts` | Orquestração do lado do job: tokens da sessão, mcp-config (tsx com `--tsconfig` absoluto — o CLI lança o server com cwd fora do repo), `generateAgentic`, leitura do resultado.                                                                                                                                                                                                                                                                                                              |
| `responder-tools.ts`  | (#45/#85) Orquestra a **resposta escalada** do chat (two-phase): quando o caminho rápido emite `[[ESCALAR]]`, corre uma sessão agentic com tools de **leitura do workspace** (`procurar_notas`/`ler_nota`/`ler_daily`/`ler_daily_hoje`/`listar_tarefas_abertas`) E **web** (`procurar_web`/`ler_url`). Porquê tools: o CLI não faz WebSearch/WebFetch reais em `-p` (inventa), e o RAG por semelhança falha em datas/nomes (bug #87: "o que fiz ontem?" dizia "não há" tendo a daily) — `ler_daily` por data resolve. Web em `lib/web.ts` (Tavily com key, DuckDuckGo sem). Devolve texto + `webSources` (🌐). (Era `responder-web.ts` na fatia 1.)                                          |

## Fluxo

```
job de destilação ─ MEMVECTOR_AGENTIC_DISTILL=1 ─► destilarTurnoAgenticCom
    ├─ tokens da sessão do utilizador (db.auth.getSession)
    ├─ generateAgentic (claude -p + --mcp-config + --allowedTools mcp__memvector__*)
    │     └─ CLI lança mcp-tools.ts ── tools leem/escrevem no kernel sob RLS
    │            └─ cada escrita → ficheiro de resultado (JSON-lines)
    └─ reduzirEscritas(lerEscritas(...)) → TurnoDestilado
```

## Prova

`npx tsx scripts/probes/destilar-agentic.ts` (precisa do Supabase local + claude CLI): trivial sem
escritas; facto durável cria nota+daily; facto seguinte sobre o mesmo assunto
**continua** a nota (mesmo slug, `criada=false`). Os smokes da Sofia (#19) são a
suite de aceitação; o critério de promoção da flag está na #27.
