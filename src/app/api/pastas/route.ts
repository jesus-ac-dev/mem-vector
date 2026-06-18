import { NextResponse } from 'next/server';
import { sessaoOu401 } from '@/lib/api-auth';
import { listarPastas } from '@/modules/folders/folders.service';

// Rota GET (#73): pastas do utilizador (modal de cores do grafo), antes via action.
export async function GET() {
    const erro = await sessaoOu401();
    if (erro) return erro;

    return NextResponse.json(await listarPastas());
}
