import { NextResponse } from 'next/server';
import { listarArquivados } from '@/modules/knowledge/knowledge.service';

// Rota GET (#73): notas arquivadas (toggle do explorer), antes via action.
export async function GET() {
    return NextResponse.json(await listarArquivados());
}
