import { NextResponse } from 'next/server';
import { versoesDoFicheiro } from '@/modules/workspace/workspace.leituras';

// Rota GET (#73): versões do ficheiro ativo (histórico), antes em useEffect.
export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const tipo = params.get('tipo');
    const chave = params.get('chave') ?? '';
    const id = params.get('id') ?? undefined;

    if (tipo !== 'knowledge' && tipo !== 'daily') {
        return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
    }
    if (!chave) {
        return NextResponse.json({ error: 'chave vazia' }, { status: 400 });
    }

    return NextResponse.json(await versoesDoFicheiro(tipo, chave, id));
}
