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

// Notas iniciais do Kernel (#36): nascem com a pasta para o utilizador ver o
// que o Kernel é sem ler documentação — o smoke do Carlos chumbou na
// descoberta. Conteúdo curto: explica o propósito e convida a editar.
export const KERNEL_SEED: { title: string; contentMd: string }[] = [
    {
        title: 'Sobre mim',
        contentMd:
            '# Sobre mim\n\nQuem és, o que fazes, o contexto que o agente deve saber sempre. ' +
            'Esta nota é lida em todos os arranques do agente — escreve aqui o que nunca ' +
            'queres repetir no chat.\n',
    },
    {
        title: 'Prioridades',
        contentMd:
            '# Prioridades\n\nO que importa agora (projetos, prazos, foco). O agente lê isto ' +
            'antes de responder e de registar — mantém curto e atual.\n',
    },
    {
        title: 'Regras do agente',
        contentMd:
            '# Regras do agente\n\nComo queres que o agente se comporte: tom, língua, o que ' +
            'registar ou evitar. Ex.: "Trata-me por tu." Estas regras mandam em todas as ' +
            'respostas e escritas.\n',
    },
    {
        title: 'Decisões',
        contentMd:
            '# Decisões\n\nRegisto das decisões importantes (a memória de alto nível): o quê, ' +
            'porquê, quando. Acrescenta aqui — ou pede ao agente para registar — e elas passam ' +
            'a moldar o comportamento futuro.\n',
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
