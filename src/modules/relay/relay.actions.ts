'use server';

import { after } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { lerDefinicoesServidorCom } from '@/modules/definicoes/definicoes.service';

import { orquestrar } from './relay.orchestrator';

// Trigger do relay: dispara o pipeline para uma (repo, issue). Valida cedo
// (estado conhecido → aviso, não throw de app) e corre o orchestrator em
// BACKGROUND (after) — fire-and-forget. O estado/progresso vive na ISSUE
// (comentários assinados + semáforos por label), por isso a resposta volta logo;
// acompanha-se no GitHub, não num spinner. (Padrão after() da destilação.)
export async function dispararRelay(
    repo: string,
    issue: number,
): Promise<{ ok: boolean; detalhe: string }> {
    if (!repo || !Number.isInteger(issue) || issue <= 0) {
        return { ok: false, detalhe: 'Indica o repo e um número de issue válido.' };
    }

    const db = await createClient();
    const defs = await lerDefinicoesServidorCom(db);

    if (!defs.githubToken) {
        return { ok: false, detalhe: 'Sem token GitHub (Definições > módulo GitHub).' };
    }
    const ligado = defs.githubRepos.find((r) => r.repo === repo);
    if (!ligado?.path) {
        return { ok: false, detalhe: `Repo "${repo}" sem path local — corre o Testar primeiro.` };
    }
    if (Object.keys(defs.cruzamentos).length === 0) {
        return {
            ok: false,
            detalhe: 'Sem cruzamentos configurados (Definições > Configurar cruzamentos).',
        };
    }

    after(async () => {
        try {
            await orquestrar({ defs, repo, issue });
        } catch (e) {
            console.error('[relay] orquestrar falhou:', e);
        }
    });

    return { ok: true, detalhe: `Relay disparado para ${repo} #${issue} — acompanha na issue.` };
}
