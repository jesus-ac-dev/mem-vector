import { NextResponse } from 'next/server';
import { procurarTexto, procurarConceito } from '@/modules/procura/procura.service';
import { sessaoOu401 } from '@/lib/api-auth';

// Procura (#91). Rota GET estável (#73). `modo=texto` (full-text, default) ou
// `modo=conceito` (semântico). Sem sessão → 401 (não 404), para o cliente
// distinguir sessão expirada de "sem resultados".
export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const q = params.get('q')?.trim() ?? '';
    if (!q) return NextResponse.json([]);

    const erro = await sessaoOu401();
    if (erro) return erro;

    const resultados =
        params.get('modo') === 'conceito' ? await procurarConceito(q) : await procurarTexto(q);
    return NextResponse.json(resultados);
}
