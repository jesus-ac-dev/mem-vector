import { ThemeToggle } from './theme-toggle';
import { ProfileMenu } from './profile-menu';
import { ProcuraInput } from './procura-input';

// Header da app (autenticado): logo+nome · input de procura (centro) · tema ·
// perfil. O input escreve no context; os resultados (#91) carregam no painel
// esquerdo, não num dropdown.
export function AppHeader({ displayName }: { displayName: string }) {
    return (
        <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
            <span className="font-semibold tracking-tight">mem-vector</span>
            <div className="flex-1">
                <ProcuraInput />
            </div>
            <ThemeToggle />
            <ProfileMenu displayName={displayName} />
        </header>
    );
}
