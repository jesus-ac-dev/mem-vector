import type { SupabaseClient } from '@supabase/supabase-js';

import { pastaKernelIdCom } from '@/agent/kernel';
import { escreverNotaEmPastaCom } from '@/modules/knowledge/knowledge.service';
import type { RespostasOnboarding } from './onboarding.schema';

// Onboarding (#40): as respostas viram as notas pessoais do Kernel (Sobre mim,
// Prioridades, Regras do agente), escritas como `user`. A pasta Kernel já
// existe (semeada no 1.º login com o Mythos Base); aqui só se acrescenta o
// pessoal. Idempotente por slug (re-submeter atualiza a mesma nota).
export async function completarOnboardingCom(
    db: SupabaseClient,
    respostas: RespostasOnboarding,
): Promise<void> {
    const folderId = await pastaKernelIdCom(db);
    if (!folderId) throw new Error('sem pasta Kernel para o onboarding');

    const notas = [
        { title: 'Sobre mim', corpo: respostas.sobreMim },
        { title: 'Prioridades', corpo: respostas.prioridades },
        { title: 'Regras do agente', corpo: respostas.regras },
    ];
    for (const n of notas) {
        await escreverNotaEmPastaCom(
            db,
            {
                title: n.title,
                content_md: `# ${n.title}\n\n${n.corpo.trim()}\n`,
                links: [],
                reason: 'onboarding (#40)',
            },
            folderId,
            'user',
        );
    }
}
