import type { SupabaseClient } from '@supabase/supabase-js';

import { PROJETO_PESSOAL, type NovoProjeto, type Projeto } from './projetos.schema';

// Serviço de projetos (#47). A regra central vive em `resolverProjetoCom`:
// um NOME (do quick-add ou do agente) resolve sempre para um id real —
// encontra case-insensitive, cria se não existir, e sem nome cai no Pessoal.

const COLUNAS = 'id, nome, descricao, created_at';

interface ProjetoRow {
    id: string;
    nome: string;
    descricao: string | null;
    created_at: string;
}

function toProjeto(r: ProjetoRow): Projeto {
    return { id: r.id, nome: r.nome, descricao: r.descricao, criadoEm: r.created_at };
}

export async function listarProjetosCom(db: SupabaseClient): Promise<Projeto[]> {
    const { data, error } = await db.from('projetos').select(COLUNAS).order('nome');
    if (error) throw new Error(`listar projetos falhou: ${error.message}`);
    return ((data ?? []) as ProjetoRow[]).map(toProjeto);
}

export async function criarProjetoCom(db: SupabaseClient, input: NovoProjeto): Promise<Projeto> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const { data, error } = await db
        .from('projetos')
        .insert({
            owner_id: user.id,
            nome: input.nome.trim(),
            descricao: input.descricao ?? null,
        })
        .select(COLUNAS)
        .single();
    if (error || !data) {
        // Nome já existe (índice único case-insensitive): devolve o existente —
        // criar um projeto que já há não é erro, é convergência.
        if (error?.code === '23505') {
            const existente = await encontrarPorNomeCom(db, input.nome);
            if (existente) return existente;
        }
        throw new Error(`criar projeto falhou: ${error?.message ?? 'sem dados'}`);
    }
    return toProjeto(data as ProjetoRow);
}

async function encontrarPorNomeCom(db: SupabaseClient, nome: string): Promise<Projeto | null> {
    const { data, error } = await db
        .from('projetos')
        .select(COLUNAS)
        .ilike('nome', nome.trim())
        .maybeSingle();
    if (error) throw new Error(`procurar projeto falhou: ${error.message}`);
    return data ? toProjeto(data as ProjetoRow) : null;
}

/** Nome (opcional) → id real. Encontra case-insensitive, cria se não existir;
 *  sem nome resolve para o Pessoal (criado se preciso). */
export async function resolverProjetoCom(
    db: SupabaseClient,
    nome?: string | null,
): Promise<Projeto> {
    const alvo = nome?.trim() || PROJETO_PESSOAL;
    const existente = await encontrarPorNomeCom(db, alvo);
    if (existente) return existente;
    return criarProjetoCom(db, { nome: alvo });
}

/** Seed do projeto-vida (#47): "Pessoal" nasce com o utilizador, como o Kernel.
 *  Idempotente — 1 query quando já existe. */
export async function garantirPessoalCom(db: SupabaseClient): Promise<void> {
    const existente = await encontrarPorNomeCom(db, PROJETO_PESSOAL);
    if (existente) return;
    await criarProjetoCom(db, {
        nome: PROJETO_PESSOAL,
        descricao: 'A vida é um projeto — o default de tudo o que não tem outro sítio.',
    });
}
