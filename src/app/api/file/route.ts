import { NextResponse } from 'next/server';
import { lerConteudoFicheiro } from '@/modules/workspace/workspace.files';

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

    const ficheiro = await lerConteudoFicheiro(tipo, chave, id);
    if (!ficheiro) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(ficheiro);
}
