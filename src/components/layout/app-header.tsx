import { ThemeToggle } from './theme-toggle';
import { ProfileMenu } from './profile-menu';

// Header da app (autenticado): logo+nome · tema · perfil. A procura (#91) vive no
// painel esquerdo (resultados carregam lá, não num dropdown do header).
export function AppHeader({ displayName }: { displayName: string }) {
    return (
        <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
            <span className="font-semibold tracking-tight">mem-vector</span>
            <div className="flex-1" />
            <ThemeToggle />
            <ProfileMenu displayName={displayName} />
        </header>
    );
}
