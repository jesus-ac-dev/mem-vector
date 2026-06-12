import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/layout/app-header';
import { WorkspaceShell } from '@/components/layout/workspace-shell';
import { listarKnowledge } from '@/modules/knowledge/knowledge.service';
import { listarDailies } from '@/modules/daily/daily.service';
import { listarPastas } from '@/modules/folders/folders.service';
import { construirArvore } from '@/modules/folders/folders.tree';
import { garantirKernelCom } from '@/agent/kernel';
import { garantirPessoalCom, listarProjetosCom } from '@/modules/projetos/projetos.service';
import { dataPt } from '@/lib/datas';

// Shell dos ecrãs autenticados (route group `(app)` — não muda a URL).
// Header em cima + WorkspaceShell (client) com as 4 zonas Obsidian:
//   ribbon | sidebar esq. (colapsável) | main (rotas) | sidebar dir. (colapsável)
// O proxy já garante que só chega aqui quem tem sessão.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    let displayName = user?.email ?? '';
    if (user) {
        const { data } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .single();
        displayName = data?.display_name ?? user.email ?? '';
    }

    // Seed do Kernel (#36): a pasta e as notas iniciais nascem sozinhas no
    // primeiro carregamento (idempotente, 1 query quando já existe; arquivar a
    // pasta é opt-out respeitado). Antes do listar, para aparecer já na árvore.
    // Seed do Pessoal (#47): o projeto-vida nasce com o utilizador, igual.
    if (user) {
        await Promise.all([garantirKernelCom(supabase, user.id), garantirPessoalCom(supabase)]);
    }

    const [pastas, notas, dailies, projetos] = await Promise.all([
        listarPastas(),
        listarKnowledge(),
        listarDailies(),
        listarProjetosCom(supabase),
    ]);

    const arvore = construirArvore(
        pastas,
        notas.map((n) => ({
            id: n.id,
            slug: n.slug,
            title: n.title,
            folderId: n.folderId ?? null,
            tags: n.tags ?? [],
        })),
    );
    // Datas à portuguesa (#55): o slug/chave continua AAAA-MM-DD; só o título muda.
    const dailyItems = dailies.map((d) => ({ id: d.id, slug: d.dia, title: dataPt(d.dia) }));
    const diasComDaily = dailies.map((d) => d.dia);

    return (
        <div className="flex h-dvh flex-col">
            <AppHeader displayName={displayName} />
            {/* WorkspaceShell é client; recebe server children como prop — válido em Next.js */}
            <WorkspaceShell
                arvore={arvore}
                dailies={dailyItems}
                diasComDaily={diasComDaily}
                projetos={projetos.map((p) => ({ id: p.id, nome: p.nome }))}
            >
                {children}
            </WorkspaceShell>
        </div>
    );
}
