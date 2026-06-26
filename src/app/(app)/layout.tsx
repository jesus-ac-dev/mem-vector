import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/layout/workspace/app-header';
import { WorkspaceShell } from '@/components/layout/workspace/workspace-shell';
import { ProcuraProvider } from '@/components/layout/procura/procura-context';
import { OnboardingWizard } from '@/components/layout/onboarding/onboarding-wizard';
import { listarKnowledgeCom } from '@/modules/knowledge/knowledge.service';
import { listarDailiesCom } from '@/modules/daily/daily.service';
import { listarPastasCom } from '@/modules/folders/folders.service';
import { construirArvore } from '@/modules/folders/folders.tree';
import { garantirKernelCom, precisaOnboardingCom } from '@/agent/kernel';
import { garantirPessoalCom, listarProjetosCom } from '@/modules/projetos/projetos.service';
import { dataPt } from '@/lib/datas';

// Shell dos ecrãs autenticados (route group `(app)` — não muda a URL).
// Header em cima + WorkspaceShell (client) com as 4 zonas Obsidian:
//   ribbon | sidebar esq. (colapsável) | main (rotas) | sidebar dir. (colapsável)
// O proxy filtra quem não tem cookies de auth; se houver cookie mas getUser falhar,
// este layout mostra fallback em vez de fazer kick agressivo para /login.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
                <div className="max-w-md space-y-4">
                    <h1 className="text-xl font-semibold">Sessão por validar</h1>
                    <p className="text-sm text-muted-foreground">
                        A sessão não foi confirmada neste pedido. Recarrega a página; se continuar,
                        entra novamente.
                    </p>
                    <div className="flex gap-3 text-sm">
                        <a className="font-medium underline underline-offset-4" href=".">
                            Recarregar
                        </a>
                        <a className="font-medium underline underline-offset-4" href="/login">
                            Entrar novamente
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    let displayName = user?.email ?? '';
    let avatarUrl: string | null = null;
    const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .single();
    displayName = data?.display_name ?? user.email ?? '';
    avatarUrl = (data?.avatar_url as string | null) ?? null;
    const perfil = { displayName, email: user.email ?? '', avatarUrl };

    // Seed do Kernel (#36): a pasta e as notas iniciais nascem sozinhas no
    // primeiro carregamento (idempotente, 1 query quando já existe; arquivar a
    // pasta é opt-out respeitado). Antes do listar, para aparecer já na árvore.
    // Seed do Pessoal (#47): o projeto-vida nasce com o utilizador, igual.
    await Promise.all([garantirKernelCom(supabase, user.id), garantirPessoalCom(supabase)]);
    // Onboarding (#40): um user fresh nasce com o Kernel só em Mythos Base (sem
    // "Sobre mim") e cai no wizard que preenche o pessoal; o dono (seed:user) já
    // nasce com o pessoal e não o vê.
    const precisaOnboarding = await precisaOnboardingCom(supabase, user.id);

    const [pastas, notas, dailies, projetos] = await Promise.all([
        listarPastasCom(supabase),
        listarKnowledgeCom(supabase),
        listarDailiesCom(supabase),
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
            {/* ProcuraProvider envolve header (input) + shell (resultados no painel) — #91 */}
            <ProcuraProvider>
                <AppHeader perfil={perfil} />
                {/* WorkspaceShell é client; recebe server children como prop — válido em Next.js */}
                <WorkspaceShell
                    arvore={arvore}
                    dailies={dailyItems}
                    diasComDaily={diasComDaily}
                    projetos={projetos.map((p) => ({
                        id: p.id,
                        nome: p.nome,
                        folderId: p.folderId,
                    }))}
                >
                    {children}
                </WorkspaceShell>
            </ProcuraProvider>
            <OnboardingWizard precisaOnboarding={precisaOnboarding} />
        </div>
    );
}
