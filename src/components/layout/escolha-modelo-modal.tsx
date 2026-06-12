'use client';

import { useEffect, useState } from 'react';

import { runClientAction } from '@/lib/client-error-log';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { gravarDefinicoes, lerDefinicoes } from '@/modules/definicoes/definicoes.actions';
import { pedirDefinicoes } from '@/components/layout/definicoes-modal';
import {
    MODELOS_SUGERIDOS,
    PROVIDER_LABEL,
    PROVIDERS,
    type AgenteVista,
    type DefinicoesVista,
    type Provider,
} from '@/modules/definicoes/definicoes.schema';

// Mini-modal da ESCOLHA (#60 r4, design do Carlos): o link sobre o Enviar
// abre isto — escolher o provider (entre os parametrizados/ativos) e o modelo
// para o chat. Grava onChange; parametrizar novos providers (keys, testes) é
// trabalho da modal grande das Definições.

export function EscolhaModeloModal({
    open,
    onOpenChange,
    onEscolha,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEscolha: (provider: Provider, modelo?: string) => void;
}) {
    const [defs, setDefs] = useState<DefinicoesVista | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelado = false;
        void runClientAction(
            { area: 'escolha-modelo', action: 'lerDefinicoes' },
            lerDefinicoes,
        ).then((d) => {
            if (!cancelado && d) setDefs(d);
        });
        return () => {
            cancelado = true;
        };
    }, [open]);

    function gravar(novas: DefinicoesVista) {
        setDefs(novas);
        onEscolha(novas.chatProvider, novas.agentes[novas.chatProvider]?.modelo);
        void runClientAction({ area: 'escolha-modelo', action: 'gravarDefinicoes' }, () =>
            gravarDefinicoes({
                metodoDestilacao: novas.metodoDestilacao,
                modulosAtivos: novas.modulosAtivos,
                chatProvider: novas.chatProvider,
                agentes: Object.fromEntries(
                    (Object.entries(novas.agentes) as [Provider, AgenteVista][]).map(([p, a]) => [
                        p,
                        {
                            ativo: a.ativo,
                            modo: a.modo,
                            modelo: a.modelo,
                            esforco: a.esforco,
                            apiKey: undefined, // mantém as keys cifradas como estão
                        },
                    ]),
                ),
            }),
        ).then((r) => {
            if (r) setDefs(r);
        });
    }

    const ativos = defs ? PROVIDERS.filter((p) => defs.agentes[p]?.ativo) : [];
    const atual = defs?.agentes[defs.chatProvider];
    const sugeridos = defs ? MODELOS_SUGERIDOS[defs.chatProvider] : [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Quem responde ao chat</DialogTitle>
                    <DialogDescription>
                        Escolhe entre os agentes parametrizados nas Definições.
                    </DialogDescription>
                </DialogHeader>
                {!defs ? (
                    <p className="text-sm text-muted-foreground">A carregar…</p>
                ) : (
                    <div className="space-y-3">
                        <Select
                            value={defs.chatProvider}
                            onValueChange={(v) => gravar({ ...defs, chatProvider: v as Provider })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(ativos.length ? ativos : (['claude'] as Provider[])).map((p) => (
                                    <SelectItem key={p} value={p}>
                                        {PROVIDER_LABEL[p]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {sugeridos.length > 0 ? (
                            <Select
                                value={atual?.modelo ?? 'default'}
                                onValueChange={(m) =>
                                    gravar({
                                        ...defs,
                                        agentes: {
                                            ...defs.agentes,
                                            [defs.chatProvider]: {
                                                ...(atual ?? {
                                                    ativo: true,
                                                    modo: 'cli',
                                                    temApiKey: false,
                                                }),
                                                modelo: m === 'default' ? undefined : m,
                                            },
                                        },
                                    })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">modelo default</SelectItem>
                                    {sugeridos.map((m) => (
                                        <SelectItem key={m} value={m}>
                                            {m}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                value={atual?.modelo ?? ''}
                                onChange={(e) =>
                                    gravar({
                                        ...defs,
                                        agentes: {
                                            ...defs.agentes,
                                            [defs.chatProvider]: {
                                                ...(atual ?? {
                                                    ativo: true,
                                                    modo: 'cli',
                                                    temApiKey: false,
                                                }),
                                                modelo: e.target.value || undefined,
                                            },
                                        },
                                    })
                                }
                                placeholder="modelo (default)"
                            />
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                onOpenChange(false);
                                pedirDefinicoes('agentes');
                            }}
                            className="h-7 px-2 text-xs text-muted-foreground"
                        >
                            Parametrizar agentes nas Definições →
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
