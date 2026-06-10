import { NextResponse } from 'next/server';
import { listarNotasLinkaveis } from '@/modules/workspace/workspace.actions';

// Leitura por GET em vez de Server Action chamada em useEffect: o mesmo remédio
// do /api/file — actions em loads de montagem partem com "unexpected response"
// quando o dev server recompila ou o POST leva bounce do middleware.
export async function GET() {
    const notas = await listarNotasLinkaveis();
    return NextResponse.json(notas);
}
