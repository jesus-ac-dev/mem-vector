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

export async function lerKernelCom(db: SupabaseClient): Promise<NotaKernel[]> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) return [];

    // O unique index de folders é por lower(name) ao nível — há no máximo uma
    // pasta "Kernel" na raiz, em qualquer capitalização.
    const { data: pastas, error } = await db
        .from('folders')
        .select('id')
        .eq('owner_id', user.id)
        .is('parent_id', null)
        .eq('archived', false)
        .ilike('name', 'kernel');
    if (error) throw new Error(`ler pasta Kernel: ${error.message}`);
    if (!pastas?.length) return [];

    const { data: notas, error: e2 } = await db
        .from('knowledge')
        .select('title, content_md')
        .eq('owner_id', user.id)
        .eq('folder_id', pastas[0].id)
        .eq('archived', false)
        .order('title');
    if (e2) throw new Error(`ler notas do Kernel: ${e2.message}`);

    return (notas ?? []).map((n) => ({ title: n.title, contentMd: n.content_md }));
}

export function blocoKernel(notas: NotaKernel[]): string {
    if (!notas.length) return '';
    const partes: string[] = [];
    let total = 0;
    for (const n of notas) {
        let corpo = n.contentMd.trim();
        if (corpo.length > CAP_NOTA) {
            corpo = `${corpo.slice(0, CAP_NOTA)}\n[cortado: nota maior que o cap do Kernel]`;
        }
        const parte = `--- ${n.title} ---\n${corpo}`;
        if (total + parte.length > CAP_TOTAL) {
            partes.push('[cortado: Kernel maior que o cap total]');
            break;
        }
        partes.push(parte);
        total += parte.length;
    }
    return (
        'KERNEL DO WORKSPACE (escrito pelo utilizador — identidade, prioridades e regras dele; ' +
        'respeita-o em tudo o que fizeres):\n' +
        partes.join('\n\n') +
        '\n'
    );
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

// Notas iniciais do Kernel (#36, personalizadas no #39): nascem com a pasta —
// e como vêm aí resets de BD, o conteúdo real do Carlos vive AQUI no seeder
// (pedido dele, 2026-06-11). O onboarding de novos utilizadores preencherá
// isto por entrevista (#40); até lá, esta é a instância do Carlos.
export const KERNEL_SEED: { title: string; contentMd: string }[] = [
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

// Seed idempotente (#36): cria a pasta Kernel + notas iniciais quando o
// workspace ainda não tem NENHUMA pasta Kernel na raiz — em qualquer estado:
// arquivada conta como opt-out do utilizador e não se recria. Não-fatal.
export async function garantirKernelCom(db: SupabaseClient, userId?: string): Promise<boolean> {
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
        for (const seed of KERNEL_SEED) {
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
