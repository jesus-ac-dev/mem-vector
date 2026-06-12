import type { SupabaseClient } from '@supabase/supabase-js';

import { PROJETO_PESSOAL, type NovoProjeto, type Projeto } from './projetos.schema';

// Serviço de projetos (#47). A regra central vive em `resolverProjetoCom`:
// um NOME (do quick-add ou do agente) resolve sempre para um id real —
// encontra case-insensitive, cria se não existir, e sem nome cai no Pessoal.
// Projeto é uma PASTA real do knowledge (retificação do Carlos): criar um
// projeto cria/aproveita a pasta root homónima — o agente escreve lá dentro.

const COLUNAS = 'id, nome, descricao, folder_id, created_at';

interface ProjetoRow {
    id: string;
    nome: string;
    descricao: string | null;
    folder_id: string | null;
    created_at: string;
}

function toProjeto(r: ProjetoRow): Projeto {
    return {
        id: r.id,
        nome: r.nome,
        descricao: r.descricao,
        folderId: r.folder_id,
        criadoEm: r.created_at,
    };
}

export async function listarProjetosCom(db: SupabaseClient): Promise<Projeto[]> {
    const { data, error } = await db.from('projetos').select(COLUNAS).order('nome');
    if (error) throw new Error(`listar projetos falhou: ${error.message}`);
    return ((data ?? []) as ProjetoRow[]).map(toProjeto);
}

// Pasta root do projeto: aproveita a homónima se existir (não duplicar),
// senão cria. O nome único por nível já é regra dos folders.
async function pastaDoProjetoCom(
    db: SupabaseClient,
    ownerId: string,
    nome: string,
): Promise<string> {
    const { data: existente, error: e1 } = await db
        .from('folders')
        .select('id')
        .is('parent_id', null)
        .ilike('name', nome)
        .maybeSingle();
    if (e1) throw new Error(`procurar pasta do projeto falhou: ${e1.message}`);
    if (existente) return (existente as { id: string }).id;

    const { data, error } = await db
        .from('folders')
        .insert({ owner_id: ownerId, name: nome, parent_id: null })
        .select('id')
        .single();
    if (error || !data) throw new Error(`criar pasta do projeto falhou: ${error?.message ?? '?'}`);
    return (data as { id: string }).id;
}

export async function criarProjetoCom(db: SupabaseClient, input: NovoProjeto): Promise<Projeto> {
    const {
        data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error('sem sessão');

    const nome = input.nome.trim();
    const folderId = await pastaDoProjetoCom(db, user.id, nome);

    const { data, error } = await db
        .from('projetos')
        .insert({
            owner_id: user.id,
            nome,
            descricao: input.descricao ?? null,
            folder_id: folderId,
        })
        .select(COLUNAS)
        .single();
    if (error || !data) {
        // Nome já existe (índice único case-insensitive): devolve o existente —
        // criar um projeto que já há não é erro, é convergência.
        if (error?.code === '23505') {
            const existente = await encontrarPorNomeCom(db, nome);
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
