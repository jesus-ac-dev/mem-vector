# Módulo `relay` (módulo de dev — config-driven)

O circuito que corre os **cruzamentos** do pipeline lendo o **config das definições**
(`cruzamentos`: `{principal, validador}` por cruzamento), não código hardcoded. É a versão
parametrizada do par fixo `claude↔codex` que o POC `agentic-kanban` provou.

## Fluxo

definições (`cruzamentos`) → `resolverCruzamento` (resolve quem produz/valida) →
`correrCruzamento` (round-loop: produz → valida → repete até passar ou esgotar rondas) →
`executarCruzamento` (liga aos providers reais pela factory + prompts) →
`correrPipeline` (corre os cruzamentos configurados em estrela, pára num kill switch).

## Convergência (glossário) — nunca por consenso

- **Análise** = gerativo: o validador sugere a próxima melhoria até estabilizar.
- **Dev / Docs / Auditoria** = adversarial: o validador tenta **DERRUBAR**; `parseVeredito` só
  passa com "APROVADO" explícito (default-to-refuted — o erro não escapa por ambiguidade).
- **Estrela:** os cruzamentos de execução leem o output da **Análise** (fonte de verdade), não
  a narrativa do anterior (não propaga a árvore torta).
- **Kill switch:** cruzamento não validado em N rondas → pára (`completo: false`), não finge sucesso.
  - **A DISCUTIR (Carlos):** o "volta ao humano" — como/onde o humano é chamado e o que pode fazer — ainda não está fechado. Por agora só pára.

## Ficheiros

| Ficheiro            | Responsabilidade                                                  |
| ------------------- | ----------------------------------------------------------------- |
| `relay.resolver.ts` | do config → principal/validador (`none`/`self`/`<provider>`)      |
| `relay.runner.ts`   | round-loop puro + `parseVeredito`                                 |
| `relay.executar.ts` | 1 cruzamento e2e: prompts (gerativo/adversarial) + providers reais |
| `relay.pipeline.ts` | o circuito das atividades (estrela, kill switch)                  |

A config vive nas definições (`cruzamentos`). A UI para a editar e o **trigger** (issue/goal →
pipeline) + os handoffs por comentário são os próximos passos.
