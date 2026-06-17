import { NextResponse } from 'next/server';
import { listarPastas } from '@/modules/folders/folders.service';

// Rota GET (#73): pastas do utilizador (modal de cores do grafo), antes via action.
export async function GET() {
    return NextResponse.json(await listarPastas());
}
