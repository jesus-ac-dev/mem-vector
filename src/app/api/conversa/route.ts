import { NextResponse } from 'next/server';
import { sessaoOu401 } from '@/lib/api-auth';
import { carregarConversa } from '@/modules/chat/chat.conversas';

// Rota GET (#73): mensagens de uma conversa (ao abrir/trocar), antes via action.
export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!id) return NextResponse.json({ error: 'id vazio' }, { status: 400 });

    const erro = await sessaoOu401();
    if (erro) return erro;

    return NextResponse.json(await carregarConversa(id));
}
