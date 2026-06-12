'use server';

import { NovoProjetoSchema, type Projeto } from './projetos.schema';
import { criarProjetoCom, listarProjetosCom } from './projetos.service';
import { createClient } from '@/lib/supabase/server';

export async function listarProjetos(): Promise<Projeto[]> {
    return listarProjetosCom(await createClient());
}

export async function criarProjeto(input: unknown): Promise<Projeto> {
    const dados = NovoProjetoSchema.parse(input);
    return criarProjetoCom(await createClient(), dados);
}
