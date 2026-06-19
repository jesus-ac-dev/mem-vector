'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
    const { setTheme, resolvedTheme } = useTheme();
    return (
        <Button
            variant="ghost"
            size="icon"
            aria-label="Alternar tema claro/escuro"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" />
        </Button>
    );
}
