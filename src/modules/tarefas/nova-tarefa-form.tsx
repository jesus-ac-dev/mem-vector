'use client';

import { useState, useTransition } from 'react';
import { criarTarefa } from './tarefas.actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface GrupoOpt {
    id: string;
    nome: string;
}

export function NovaTarefaForm({ grupos }: { grupos: GrupoOpt[] }) {
    const [titulo, setTitulo] = useState('');
    const [visibility, setVisibility] = useState<'privado' | 'protected'>('privado');
    const [groupId, setGroupId] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    function submit(e: React.FormEvent) {
        e.preventDefault();
        setErro(null);
        startTransition(async () => {
            try {
                await criarTarefa({
                    titulo,
                    visibility,
                    groupId: visibility === 'protected' ? groupId : undefined,
                });
                setTitulo('');
                setVisibility('privado');
                setGroupId('');
            } catch (err) {
                setErro(err instanceof Error ? err.message : 'Erro a criar tarefa');
            }
        });
    }

    return (
        <form onSubmit={submit} className="mb-6 flex flex-col gap-2">
            <div className="flex gap-2">
                <Input
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Nova tarefa…"
                    className="flex-1"
                    required
                />
                <Button type="submit" disabled={pending}>
                    Adicionar
                </Button>
            </div>
            <div className="flex gap-2">
                <Select
                    value={visibility}
                    onValueChange={(v) => setVisibility(v as 'privado' | 'protected')}
                >
                    <SelectTrigger className="w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="privado">Privado</SelectItem>
                        <SelectItem value="protected" disabled={grupos.length === 0}>
                            Protegido (grupo)
                        </SelectItem>
                    </SelectContent>
                </Select>
                {visibility === 'protected' && (
                    <Select value={groupId} onValueChange={setGroupId}>
                        <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Escolhe um grupo" />
                        </SelectTrigger>
                        <SelectContent>
                            {grupos.map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                    {g.nome}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
        </form>
    );
}
