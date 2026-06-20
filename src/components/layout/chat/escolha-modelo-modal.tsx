'use client';

import { useEffect, useState } from 'react';

import { runClientAction } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
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
import { gravarEscolhaChat } from '@/modules/definicoes/definicoes.actions';
import { getJson } from '@/lib/api-get';
import { pedirDefinicoes } from '@/components/layout/definicoes/definicoes-modal';
import { ProviderIcon } from '@/components/layout/chat/provider-icon';
import {
    ESFORCOS,
    MODELOS_SUGERIDOS,
    PROVIDER_LABEL,
    PROVIDERS,
    type AgenteVista,
    type DefinicoesVista,
    type Esforco,
    type Provider,
} from '@/modules/definicoes/definicoes.schema';

// Mini-modal da ESCOLHA (#60 r4/r5, design do Carlos): o link sobre o Enviar
// abre isto — provider (entre os parametrizados/ativos), modelo (da lista
// descoberta pelo Testar ligação; sem texto livre) e esforço (onde o provider
// o aceita). Grava onChange; parametrizar é trabalho da modal das Definições.

const PROVIDERS_COM_ESFORCO: Provider[] = ['codex'];

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
        void runClientAction({ area: 'escolha-modelo', action: 'lerDefinicoes' }, () =>
            getJson<DefinicoesVista>('/api/definicoes'),
        ).then((d) => {
            if (!cancelado && d) setDefs(d);
        });
        return () => {
            cancelado = true;
        };
    }, [open]);

    // Escolha CIRÚRGICA (r13): só viaja o provider + modelo/esforço dele
    // (null = limpar, undefined = manter). A versão anterior regravava TODOS
    // os agentes a partir do estado local — com estado stale, esmagava
    // modo/config gravados por fora. Um escritor por estado.
    function escolher(campos: {
        provider?: Provider;
        modelo?: string | null;
        esforco?: Esforco | null;
    }) {
        if (!defs) return;
        const provider = campos.provider ?? defs.chatProvider;
        const atual: AgenteVista = defs.agentes[provider] ?? {
            ativo: true,
            modo: 'cli' as const,
            temApiKey: false,
        };
        const novoAgente: AgenteVista = {
            ...atual,
            ...(campos.modelo !== undefined ? { modelo: campos.modelo ?? undefined } : {}),
            ...(campos.esforco !== undefined ? { esforco: campos.esforco ?? undefined } : {}),
        };
        setDefs({
            ...defs,
            chatProvider: provider,
            agentes: { ...defs.agentes, [provider]: novoAgente },
        });
        onEscolha(provider, novoAgente.modelo);
        void runClientAction({ area: 'escolha-modelo', action: 'gravarEscolhaChat' }, () =>
            gravarEscolhaChat({ provider, modelo: campos.modelo, esforco: campos.esforco }),
        );
    }

    const ativos = defs ? PROVIDERS.filter((p) => defs.agentes[p]?.ativo) : [];
    const atual = defs?.agentes[defs.chatProvider];
    // Lista descoberta pelo Testar ligação; fallback curado até lá.
    const modelos = defs
        ? atual?.modelos?.length
            ? atual.modelos
            : MODELOS_SUGERIDOS[defs.chatProvider]
        : [];

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
                            onValueChange={(v) => escolher({ provider: v as Provider })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {ativos.map((p) => (
                                    <SelectItem key={p} value={p}>
                                        <span className="flex items-center gap-2">
                                            <ProviderIcon provider={p} className="h-5 w-5" />
                                            {PROVIDER_LABEL[p]}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={atual?.modelo ?? 'default'}
                            onValueChange={(m) => escolher({ modelo: m === 'default' ? null : m })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="default">modelo default</SelectItem>
                                {modelos.map((m) => (
                                    <SelectItem key={m} value={m}>
                                        {m}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {!atual?.modelos?.length && (
                            <p className="text-xs text-muted-foreground">
                                Lista curada — corre &quot;Testar ligação&quot; nas Definições para
                                descobrir os modelos reais do provider.
                            </p>
                        )}

                        {PROVIDERS_COM_ESFORCO.includes(defs.chatProvider) && (
                            <Select
                                value={atual?.esforco ?? 'default'}
                                onValueChange={(v) =>
                                    escolher({
                                        esforco: v === 'default' ? null : (v as Esforco),
                                    })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">esforço default</SelectItem>
                                    {ESFORCOS.map((e) => (
                                        <SelectItem key={e} value={e}>
                                            {e}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
