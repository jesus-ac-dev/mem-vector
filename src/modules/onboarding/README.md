# Módulo `onboarding`

> Entrevista de primeiro login que preenche o Kernel pessoal de um utilizador novo (#40).

## O que faz

O seed do Kernel tem **duas camadas**:

- **Mythos Base** (`MYTHOS_BASE_SEED` em `src/agent/kernel.ts`, genérico): o esqueleto que **todos** herdam no 1.º login via `garantirKernelCom` — **Glossário** (a língua do produto, #44) + **Voz** (registo base) + **Como trabalho** (método genérico: cada interação deixa rasto, teia sem órfãos, update-over-create) (#120).
- **Pessoal** (`KERNEL_PESSOAL` em `scripts/seed-data/`, **fora do código do produto**, #120): identidade, prioridades, regras e decisões do dono. Entra por parâmetro — `garantirKernelCom(db, userId, notasPessoais)` — que o `seed:user` carrega. Migrar o pessoal para fora do binário torna o produto multi-utilizador real e o reset deixa de arrastar uma pessoa.

Um utilizador **novo** nasce só com o Mythos Base. `precisaOnboardingCom` deteta a ausência da nota **"Sobre mim"** e o `OnboardingWizard` (chassis Dialog das Definições, em modo sequencial) abre no 1.º login: 3 perguntas — Sobre mim, Prioridades, Regras do agente — que `completarOnboarding` escreve como as notas pessoais do Kernel (author `user`).

O dono (`seed:user`) já nasce com o pessoal e **não** vê o wizard. O wizard é fechável; reabre no próximo login enquanto o pessoal não existir (deteção por notas, sem flag/migration nesta fatia).

### Caminho (a): sem defaults de provider

Um user novo **não herda a conta/subscrição da máquina**. As Definições nascem **sem provider ativo** (`agentes: {}` — quer sem row, quer com row gravada vazia), e `providerDoChatCom` (factory) **perde o fallback** `claude/cli`: sem provider ativo, lança `Configura um provider em Definições > Agentes` (o chat mostra a mensagem). Ao concluir as 3 perguntas, o wizard abre **Definições > Agentes** (`pedirDefinicoes('agentes')`) para o user criar as suas ligações. Fecha o furo "é pra todos" das credenciais (decisão do Carlos, #40).

## Ficheiros

| Ficheiro                | Responsabilidade                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| `onboarding.schema.ts`  | `OnboardingSchema` (Zod): `sobreMim`, `prioridades`, `regras` (obrigatórios) |
| `onboarding.service.ts` | `completarOnboardingCom` — escreve as 3 notas no Kernel (RLS é a guarda)      |
| `onboarding.actions.ts` | Server Action — valida com Zod, chama o serviço; devolve `true` em sucesso   |

UI: `src/components/layout/onboarding-wizard.tsx` (montado no layout `(app)`).
Deteção/seed: `precisaOnboardingCom`, `pastaKernelIdCom`, `garantirKernelCom` em `src/agent/kernel.ts`.

## Dev

- `npm run seed:user` — cria o dono (dev@) **com** o pessoal (salta o onboarding).
- `npm run seed:fresh` — cria `fresh@mem-vector.local` **sem** pessoal (cai no onboarding) para smokar o wizard.

## A fazer (fatias seguintes)

Polish (progresso visual, feedback de erro de validação), variante conversacional (agente entrevista no chat), e a separação completa dos seeds + robustez pós-reset vivem na #71.
