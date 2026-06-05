import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/layout/app-header';
import { IconRail } from '@/components/layout/icon-rail';
import { FileExplorer, knowledgeToFolder } from '@/components/layout/file-explorer';
import { listarKnowledge } from '@/modules/knowledge/knowledge.service';
import { listarDailies } from '@/modules/daily/daily.service';

// Shell dos ecrãs autenticados (route group `(app)` — não muda a URL).
// Header em cima, depois: icon rail | file explorer | conteúdo (flex-1).
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

    const notas = await listarKnowledge();
    const dailies = await listarDailies();

    const folders = [
        knowledgeToFolder(notas),
        {
            label: 'Daily Notes',
            basePath: '/daily',
            items: dailies.map((d) => ({ id: d.id, slug: d.dia, title: d.dia })),
        },
    ];

    return (
        <div className="flex h-dvh flex-col">
            <AppHeader displayName={displayName} />
            <div className="flex flex-1 overflow-hidden">
                <IconRail />
                {/* File explorer — fixed width, independent scroll */}
                <aside className="w-60 shrink-0 overflow-hidden border-r">
                    <FileExplorer folders={folders} />
                </aside>
                <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
        </div>
    );
}
