import { NextResponse } from 'next/server';
import { sessaoOu401 } from '@/lib/api-auth';
import { listarArquivados } from '@/modules/knowledge/knowledge.service';

// Rota GET (#73): notas arquivadas (toggle do explorer), antes via action.
export async function GET() {
    const erro = await sessaoOu401();
    if (erro) return erro;

    return NextResponse.json(await listarArquivados());
}
