import type { SupabaseClient } from '@supabase/supabase-js';

// Kernel do workspace (#34): uma pasta `Kernel` na raiz com notas normais que
// o utilizador escreve para dar identidade, prioridades e regras ao agente —
// o CLAUDE.md/context/ do MythosEngine transposto para o produto. É lido em
// todos os arranques do agente (chat + destilação one-shot + sessão agentic).
// Sem pasta Kernel, nada muda. Lição da auditoria do arranque do vault: o
// Kernel é estado do UTILIZADOR (editável, versionado, com dono); o estado
// gerado na hora (candidatos, daily, conversa) continua gerado.

export interface NotaKernel {
    title: string;
    contentMd: string;
}

// Caps para o Kernel não engolir o prompt: ~1k tokens por nota, ~3k no total.
const CAP_NOTA = 4000;
const CAP_TOTAL = 12000;
const CAP_RELAY_NOTA = 2000;
const CAP_RELAY_TOTAL = 6000;
const TITULOS_RELAY_RE =
    /regras?|m[ée]todo|modo|trabalho|craft|voz|prioridades?|qualidade|c[oó]digo|dev|desenvolvimento|relay/i;

export async function lerKernelCom(db: SupabaseClient, userId?: string): Promise<NotaKernel[]> {
    let uid = userId;
    if (!uid) {
        const {
            data: { user },
        } = await db.auth.getUser();
        if (!user) return [];
        uid = user.id;
    }

    // O unique index de folders é por lower(name) ao nível — há no máximo uma
    // pasta "Kernel" na raiz, em qualquer capitalização.
    const { data: pastas, error } = await db
        .from('folders')
        .select('id')
        .eq('owner_id', uid)
        .is('parent_id', null)
        .eq('archived', false)
        .ilike('name', 'kernel');
    if (error) throw new Error(`ler pasta Kernel: ${error.message}`);
    if (!pastas?.length) return [];

    const { data: notas, error: e2 } = await db
        .from('knowledge')
        .select('title, content_md')
        .eq('owner_id', uid)
        .eq('folder_id', pastas[0].id)
        .eq('archived', false)
        .order('title');
    if (e2) throw new Error(`ler notas do Kernel: ${e2.message}`);

    return (notas ?? []).map((n) => ({ title: n.title, contentMd: n.content_md }));
}

export function blocoKernel(
    notas: NotaKernel[],
    opts: { capNota?: number; capTotal?: number; cabecalho?: string } = {},
): string {
    if (!notas.length) return '';
    const capNota = opts.capNota ?? CAP_NOTA;
    const capTotal = opts.capTotal ?? CAP_TOTAL;
    const partes: string[] = [];
    let total = 0;
    for (const n of notas) {
        let corpo = n.contentMd.trim();
        if (corpo.length > capNota) {
            corpo = `${corpo.slice(0, capNota)}\n[cortado: nota maior que o cap do Kernel]`;
        }
        const parte = `--- ${n.title} ---\n${corpo}`;
        if (total + parte.length > capTotal) {
            partes.push('[cortado: Kernel maior que o cap total]');
            break;
        }
        partes.push(parte);
        total += parte.length;
    }
    return (
        (opts.cabecalho ??
            'KERNEL DO WORKSPACE (escrito pelo utilizador — identidade, prioridades e regras dele; ' +
                'respeita-o em tudo o que fizeres):') +
        '\n' +
        partes.join('\n\n') +
        '\n'
    );
}

export function notasKernelParaRelay(notas: NotaKernel[]): NotaKernel[] {
    const focadas = notas.filter((n) => TITULOS_RELAY_RE.test(n.title));
    return focadas.length ? focadas : notas;
}

export function blocoKernelRelay(notas: NotaKernel[]): string {
    return blocoKernel(notasKernelParaRelay(notas), {
        capNota: CAP_RELAY_NOTA,
        capTotal: CAP_RELAY_TOTAL,
        cabecalho:
            'KERNEL DO WORKSPACE PARA RELAY (subset focado em método, voz, prioridades e regras; ' +
            'aplica-o a todas as fases, principais e validadores):',
    });
}

// Conveniência dos arranques: kernel como bloco pronto, não-fatal por design —
// um Kernel ilegível não pode custar a resposta nem a destilação.
export async function blocoKernelCom(db: SupabaseClient): Promise<string> {
    try {
        return blocoKernel(await lerKernelCom(db));
    } catch (e) {
        console.error('ler Kernel falhou (segue sem):', e);
        return '';
    }
}

export async function blocoKernelRelayCom(db: SupabaseClient): Promise<string> {
    try {
        return blocoKernelRelay(await lerKernelCom(db));
    } catch (e) {
        console.error('ler Kernel para relay falhou (segue sem):', e);
        return '';
    }
}

// O moldar do agente (proatividade, estilo, regras) vive no KERNEL — a nota
// "Regras do agente" — e não num campo Comportamento à parte (que duplicava o
// Kernel). Descontinuado em 2026-06-22 (pedido do Carlos no smoke).

// Mythos Base (#44): a camada GENÉRICA do seed — a língua do produto que serve
// qualquer utilizador, semeada ao lado do KERNEL_SEED. O glossário do produto
// entra aqui; o glossário PESSOAL do dono (a língua que ele cunhou) importa-se
// com o seed:user/onboarding (#40), e o relay/orquestrador entra quando o
// módulo GitHub nascer.
export const MYTHOS_BASE_SEED: { title: string; contentMd: string }[] = [
    {
        title: 'Glossário',
        contentMd:
            '# Glossário (a língua do mem-vector)\n\n' +
            'A língua-base do produto — o que cada coisa significa aqui. (O teu ' +
            'glossário pessoal e os termos de cada módulo crescem por cima.)\n\n' +
            '- **Nota / Knowledge** — página de conhecimento escrita e atualizada ' +
            'pelo agente; título, corpo markdown, tags e ligações [[wikilink]].\n' +
            '- **Daily** — registo diário do que aconteceu nas conversas; a memória ' +
            'cronológica do workspace.\n' +
            '- **Tarefa** — item de trabalho com estado (kanban), prioridade, ' +
            'projeto e datas; o agente cria e conclui.\n' +
            '- **Projeto** — pasta que agrupa trabalho relacionado; "Pessoal" é o ' +
            'projeto-vida por defeito.\n' +
            '- **Kernel** — a pasta na raiz com identidade, prioridades e regras; o ' +
            'agente lê-a em todos os arranques.\n' +
            '- **Agente-autor** — o agente é o autor: tu falas, ele escreve o estado ' +
            '(notas, tarefas, daily).\n' +
            '- **Destilação** — depois de cada conversa o agente decide se e onde ' +
            'registar o que vale (nota, tarefa, daily, decisão).\n' +
            '- **RAG / pesquisa** — recuperação por significado sobre o que já foi ' +
            'escrito ("o que decidimos?").\n' +
            '- **Arquivo** — arquivar tira do espaço de trabalho ativo (sai do ' +
            'explorer e da pesquisa); a memória persiste e pode voltar.\n' +
            '- **Teia / wikilink** — [[ligações]] entre notas, dailies e conversas; ' +
            'o grafo mostra a rede.\n',
    },
    {
        title: 'Manual de Instruções',
        contentMd:
            '# Manual de Instruções\n\n' +
            'Como usar este workspace com o agente-autor:\n\n' +
            '- Fala em linguagem normal. O agente deve separar conversa trivial de ' +
            'factos, decisões, tarefas e conhecimento que vale guardar.\n' +
            '- Para registar conhecimento, diz o facto ou a decisão. Não precisas de ' +
            'pedir "guarda isto" quando é durável.\n' +
            '- Para rever estado, pergunta pelo que decidimos, pelo que está aberto, ' +
            'ou pelo que mudou num projeto.\n' +
            '- Para criar trabalho, descreve o resultado desejado; o agente deve criar ' +
            'tarefas só quando há compromisso real, não para cada ideia solta.\n' +
            '- Para corrigir conhecimento, aponta a nota ou o assunto. O agente deve ' +
            'continuar a página certa em vez de criar duplicados.\n' +
            '- Para investigar, pede uma síntese e depois aprova o que deve ficar no ' +
            'workspace. O bruto pode existir na conversa; o destilado vive nas notas.\n' +
            '- O Kernel manda no comportamento. Edita as notas do Kernel quando quiseres ' +
            'mudar voz, prioridades, regras ou método.\n',
    },
    {
        title: 'Voz',
        contentMd:
            '# Voz\n\n' +
            'Como o agente escreve, por defeito (edita à tua medida):\n\n' +
            '- Frases curtas. Bullets antes de parágrafos.\n' +
            '- Direto e claro: lidera com o que precisa de ação, sem fluff.\n' +
            '- Sem em dashes.\n' +
            '- A língua segue a tua: escreve como tu escreves.\n' +
            '- Conteúdo para fora (email, cliente, redes): mostra um rascunho antes, ' +
            'não finjas a tua voz.\n',
    },
    {
        title: 'Como trabalho',
        contentMd:
            '# Como trabalho\n\n' +
            'O método do agente-autor (genérico; o teu pessoal cresce por cima):\n\n' +
            '- Cada conversa deixa rasto: o agente regista sozinho o que vale (nota, ' +
            'tarefa, daily, decisão). Não pede licença; na dúvida, regista (as ' +
            'versões são a rede).\n' +
            '- UPDATE antes de CREATE: continua a nota dona do assunto em vez de ' +
            'criar duplicados.\n' +
            '- O workspace é uma teia: liga as notas com [[título exato]], ' +
            'liberalmente. Sem ilhas.\n' +
            '- Quando um turno junta várias partes do mesmo todo, cria ou mantém uma ' +
            'nota-índice que liga essas partes.\n' +
            '- As notas são páginas vivas de wiki: prosa integrada, sem carimbos de ' +
            'proveniência no corpo (o versionamento trata disso).\n' +
            '- Daily só com o que aconteceu de facto, sem encher.\n',
    },
    {
        title: 'Código',
        contentMd:
            '# Código\n\n' +
            'Como o agente escreve código, sempre que programa:\n\n' +
            '- CIRÚRGICO: muda só o que a tarefa pede. Não "melhoras" código à volta, ' +
            'não refatoras o que não está partido, espelhas o estilo existente.\n' +
            '- SEGUE A SPEC, não o que achas: faz o que foi pedido e confirma no ' +
            'resultado real. Sem fachadas — código write-only sem consumidor é custo, ' +
            'não valor.\n' +
            '- DOCS PRIMEIRO: lê a doc do subsistema e o código vizinho ANTES de mexer. ' +
            'Nunca afirmes uma causa ou limitação por teoria — verifica no binário/doc.\n' +
            '- VERIFICA antes de dizer "feito": testes, lint, build. Se falha, di-lo com ' +
            'a saída real. Evidência acima de teoria.\n' +
            '- ESTADO VIVO: antes de narrar PRs, issues, branches, merges ou deploys, ' +
            'confirma no git/GitHub/sistema real. O texto antigo pode estar stale.\n' +
            '- TDD quando dá: primeiro o teste que falha, depois o código até passar.\n' +
            '- ÂMBITO: não alargues. O que ficar por fazer vira tarefa, não scope-creep.\n' +
            '- UPDATE antes de CREATE também no código: cresce no sítio certo, não duplica.\n',
    },
];

// #120 (a migração do Mythos para o produto): a camada PESSOAL do dono SAIU do
// código. O produto (src/) só conhece o Mythos Base genérico; o conteúdo pessoal
// (identidade, prioridades, regras, decisões) vive em `scripts/seed-data/` e
// entra por PARÂMETRO — o seed:user carrega-o. Um user novo nasce só com o
// Mythos Base e preenche o pessoal pelo onboarding. Assim o produto é
// multi-utilizador real e o reset não arrasta uma pessoa no binário.

// Seed idempotente (#36): cria a pasta Kernel + notas iniciais quando o
// workspace ainda não tem NENHUMA pasta Kernel na raiz — em qualquer estado:
// arquivada conta como opt-out do utilizador e não se recria. Não-fatal.
// Semeia sempre o Mythos Base (genérico); `notasPessoais` acrescenta a camada
// pessoal que o seed:user carrega de fora do código (#120). Um user novo nasce
// só com o Mythos Base e preenche o pessoal pelo onboarding.
export async function garantirKernelCom(
    db: SupabaseClient,
    userId?: string,
    notasPessoais: NotaKernel[] = [],
): Promise<boolean> {
    try {
        // O layout já tem o user — aceitar o id poupa um auth.getUser por
        // request no hot path (audit #36).
        let uid = userId;
        if (!uid) {
            const {
                data: { user },
            } = await db.auth.getUser();
            if (!user) return false;
            uid = user.id;
        }

        const { data: pastas, error } = await db
            .from('folders')
            .select('id')
            .eq('owner_id', uid)
            .is('parent_id', null)
            .ilike('name', 'kernel');
        if (error) throw new Error(`procurar pasta Kernel: ${error.message}`);
        if (pastas?.length) return false;

        const { criarPastaCom } = await import('@/modules/folders/folders.service');
        const { escreverNotaEmPastaCom } = await import('@/modules/knowledge/knowledge.service');
        const pasta = await criarPastaCom(db, 'Kernel');
        // Mythos Base sempre (genérico); o pessoal só quando o seed:user o passa (#120).
        const seeds = [...MYTHOS_BASE_SEED, ...notasPessoais];
        for (const seed of seeds) {
            await escreverNotaEmPastaCom(
                db,
                {
                    title: seed.title,
                    content_md: seed.contentMd,
                    links: [],
                    reason: 'seed do Kernel (#36)',
                },
                pasta.id,
                'agent',
            );
        }
        return true;
    } catch (e) {
        console.error('seed do Kernel falhou (segue sem):', e);
        return false;
    }
}

// Id da pasta Kernel na raiz (case-insensitive, não arquivada), ou null.
export async function pastaKernelIdCom(db: SupabaseClient): Promise<string | null> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) return null;
    const { data: pastas, error } = await db
        .from('folders')
        .select('id')
        .eq('owner_id', user.id)
        .is('parent_id', null)
        .eq('archived', false)
        .ilike('name', 'kernel');
    if (error) throw new Error(`procurar pasta Kernel: ${error.message}`);
    return pastas?.length ? String(pastas[0].id) : null;
}

// Onboarding (#40): um user que já tem Kernel (Mythos Base semeado) mas ainda
// não tem a nota pessoal "Sobre mim" é novo — falta preencher o pessoal pela
// entrevista. O dono (seed:user) nasce com o pessoal e não cai aqui. Sem Kernel
// (opt-out / antes do seed) não força. Não-fatal: nunca bloqueia o arranque.
export async function precisaOnboardingCom(db: SupabaseClient, userId?: string): Promise<boolean> {
    try {
        const notas = await lerKernelCom(db, userId);
        if (!notas.length) return false;
        return !notas.some((n) => n.title === 'Sobre mim');
    } catch (e) {
        console.error('precisaOnboarding falhou (segue sem):', e);
        return false;
    }
}
