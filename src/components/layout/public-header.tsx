import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './theme-toggle';

// Header público (não-logado): logo+nome à esquerda, nav à direita.
// Home/Serviços/Price enchem quando a landing crescer; só o Login é real agora.
export function PublicHeader() {
    return (
        <header className="flex h-14 items-center justify-between border-b px-4">
            <span className="font-semibold tracking-tight">mem-vector</span>
            <nav className="flex items-center gap-1">
                <ThemeToggle />
                <Button asChild variant="ghost">
                    <Link href="/login">Login</Link>
                </Button>
            </nav>
        </header>
    );
}
