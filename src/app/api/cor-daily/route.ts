import { NextResponse } from 'next/server';
import { sessaoOu401 } from '@/lib/api-auth';
import { corDaily } from '@/modules/daily/daily.service';

// Rota GET (#73): cor do grupo daily (modal de cores do grafo), antes via action.
export async function GET() {
    const erro = await sessaoOu401();
    if (erro) return erro;

    return NextResponse.json(await corDaily());
}
