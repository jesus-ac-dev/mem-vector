import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Distingue "sessão expirada" (401) de "não encontrado" (404) nas rotas GET de
// leitura. Sem isto, a RLS filtra a linha quando não há sessão e a rota devolve
// 404 — o cliente trata como vazio e o utilizador cai no login sem aviso
// (#smoke 2026-06-18). Devolve a resposta 401 a usar, ou null se há sessão.
export async function sessaoOu401(): Promise<NextResponse | null> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user ? null : NextResponse.json({ error: 'sessão expirada' }, { status: 401 });
}
