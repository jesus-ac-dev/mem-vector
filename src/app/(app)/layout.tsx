import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/layout/app-header';
import { WorkspaceShell } from '@/components/layout/workspace-shell';
import { listarKnowledge } from '@/modules/knowledge/knowledge.service';
import { listarDailies } from '@/modules/daily/daily.service';
import { listarPastas } from '@/modules/folders/folders.service';
import { construirArvore } from '@/modules/folders/folders.tree';

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

    const [pastas, notas, dailies] = await Promise.all([
        listarPastas(),
        listarKnowledge(),
        listarDailies(),
    ]);

    const arvore = construirArvore(
        pastas,
        notas.map((n) => ({
            id: n.id,
            slug: n.slug,
            title: n.title,
            folderId: n.folderId ?? null,
        })),
    );
    const dailyItems = dailies.map((d) => ({ id: d.id, slug: d.dia, title: d.dia }));
    const diasComDaily = dailies.map((d) => d.dia);

    return (
        <div className="flex h-dvh flex-col">
            <AppHeader displayName={displayName} />
            {/* WorkspaceShell é client; recebe server children como prop — válido em Next.js */}
            <WorkspaceShell arvore={arvore} dailies={dailyItems} diasComDaily={diasComDaily}>
                {children}
            </WorkspaceShell>
        </div>
    );
}
