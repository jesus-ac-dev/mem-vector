import { NextResponse } from 'next/server';
import { dadosDaBarraDireita } from '@/modules/workspace/workspace.leituras';
import { sessaoOu401 } from '@/lib/api-auth';

// Rota GET (#73): a barra da direita era um load automático em useEffect via
// server action → partia com "unexpected response" quando o HMR rodava os IDs.
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

    return NextResponse.json(await dadosDaBarraDireita(tipo, chave, id));
}
