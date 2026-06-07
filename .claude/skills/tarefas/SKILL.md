---
name: tarefas
description: Usar no repo mem-vector para gerir o tarefas.md (lista de tarefas do projeto, trabalho pendente, follow-ups de audit, conversão de TODOs, tracking de sessão). Dispara em "tarefas", "/tarefas", "o que falta fazer", "adiciona à lista", "marca como feito", ou pedidos para atualizar o ledger de tarefas deste repo.
---

# mem-vector — /tarefas

Playbook para gerir o `tarefas.md` na raiz de `~/src/mem-vector`. Gémeo Claude da skill Codex
(`.codex/skills/tarefas/SKILL.md`) — mesmo comportamento, mesmo ficheiro; manter as duas em sintonia.

## Uso

- Só dentro do repo `mem-vector`.
- Os nomes de slash-command nos títulos são aliases de gatilho, não comandos de shell.
- Resolver caminhos (`src/...`, `supabase/...`, `docs/...`) a partir da raiz do repo.
- Skill standalone: não depende de hooks, agentes ou routing do crmcredito.
- Instruções de sistema/developer de prioridade superior vêm primeiro.

## Quando usar

- No início de trabalho técnico, ler `tarefas.md` se a tarefa puder afetar pendentes.
- No fim de trabalho significativo, atualizar `tarefas.md` se tarefas mudaram, surgiram
  follow-ups, ou achados de audit mudaram.
- Quando o utilizador diz: "tarefas", "o que falta?", "adiciona à lista", "marca X como feito",
  "atualiza tarefas.md", ou similar.

## Workflow

1. Ler `tarefas.md`.
2. Interpretar a intenção:
   - mostrar estado → resumir `Em Progresso`, alta prioridade e bloqueios primeiro;
   - adicionar → pôr na prioridade certa;
   - começar → mover de `Pendentes` para `Em Progresso`;
   - concluir → mover para `Concluidas Recentemente`;
   - atualizar → reconciliar com o estado do repo e o branch atual.
3. Antes de editar, correr `git status --short`.
4. Editar só `tarefas.md` salvo pedido em contrário.
5. Atualizar `Ultima atualizacao`, branch e último commit.

## Regras do ficheiro

Manter a estrutura:

```md
# tarefas

Ultima atualizacao: YYYY-MM-DD

## Em Progresso
## Pendentes — Alta
## Pendentes — Media
## Pendentes — Baixa
## Concluidas Recentemente
## Notas
## Relatorio de Audit
```

Formato da tarefa:

```md
- [ ] **Titulo curto** — contexto necessario. Ref: `path/file.ts`.
```

Estados:

- `[ ]` pendente · `[d]` em progresso · `[?]` testing/review · `[x]` feito · `[-]` cancelado/superado.

Prioridades:

- **Alta:** perda de memória, bugs que afetam utilizadores, RLS/isolamento, dados inconsistentes, caminho bloqueante.
- **Media:** robustez, arquitetura, performance, DX, testes importantes.
- **Baixa:** polish, copy, docs locais, melhorias nice-to-have.

Limitar `Concluidas Recentemente` aos 15 itens mais recentes.

## Notas

- Não duplicar a estratégia longa do vault aqui. Ligar ou resumir.
- Se um achado também pertence ao vault MythosEngine, mencionar ao utilizador ou atualizar o
  vault quando pedido.
- Preferir referências concretas a ficheiros + comandos de validação.
