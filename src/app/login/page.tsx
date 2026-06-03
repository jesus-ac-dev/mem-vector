'use client';

import { useActionState } from 'react';
import { signIn } from '@/modules/auth/auth.actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
    const [state, formAction, pending] = useActionState(signIn, null);

    return (
        <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
            <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
            <form action={formAction} className="flex flex-col gap-3">
                <Input name="email" type="email" placeholder="email" required />
                <Input name="password" type="password" placeholder="password" required />
                {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
                <Button type="submit" disabled={pending}>
                    {pending ? 'A entrar…' : 'Entrar'}
                </Button>
            </form>
        </main>
    );
}
