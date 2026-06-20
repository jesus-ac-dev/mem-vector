import type { NotaKernel } from '../../src/agent/kernel';

// #120: o conteúdo PESSOAL do Kernel do dono (Carlos) — FORA do código do
// produto. O `src/` só conhece o Mythos Base genérico; isto é dado que o
// `seed:user` carrega e passa a `garantirKernelCom`. Migrar a identidade do dono
// para aqui é "o Mythos a transferir-se para o produto" sem arrastar uma pessoa
// dentro do binário. Outro dono = outro ficheiro destes (ou o onboarding).
export const KERNEL_PESSOAL: NotaKernel[] = [
    {
        title: 'Sobre mim',
        contentMd:
            '# Sobre mim\n\n' +
            'Sou o Carlos Jesus, 42 anos, CTO e co-fundador da Além do Código ' +
            '(alemdocodigo.pt), uma software house AI-first em Faro — somos 3, ' +
            'co-localizados. Faço a produção e a manutenção dos produtos (as vendas não ' +
            'são comigo). GitHub: jesus-ac-dev.\n\n' +
            'Construo o MythosEngine/mem-vector em horas extra para provar a tese da ' +
            'camada pessoal de produtividade: o modelo é commodity; o contexto, as ' +
            'especializações e os workflows é que diferenciam.\n\nTrata-me por tu.\n',
    },
    {
        title: 'Prioridades',
        contentMd:
            '# Prioridades\n\n' +
            'Trimestre Jun-Ago 2026:\n\n' +
            '1. **CRMCredito vendável** — o produto-chave (CRM para mediação de crédito + ' +
            'imobiliárias, em migração Bubble → Next.js). Foco imediato.\n' +
            '2. **mem-vector** — o núcleo do MythosEngine: chat + agente-autor + RAG + ' +
            'tasks/daily. Norte: coordenador de agentes com kanban próprio.\n' +
            '3. **Camada pessoal de produtividade** — contexto + especialização + ' +
            'workflows como diferenciador.\n\n' +
            'Foco deste workspace, por agora: desenvolvimento de software. Vendas e ' +
            'financeiro vêm depois.\n',
    },
    {
        title: 'Regras do agente',
        contentMd:
            '# Regras do agente\n\n' +
            '- Português de Portugal; trata-me por tu.\n' +
            '- Direto, conciso e claro — zero fluff; lidera com o que precisa de ação.\n' +
            '- Sê crítico construtivo, não cheerleader: aponta os weak spots e puxa-me a ' +
            'pensar; não inventes consenso.\n' +
            '- Proativo a registar factos duráveis — não peças licença; na dúvida, regista ' +
            '(as versões são a rede).\n' +
            '- UPDATE > CREATE: continua a nota dona do assunto em vez de criar duplicados.\n' +
            '- As notas são páginas vivas de wiki: prosa integrada, sem carimbos de ' +
            'proveniência no corpo (o versionamento trata disso).\n' +
            '- Daily só com o que aconteceu de facto — sem encher.\n',
    },
    {
        title: 'Decisões',
        contentMd:
            '# Decisões\n\n' +
            'Registo de alto nível (importado do vault do MythosEngine; acrescenta aqui — ' +
            'ou pede ao agente para registar):\n\n' +
            '- **2026-06-10 — Declarativa sem marcas de pergunta = facto a registar.** Com ' +
            'hedge ("acho que"), regista na mesma e sinaliza a assunção. Perder factos ' +
            'custa mais do que registar a mais.\n' +
            '- **2026-06-10 — Update > create.** O facto novo continua a nota dona do ' +
            'assunto; notas sobre pessoas têm como título os nomes delas.\n' +
            '- **2026-06-10 — Estilo de escrita.** A nota é uma página viva, para leitura ' +
            'humana futura; a proveniência vive no versionamento, não no corpo.\n' +
            '- **2026-06-11 — Arquivo ≠ esquecimento.** Arquivar tira a nota do espaço de ' +
            'trabalho, mas a memória (daily/conversas) persiste e pode rematerializar o ' +
            'assunto.\n' +
            '- **2026-06-11 — Arquivadas fora do pipeline de escrita.** Nenhuma escrita ' +
            'aterra numa nota arquivada; repor devolve-lhe a escrita.\n' +
            '- **2026-06-11 — O Kernel manda.** Esta pasta é lida em todos os arranques ' +
            'do agente.\n',
    },
];
