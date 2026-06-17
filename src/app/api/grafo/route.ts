import { NextResponse } from 'next/server';
import { grafoDados } from '@/modules/knowledge/knowledge.service';

// Rota GET (#73): dados do grafo, antes carregados em useEffect via action.
export async function GET() {
    return NextResponse.json(await grafoDados());
}
