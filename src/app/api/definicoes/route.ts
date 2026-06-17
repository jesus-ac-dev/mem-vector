import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { lerDefinicoesVistaCom } from '@/modules/definicoes/definicoes.service';

// Rota GET (#73): definições do workspace (composer do chat e modais), antes
// carregadas em useEffect via action — expostas ao stale de action IDs.
export async function GET() {
    return NextResponse.json(await lerDefinicoesVistaCom(await createClient()));
}
