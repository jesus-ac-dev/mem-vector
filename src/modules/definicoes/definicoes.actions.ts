'use server';

import { DefinicoesSchema, type Definicoes } from './definicoes.schema';
import { gravarDefinicoesCom, lerDefinicoesCom } from './definicoes.service';
import { createClient } from '@/lib/supabase/server';

export async function lerDefinicoes(): Promise<Definicoes> {
    return lerDefinicoesCom(await createClient());
}

export async function gravarDefinicoes(input: unknown): Promise<Definicoes> {
    const dados = DefinicoesSchema.parse(input);
    return gravarDefinicoesCom(await createClient(), dados);
}
