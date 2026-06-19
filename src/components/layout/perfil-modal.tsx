'use client';

import { useRef, useState } from 'react';

import { runClientAction } from '@/lib/client-error-log';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    atualizarNome,
    atualizarEmail,
    atualizarPassword,
    atualizarAvatar,
} from '@/modules/perfil/perfil.actions';
import { validarAvatar, type PerfilVista } from '@/modules/perfil/perfil.schema';

// #92 perfil/conta: modal próprio (espelha a DefinicoesModal), aberto pelo item
// "Perfil" do menu. Nome → profiles; email/password → Supabase Auth; avatar →
// Storage. Pagamentos é placeholder até comercializar.
type Estado = { tipo: 'idle' } | { tipo: 'ok'; msg: string } | { tipo: 'erro'; msg: string };

export function PerfilModal({
    open,
    onOpenChange,
    perfil,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    perfil: PerfilVista;
}) {
    const [displayName, setDisplayName] = useState(perfil.displayName);
    const [email, setEmail] = useState(perfil.email);
    const [password, setPassword] = useState('');
    const [avatarUrl, setAvatarUrl] = useState(perfil.avatarUrl);
    const [estado, setEstado] = useState<Estado>({ tipo: 'idle' });
    const [aGravar, setAGravar] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const iniciais = displayName.slice(0, 2).toUpperCase() || '?';

    async function correr(
        area: string,
        fn: () => Promise<unknown>,
        msgOk: string | ((r: unknown) => string),
    ) {
        setAGravar(area);
        setEstado({ tipo: 'idle' });
        try {
            const r = await runClientAction({ area: 'perfil', action: area }, fn);
            setEstado({ tipo: 'ok', msg: typeof msgOk === 'function' ? msgOk(r) : msgOk });
        } catch (e) {
            setEstado({ tipo: 'erro', msg: e instanceof Error ? e.message : 'Falhou.' });
        } finally {
            setAGravar(null);
        }
    }

    async function escolherAvatar(file: File) {
        const v = validarAvatar({ type: file.type, size: file.size });
        if (!v.ok) {
            setEstado({ tipo: 'erro', msg: v.erro ?? 'Imagem inválida.' });
            return;
        }
        const fd = new FormData();
        fd.append('avatar', file);
        await correr(
            'avatar',
            async () => {
                const url = await atualizarAvatar(fd);
                setAvatarUrl(url);
            },
            'Avatar atualizado.',
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Perfil</DialogTitle>
                    <DialogDescription>A tua conta e identidade.</DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    {/* Avatar */}
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                            {avatarUrl ? <AvatarImage src={avatarUrl} alt="Avatar" /> : null}
                            <AvatarFallback>{iniciais}</AvatarFallback>
                        </Avatar>
                        <div>
                            {/* eslint-disable-next-line no-restricted-syntax -- file input sem componente shadcn, ver .claude/skills/padroes-ui.md */}
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void escolherAvatar(f);
                                    e.target.value = '';
                                }}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={aGravar === 'avatar'}
                                onClick={() => fileRef.current?.click()}
                            >
                                {aGravar === 'avatar' ? 'A enviar…' : 'Mudar avatar'}
                            </Button>
                            <p className="mt-1 text-xs text-muted-foreground">
                                PNG, JPG ou WebP, até 2 MB.
                            </p>
                        </div>
                    </div>

                    {/* Nome */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Nome</label>
                        <div className="flex gap-2">
                            <Input
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                            />
                            <Button
                                disabled={aGravar === 'nome' || !displayName.trim()}
                                onClick={() =>
                                    void correr(
                                        'nome',
                                        () => atualizarNome({ displayName }),
                                        'Nome guardado.',
                                    )
                                }
                            >
                                Guardar
                            </Button>
                        </div>
                    </div>

                    {/* Email — é o login (#92): a mensagem segue o que o Supabase fez
                        mesmo (pendente de confirmação vs mudança imediata). */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Email</label>
                        <div className="flex gap-2">
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                            <Button
                                disabled={aGravar === 'email' || email === perfil.email}
                                onClick={() =>
                                    void correr(
                                        'email',
                                        () => atualizarEmail({ email }),
                                        (r) =>
                                            (r as { pendente: boolean }).pendente
                                                ? 'Confirma no email novo para efetivar o novo login.'
                                                : 'Email alterado — passas a entrar com o novo.',
                                    )
                                }
                            >
                                Guardar
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">O email é o teu login.</p>
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Nova password</label>
                        <div className="flex gap-2">
                            <Input
                                type="password"
                                value={password}
                                placeholder="Mínimo 8 caracteres"
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <Button
                                disabled={aGravar === 'password' || password.length < 8}
                                onClick={() =>
                                    void correr(
                                        'password',
                                        async () => {
                                            await atualizarPassword({ password });
                                            setPassword('');
                                        },
                                        'Password alterada.',
                                    )
                                }
                            >
                                Guardar
                            </Button>
                        </div>
                    </div>

                    {estado.tipo !== 'idle' ? (
                        <p
                            className={
                                estado.tipo === 'ok'
                                    ? 'text-sm text-muted-foreground'
                                    : 'text-sm text-destructive'
                            }
                        >
                            {estado.msg}
                        </p>
                    ) : null}

                    <hr className="border-border" />

                    {/* Pagamentos: placeholder (vendas vêm depois). */}
                    <div className="space-y-1">
                        <h3 className="text-sm font-medium">Pagamentos</h3>
                        <p className="text-sm text-muted-foreground">
                            Subscrição e faturação ficam disponíveis quando o produto for
                            comercializado.
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
