# Orquestradores e harness

> Contrato de agnosticidade do `mem-vector`: o produto pode suportar vários
> providers, mas nem todos conseguem fazer o mesmo trabalho. A regra é declarar a
> capacidade real de cada runner, não fingir paridade.

## Três superfícies diferentes

| Superfície | O que é | Estado atual | Não confundir com |
| --- | --- | --- | --- |
| **Provider de chat** | Gera a resposta imediata do chat | Agnóstico via `src/lib/providers` (`claude`, `codex`, `gemini`, `ollama`; `cli\|api`) | Agente-autor com tools |
| **Runner agentic** | Faz loop com tools MCP e escreve/lê o workspace | Claude CLI é o único runner vivo (`generateAgentic`) | Provider que só gera texto |
| **Harness de desenvolvimento** | Instruções/skills/hooks usados por Claude Code e Codex ao editar este repo | `.claude/` automático; `.codex/` explícito/local | Funcionalidade do produto |

## Regras

- **Chat provider e runner agentic são contratos separados.** Adicionar um
  provider em `src/lib/providers` permite responder ao chat; não o torna capaz
  de usar MCP tools, escrever knowledge ou fazer destilação agentic.
- **O agentic v0 é Claude CLI + MCP.** `src/agent/destilar-agentic.ts` e
  `src/agent/responder-tools.ts` dependem de `generateAgentic`, `--mcp-config`,
  `--allowedTools`, ficheiro de resultado JSONL e metadata do envelope Claude.
- **Agnóstico significa capacidade declarada.** Um runner só entra em caminhos
  agentic se provar: tool-use controlável, allowlist de tools, modelo pedido,
  modelo efetivo, timeout/kill, tokens/custo quando disponível e artefactos de
  escrita auditáveis sem confiar no auto-relato do modelo.
- **Garantia por metadata.** A UI e os testes comparam provider/modelo pedido
  com metadata técnica do adapter. Texto gerado pelo modelo nunca é prova.
- **Harness não é produto.** `.claude` e `.codex` servem os agentes de
  desenvolvimento. Mudanças nessas pastas devem ir em fatia própria e nunca
  misturadas com alterações de runtime sem necessidade.

## Matriz de capacidades

| Runner | Chat one-shot | Streaming | API | CLI | Tools MCP no produto | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Claude | Sim | Sim em CLI | Sim | Sim | **Sim, vivo** | Runner agentic atual. CLI usa subscrição; API usa key. |
| Codex | Sim | Não implementado | Sim | Sim | Não implementado | CLI usado como exec efémero, sem contrato MCP no produto. |
| Gemini | Sim | Não implementado | Sim | Sim | Não implementado | CLI/API geram texto; não assumir loop ler-antes-de-escrever. |
| Ollama | Sim | Não implementado | Não | Local daemon | Não implementado | Bom para texto local; tool-use fica para design futuro. |

## Contrato futuro `AgenticRunner`

Quando fizer sentido promover outro runner para agentic, criar uma interface de
runtime separada do `ProviderLLM`. A forma mínima deve cobrir:

```ts
interface AgenticRunner {
    nome: string;
    run(input: {
        prompt: string;
        systemPrompt: string;
        model?: string;
        allowedTools: string[];
        mcpConfig: string;
        env: Record<string, string>;
        timeoutMs: number;
        maxTurns?: number;
    }): Promise<{
        text: string;
        model?: string;
        costUsd: number | null;
        tokensIn: number | null;
        tokensCache: number | null;
        tokensOut: number | null;
    }>;
}
```

Essa interface só deve nascer quando houver segundo runner agentic real. Até lá,
`generateAgentic` continua explícito como Claude CLI para evitar abstração falsa.

## Harness `.claude` vs `.codex`

- `CLAUDE.md` é a fonte de contexto operacional do projecto.
- `AGENTS.md` traduz o mesmo projecto para execução Codex.
- `.claude/routing-map.json` é aplicado por hook `UserPromptSubmit`.
- `.codex/routing-map.json` é a mesma intenção, mas o Codex aplica localmente o
  playbook ou usa subagente quando a ferramenta existir.
- As skills vivem em formatos diferentes de propósito:
  `.claude/skills/*.md` e `.codex/skills/<nome>/SKILL.md`.

Ao alterar routing/skills, manter a intenção sincronizada e aceitar diferenças
de mecanismo. Não copiar texto cegamente entre harnesses.

## Isolamento do runner vs `~/.claude` do host (#117)

O runner agentic corre `claude -p` na subscrição do host — o **login** vive no
`~/.claude`. Mas o produto **não pode herdar o comportamento do andaime**
(CLAUDE.md, hooks, settings, skills): é o *teste do PC novo* — nada além da
própria app manda. Sem isto, parte do "bom comportamento" seria o produto ainda
apoiado no andaime de dev, e qualquer medição de prontidão era uma ilusão.

Como (`src/lib/claude.ts`, `HOST_ISOLATION`, nos 4 builders):

- **`--setting-sources ''`** → não carrega nenhuma fonte de settings
  (user/project/local) → sem CLAUDE.md, hooks nem settings do host. O login não
  é uma fonte: mantém-se.
- **`Skill` em `--disallowedTools`** → as skills dos plugins do `~/.claude`
  continuam no binário (o `--setting-sources` não as desliga, não são uma fonte
  de settings), mas ficam inertes — o modelo não as pode invocar.
- **`CLAUDE_CONFIG_DIR` próprio NÃO serve**: isolaria tudo, mas perde a auth da
  subscrição (que vive no config dir default).

Provado empiricamente: com o isolamento o agente responde `ISOLADO`; sem ele, vê
o CLAUDE.md global **e** o do projeto.
