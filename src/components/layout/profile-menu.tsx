'use client';

import { useState } from 'react';

import { signOut } from '@/modules/auth/auth.actions';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { runClientAction } from '@/lib/client-error-log';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DefinicoesModal } from '@/components/layout/definicoes-modal';

export function ProfileMenu({ displayName }: { displayName: string }) {
    const initials = displayName.slice(0, 2).toUpperCase() || '?';
    // Definições (#60): a mega modal abre a partir do badge.
    const [definicoesAbertas, setDefinicoesAbertas] = useState(false);
    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full"
                        aria-label="Perfil"
                    >
                        <Avatar className="h-8 w-8">
                            <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDefinicoesAbertas(true)}>
                        Definições
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled>Perfil (em breve)</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() =>
                            void runClientAction(
                                { area: 'profile-menu', action: 'signOut' },
                                signOut,
                            )
                        }
                    >
                        Sair
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <DefinicoesModal open={definicoesAbertas} onOpenChange={setDefinicoesAbertas} />
        </>
    );
}
