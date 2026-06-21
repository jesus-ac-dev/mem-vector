'use client';

import { useState } from 'react';

import { signOut } from '@/modules/auth/auth.actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { DefinicoesModal } from '@/components/layout/definicoes/definicoes-modal';
import { PerfilModal } from '@/components/layout/perfil/perfil-modal';
import type { PerfilVista } from '@/modules/perfil/perfil.schema';

export function ProfileMenu({ perfil }: { perfil: PerfilVista }) {
    const initials = perfil.displayName.slice(0, 2).toUpperCase() || '?';
    // Definições (#60) e Perfil (#92) abrem a partir do badge.
    const [definicoesAbertas, setDefinicoesAbertas] = useState(false);
    const [perfilAberto, setPerfilAberto] = useState(false);
    return (
        <>
            {/* modal={false}: o menu não tranca o pointer-events do body. Sem isto,
                abrir um Dialog (Definições/Perfil) a partir de um item deixava o
                body com `pointer-events: none` preso ao fechar — app não-clicável
                (Radix: dois overlays modais a pisar a gestão do body). */}
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full"
                        aria-label="Perfil"
                    >
                        <Avatar className="h-8 w-8">
                            {perfil.avatarUrl ? (
                                <AvatarImage src={perfil.avatarUrl} alt="Avatar" />
                            ) : null}
                            <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="truncate">{perfil.displayName}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setPerfilAberto(true)}>
                        Perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDefinicoesAbertas(true)}>
                        Definições
                    </DropdownMenuItem>
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
            <PerfilModal open={perfilAberto} onOpenChange={setPerfilAberto} perfil={perfil} />
            <DefinicoesModal open={definicoesAbertas} onOpenChange={setDefinicoesAbertas} />
        </>
    );
}
