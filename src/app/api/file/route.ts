import { NextResponse } from 'next/server';
import { lerConteudoFicheiro } from '@/modules/workspace/workspace.files';
import { sessaoOu401 } from '@/lib/api-auth';

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

    // Sem sessão → 401 (não deixar a RLS colapsar em 404 silencioso → kick sem aviso).
    const erro = await sessaoOu401();
    if (erro) return erro;

    const ficheiro = await lerConteudoFicheiro(tipo, chave, id);
    if (!ficheiro) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(ficheiro);
}
