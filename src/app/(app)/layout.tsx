import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/layout/app-header';
import { IconRail } from '@/components/layout/icon-rail';

// Shell dos ecrãs autenticados (route group `(app)` — não muda a URL).
// Header em cima, rail de ícones à esquerda, conteúdo (futuro host dos panes)
// à direita. O proxy já garante que só chega aqui quem tem sessão.
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

    return (
        <div className="flex h-dvh flex-col">
            <AppHeader displayName={displayName} />
            <div className="flex flex-1 overflow-hidden">
                <IconRail />
                <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
        </div>
    );
}
