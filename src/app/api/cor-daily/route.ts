import { NextResponse } from 'next/server';
import { corDaily } from '@/modules/daily/daily.service';

// Rota GET (#73): cor do grupo daily (modal de cores do grafo), antes via action.
export async function GET() {
    return NextResponse.json(await corDaily());
}
