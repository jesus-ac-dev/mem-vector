import { NextResponse } from 'next/server';
import { sessaoOu401 } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { lerEventosRelayCom } from '@/modules/relay/relay.eventos';
import { lerSteeringPendenteCom } from '@/modules/relay/relay.steering';

// Rota GET (#73): a corrida do relay para o modal do double-click (#129) —
// timeline de eventos + orientações de steering ainda pendentes.
export async function GET(req: Request) {
    const erro = await sessaoOu401();
    if (erro) return erro;

    const url = new URL(req.url);
    const repo = url.searchParams.get('repo') ?? '';
    const issue = Number(url.searchParams.get('issue'));
    if (!repo || !Number.isInteger(issue) || issue <= 0) {
        return NextResponse.json({ error: 'repo e issue são obrigatórios' }, { status: 400 });
    }

    const db = await createClient();
    const [eventos, steeringPendente] = await Promise.all([
        lerEventosRelayCom(db, { repo, issue }),
        lerSteeringPendenteCom(db, { repo, issue }),
    ]);
    return NextResponse.json({ eventos, steeringPendente });
}
