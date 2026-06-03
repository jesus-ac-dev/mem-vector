import { ThemeToggle } from './theme-toggle';
import { ProfileMenu } from './profile-menu';

// Header da app (autenticado): logo+nome · search (slot reservado) · tema · perfil.
// O search liga-se quando houver conteúdo para procurar (slice futura).
export function AppHeader({ displayName }: { displayName: string }) {
    return (
        <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
            <span className="font-semibold tracking-tight">mem-vector</span>
            <div className="flex-1">
                <div className="mx-auto h-9 max-w-md rounded-md border border-input bg-muted/40 px-3 text-sm leading-9 text-muted-foreground">
                    Procurar… (em breve)
                </div>
            </div>
            <ThemeToggle />
            <ProfileMenu displayName={displayName} />
        </header>
    );
}
