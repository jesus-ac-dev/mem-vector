import { ThemeToggle } from './theme-toggle';
import { ProfileMenu } from './profile-menu';
import { BarraProcura } from './barra-procura';

// Header da app (autenticado): logo+nome · procura (#91) · tema · perfil.
export function AppHeader({ displayName }: { displayName: string }) {
    return (
        <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
            <span className="font-semibold tracking-tight">mem-vector</span>
            <div className="flex-1">
                <BarraProcura />
            </div>
            <ThemeToggle />
            <ProfileMenu displayName={displayName} />
        </header>
    );
}
