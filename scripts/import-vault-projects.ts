import { createClient } from '@supabase/supabase-js';

import { escreverNotaEmPastaCom } from '../src/modules/knowledge/knowledge.service';
import { resolverProjetoCom } from '../src/modules/projetos/projetos.service';
import { esperarAuthHealth } from './auth-health';

process.loadEnvFile('.env.local');

const EMAIL = process.env.MEMVECTOR_IMPORT_EMAIL ?? 'dev@mem-vector.local';
const PASSWORD = process.env.MEMVECTOR_IMPORT_PASSWORD ?? 'dev-password-123';

interface NotaImport {
    title: string;
    summary: string;
    tags: string[];
    content_md: string;
}

const MEM_VECTOR_NOTAS: NotaImport[] = [
    {
        title: 'Estado do produto',
        summary:
            'Núcleo SaaS do MythosEngine: chat, agente-autor, RAG, tasks, daily, kernel e projetos.',
        tags: ['mem-vector', 'estado', 'produto'],
        content_md: `# Estado do produto

O mem-vector é o núcleo SaaS do MythosEngine: o humano fala, o agente escreve o estado e o conhecimento cresce dentro do produto.

## Núcleo entregue

- Chat com RAG e proveniência.
- Knowledge/dailies como notas versionadas, pesquisáveis e ligadas por [[wikilink]].
- File explorer, panes, backlinks, grafo e propriedades de notas.
- Destilação pós-chat com update-bias: continuar a nota dona do assunto antes de criar outra.
- Kernel do workspace: pasta raiz que comanda identidade, prioridades, voz e regras.
- Projetos reais: cada tarefa pertence a um projeto e cada projeto é uma pasta real.
- Relay/manual dogfood: Claude e Codex já trabalharam no repo real em ciclo de autoria/revisão.

## Estado vivo confirmado

- Repo local: \`~/src/mem-vector\`.
- GitHub: \`jesus-ac-dev/mem-vector\`.
- Sem PRs abertos em 2026-06-22.
- Branch de importação/seed em curso: \`feat/seed-manual-kernel\`.

## Norte

O vault MythosEngine foi a prova de conceito. A partir daqui, o crescimento deve acontecer cada vez mais dentro do mem-vector, não por resets sucessivos da BD nem por notas externas ao produto.

Ver também [[Arquitetura e decisões]], [[Roadmap e milestones]] e [[Relay e módulo GitHub]].`,
    },
    {
        title: 'Arquitetura e decisões',
        summary:
            'Decisões estruturais: DB tipada, knowledge versionado, Kernel, projetos e importação pelo fluxo normal.',
        tags: ['mem-vector', 'arquitetura', 'decisões'],
        content_md: `# Arquitetura e decisões

## Princípios

- O produto parece um workspace Obsidian-like, mas a espinha é SaaS: tabelas tipadas, RLS, versões, jobs e embeddings.
- Estado operacional vive no relacional; pesquisa semântica vive em chunks/vetores derivados.
- Knowledge/dailies/conversas formam a memória: o destilado é rápido e limpo; o bruto fica como rede de último recurso.
- O Kernel manda no agente e é editável pelo utilizador.
- Projetos são pastas reais; o agente escreve conhecimento no projeto certo sempre que possível.

## Decisões-chave

- **Arquivo não é esquecimento:** arquivar tira do workspace ativo, mas a memória persiste e pode voltar.
- **Arquivadas fora da escrita:** nenhuma escrita deve aterrar numa nota arquivada.
- **UPDATE antes de CREATE:** crescer a nota dona do assunto antes de criar duplicados.
- **Páginas vivas:** as notas devem ser prosa integrada; a proveniência vive nas versões.
- **Estado vivo:** PRs, issues, branches e merges confirmam-se em GitHub/git, não em prosa antiga.
- **Importação normal:** importar conhecimento deve escrever notas em \`knowledge\`; o indexer gera chunks/vetores/edges. Não se escreve direto na vector DB.

## Camadas de seed

- Mythos Base comum: glossário, voz, método, código e manual de instruções.
- Kernel pessoal: identidade, prioridades, regras pessoais, decisões e hábitos de repo do Carlos.
- Projetos: histórico e contexto de trabalho vivem dentro da pasta do projeto, não no Kernel.

Ver também [[Estado do produto]] e [[Riscos e frentes abertas]].`,
    },
    {
        title: 'Roadmap e milestones',
        summary:
            'Linha de evolução: núcleo, ponte para sair do andaime, módulo GitHub/relay e equipa.',
        tags: ['mem-vector', 'roadmap', 'milestones'],
        content_md: `# Roadmap e milestones

## Fechado

- M0: destilação pós-chat durável e agente-autor com update-bias.
- Kernel de ficheiros: knowledge, versões, diffs, explorer, panes e grafo.
- RAG híbrido/progressive disclosure: recuperação semântica e lexical com fontes.
- Propriedades de notas: tags, summary, visibility e autoria de versões.
- Projetos reais: tarefas e conhecimento ancorados a projetos.
- Kernel do workspace: seed comum + kernel pessoal.
- Ponte inicial: reduzir dependência do host/vault e tornar a app mais replicável.

## Em curso

- Configuração e refinamento do relay.
- Kanban e cards com melhor carga/UX.
- Camada de análise e skills.
- Manual de instruções no seed (#128).
- Observabilidade do uso e do duplo-clique como kill-switch humano.

## Próximos degraus

1. Fechar o seed/kernel aprovado.
2. Importar os projetos \`mem-vector\` e \`crmcredito\` para dentro do SaaS.
3. Trabalhar cada vez mais no próprio mem-vector.
4. Formalizar o módulo GitHub como o lugar do relay de desenvolvimento.
5. Só depois avançar para grupos/equipa com partilha real de pastas e tarefas.

Ver também [[Relay e módulo GitHub]].`,
    },
    {
        title: 'Relay e módulo GitHub',
        summary:
            'O relay é o módulo de desenvolvimento: PR/issues como canal, análise como fonte e revisão cruzada.',
        tags: ['mem-vector', 'relay', 'github'],
        content_md: `# Relay e módulo GitHub

O relay é o módulo de desenvolvimento por cima do núcleo, não o produto base.

## Modelo

- O núcleo serve qualquer workspace: tasks, daily, knowledge e agente-autor.
- O módulo GitHub liga repos, issues, PRs e providers de código.
- A Análise é a fonte de verdade do trabalho.
- Development, docs e auditoria leem a Análise, não a narrativa do passo anterior.
- Principal produz; validador verifica.
- O valor está na discordância útil, não no consenso fácil.

## Dogfood provado

Em junho de 2026, o ciclo manual já aconteceu no repo real:

- Claude implementou.
- Codex reviu e melhorou.
- Claude auditou e integrou.
- PRs/issues serviram como rasto operacional.

O objetivo do módulo GitHub é formalizar este loop para o Carlos não ter de colar prompts nem conduzir cada passo à mão.

## Regras úteis

- Handoffs são curtos e estruturados; issues/specs levam contexto completo.
- O ciclo só fecha quando a issue fecha.
- PRs devem usar \`Closes #N\` em inglês quando completam uma issue.
- Antes de narrar estado de repo, confirmar em \`git\`/GitHub.

Ver também [[Arquitetura e decisões]] e [[Roadmap e milestones]].`,
    },
    {
        title: 'Riscos e frentes abertas',
        summary:
            'Riscos atuais: reset como hábito, importações stale, relay ainda manual e tarefas abertas.',
        tags: ['mem-vector', 'riscos', 'aberto'],
        content_md: `# Riscos e frentes abertas

## Riscos

- Continuar a crescer por reset da BD em vez de trabalhar dentro do produto.
- Importar prosa do vault sem destilar ou sem confirmar estado vivo.
- Meter histórico de projeto no Kernel e poluir o prompt permanente.
- Construir código write-only sem consumidor real.
- Confundir módulo GitHub/relay com o produto base.

## Issues abertas confirmadas em 2026-06-22

- #150 — ponytail-audit: remover dependências mortas/redundantes.
- #148 — Config relay.
- #146 — Load do kanban.
- #145 — O ficheiro kernel/código.
- #141 — Badge vs Icons.
- #140 — Kanban Cards.
- #139 — Layers de Analise e Skills.
- #131 — O que é isto?!?
- #129 — Observability: double-click na task/issue.
- #128 — Manual de Intruções.
- #108 — Memória: sanitização/briefing/membership.
- #107 — Memória operacional de agentes, parqueada para orquestrador.
- #48 — Módulo de equipa.

## Próxima ação

Depois do último reset/configuração, importar contexto de \`mem-vector\` e \`crmcredito\` para os projetos certos e passar a operar mais dentro do SaaS.

Ver também [[Estado do produto]].`,
    },
];

const CRMCREDITO_NOTAS: NotaImport[] = [
    {
        title: 'Estado do CRMCredito',
        summary:
            'CRM de mediação de crédito/imobiliárias em migração Bubble para Next.js, prioridade comercial imediata.',
        tags: ['crmcredito', 'estado', 'produto'],
        content_md: `# Estado do CRMCredito

CRMCredito é o produto-chave da Além do Código: CRM para mediação de crédito e imobiliárias, em migração de Bubble para Next.js.

## Prioridade

- Prioridade #1 do trimestre junho-agosto de 2026.
- Objetivo: chegar a estado vendável o mais rápido possível.
- Carlos é responsável por produção/manutenção; vendas ficam com outro elemento da equipa.

## Estado vivo confirmado em 2026-06-22

- Repo local: \`~/src/crmcredito\`.
- GitHub: \`Alem-do-Codigo/crmcredito\`.
- Sem PRs abertos.
- Main em \`0d685273\`: merge do PR #253.
- Working tree local tem \`tarefas.md\` modificado; não foi usado como verdade final.

## Issues abertas

- #108 — Limpeza.
- #73 — RLS Revisão SELECT.
- #51 — ETL: 15 campos em falta + 4 errados no transformer de empresas.

Ver também [[Histórico recente entregue]] e [[Pendências reais]].`,
    },
    {
        title: 'Domínio e linguagem',
        summary:
            'Linguagem base do domínio CRMCredito: mediação, processos, proponentes, simulações e documentos.',
        tags: ['crmcredito', 'domínio', 'glossário'],
        content_md: `# Domínio e linguagem

## Produto

CRM para empresas de mediação de crédito e imobiliárias.

## Termos úteis

- **Oportunidade** — entrada comercial/lead antes de virar processo.
- **Processo** — dossier de crédito em acompanhamento.
- **Intermediário** — entidade/mediadora que usa o CRM.
- **Admin Master** — utilizador com acesso de administração ampla.
- **Proponente** — pessoa associada ao processo de crédito.
- **Proponente principal** — contacto principal usado no processo.
- **Formulário financeiro** — respostas usadas para simulação, DSTI e resumo.
- **Simulação** — cálculo/entrada financeira persistida no processo.
- **DSTI** — cálculo de esforço financeiro.
- **Landing page** — página partilhada com cliente/proponente.
- **Composer** — bloco de atividades/comunicação partilhado entre oportunidade e processo.

## Regras de contexto

- Não misturar linguagem do CRMCredito com a do módulo GitHub/relay.
- Estado vivo de bugs e PRs confirma-se no GitHub.
- Documentação técnica principal vive no repo \`~/src/crmcredito/docs\`.

Ver também [[Arquitetura e repo]].`,
    },
    {
        title: 'Arquitetura e repo',
        summary:
            'Código em ~/src/crmcredito; vault guarda contexto, mas repo/docs/GitHub são verdade operacional.',
        tags: ['crmcredito', 'arquitetura', 'repo'],
        content_md: `# Arquitetura e repo

## Localização

- Código: \`~/src/crmcredito\`.
- Planeamento/histórico no vault: \`projects/crmcredito/\`.
- Documentação técnica: \`~/src/crmcredito/docs\`.
- Pendências soltas históricas: \`~/src/crmcredito/tarefas.md\`.

## Stack

- Origem: Bubble.
- Alvo: Next.js.
- Produto em migração com foco em ficar vendável.

## Princípio operacional

O vault dá contexto e memória; GitHub/git e o repo são a verdade para PRs, issues, merges e estado de código.

## Validação típica

O histórico recente usa testes focados, ESLint/TypeScript, \`npm run verify\`, build e smoke manual quando a alteração é UI/fluxo.

Ver também [[Estado do CRMCredito]] e [[Pendências reais]].`,
    },
    {
        title: 'Histórico recente entregue',
        summary:
            'Resumo das entregas recentes: emails, requests stale, landing page, composer e formulários/processo.',
        tags: ['crmcredito', 'histórico', 'entregue'],
        content_md: `# Histórico recente entregue

## 2026-06-22

- PR #251: erros de entrega de email entram na timeline.
- PR #252: requests antigos de \`/processo/<uuid>\` deixam de puxar o utilizador para trás depois de navegar.
- PR #253: Admin Master/intermediário hidden \`1\` escolhe uma intermediária real antes de partilhar landing page.

## Junho 2026

- Composer partilhado entre oportunidade e processo foi fechado e mergido no PR #231.
- Notificações por email para parceiro/cliente foram mergidas no PR #223.
- Re-port da oportunidade para processo passou por #224/#227; preview de processo ficou como maqueta de branch e não entrou no main.
- Continuidade oportunidade -> processo foi trabalhada na issue #232/PR #233.
- Forms/layout de quadro resumo do processo foram corrigidos com persistência real de simulações e proponente principal.
- Formulários de crédito passaram para descritores comuns em branch local histórica.

## Lição operacional

Oportunidade e processo partilham padrões, mas não se deve copiar UI/handlers sem validar domínio e referência aprovada.

Ver também [[Padroes de trabalho]].`,
    },
    {
        title: 'Pendências reais',
        summary: 'Pendências confirmadas no GitHub em 2026-06-22: #108, #73 e #51.',
        tags: ['crmcredito', 'pendências', 'github'],
        content_md: `# Pendências reais

Estado confirmado em 2026-06-22 no GitHub:

- #108 — Limpeza.
- #73 — RLS Revisão SELECT.
- #51 — ETL: 15 campos em falta + 4 errados no transformer de empresas.

## Não tratar como pendente

- #225, #226, #230 e #232 estavam fechadas na última reconciliação.
- PR #234 já estava merged.
- A decisão SMTP/IMAP individual vs Resend/SendGrid deixou de ser pendência porque o desenho atual já não precisa dela como trabalho aberto.

## Regra

Antes de planear trabalho novo, confirmar novamente GitHub/git. Esta nota é contexto importado, não substitui estado vivo.

Ver também [[Estado do CRMCredito]].`,
    },
    {
        title: 'Padroes de trabalho',
        summary:
            'Padrões de execução no CRMCredito: mudanças cirúrgicas, referência visual existente, validação real.',
        tags: ['crmcredito', 'método', 'qualidade'],
        content_md: `# Padroes de trabalho

## Método

- Mudanças cirúrgicas: tocar só no que a tarefa pede.
- Espelhar referência existente em UI/fluxo, não reinventar.
- Validar domínio real: oportunidade e processo podem parecer iguais e não ser.
- Não reverter trabalho de outro agente/utilizador sem pedido explícito.
- GitHub/git são a verdade; o vault pode estar stale.

## UI/forms

- Seguir docs e padrões do repo, como \`docs/PADRAO-FORMS.md\`.
- Validar render real quando a alteração é visual.
- Evitar fachadas: se a UI promete persistência, tem de gravar no servidor.

## Ciclo

- Issue/PR com contexto suficiente para sessão limpa.
- Testes/lint/typecheck/build conforme risco.
- Smoke manual quando muda fluxo principal.

Ver também [[Histórico recente entregue]].`,
    },
];

async function userDb() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon)
        throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    await esperarAuthHealth(url);
    const db = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) throw new Error(`signIn import falhou: ${error.message}`);
    return db;
}

async function importarProjeto(nome: string, notas: NotaImport[]): Promise<void> {
    const db = await userDb();
    const projeto = await resolverProjetoCom(db, nome);
    if (!projeto.folderId) throw new Error(`projeto ${nome} ficou sem pasta`);

    for (const nota of notas) {
        const escrita = await escreverNotaEmPastaCom(
            db,
            {
                title: nota.title,
                content_md: nota.content_md,
                summary: nota.summary,
                tags: nota.tags,
                links: [],
                reason: `Importação destilada do vault MythosEngine para o projeto ${nome}`,
            },
            projeto.folderId,
            'agent',
        );
        console.log(`✓ ${nome}: ${escrita.title} (${escrita.slug})`);
    }
}

async function main(): Promise<void> {
    await importarProjeto('mem-vector', MEM_VECTOR_NOTAS);
    await importarProjeto('crmcredito', CRMCREDITO_NOTAS);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
