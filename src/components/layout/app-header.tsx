import { ThemeToggle } from './theme-toggle';
import { ProfileMenu } from './profile-menu';
import { ProcuraInput } from './procura-input';
import type { PerfilVista } from '@/modules/perfil/perfil.schema';

// Header da app (autenticado): logo+nome · input de procura (centro) · tema ·
// perfil. O input escreve no context; os resultados (#91) carregam no painel
// esquerdo, não num dropdown.
export function AppHeader({ perfil }: { perfil: PerfilVista }) {
    return (
        <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
            <span className="font-semibold tracking-tight">mem-vector</span>
            <div className="flex-1">
                <ProcuraInput />
            </div>
            <ThemeToggle />
            <ProfileMenu perfil={perfil} />
        </header>
    );
}
