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
