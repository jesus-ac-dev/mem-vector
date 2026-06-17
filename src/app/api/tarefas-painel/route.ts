import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    listarTarefasAbertasCom,
    listarTarefasConcluidasCom,
} from '@/modules/tarefas/tarefas.service';
import { listarProjetosCom } from '@/modules/projetos/projetos.service';

// Rota GET (#73): painel de tarefas (sidebar esquerda + kanban). Carregado ao
// montar/trocar de rota no ribbon — antes via action, exposto ao stale de IDs.
export async function GET() {
    const db = await createClient();
    const [abertas, concluidas, projetos] = await Promise.all([
        listarTarefasAbertasCom(db),
        listarTarefasConcluidasCom(db),
        listarProjetosCom(db),
    ]);
    return NextResponse.json({ abertas, concluidas, projetos });
}
