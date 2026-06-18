import { NextResponse } from 'next/server';
import { procurarTexto } from '@/modules/procura/procura.service';
import { sessaoOu401 } from '@/lib/api-auth';

// Procura full-text (#91, modo "Texto"). Rota GET estável (#73). Sem sessão → 401
// (não 404), para o cliente distinguir sessão expirada de "sem resultados".
export async function GET(request: Request) {
    const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (!q) return NextResponse.json([]);

    const erro = await sessaoOu401();
    if (erro) return erro;

    return NextResponse.json(await procurarTexto(q));
}
