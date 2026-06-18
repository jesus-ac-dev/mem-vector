import { NextResponse } from 'next/server';
import { sessaoOu401 } from '@/lib/api-auth';
import { grafoDados } from '@/modules/knowledge/knowledge.service';

// Rota GET (#73): dados do grafo, antes carregados em useEffect via action.
export async function GET() {
    const erro = await sessaoOu401();
    if (erro) return erro;

    return NextResponse.json(await grafoDados());
}
