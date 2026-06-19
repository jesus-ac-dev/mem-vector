'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { runClientAction } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { completarOnboarding } from '@/modules/onboarding/onboarding.actions';
import { pedirDefinicoes } from '@/components/layout/definicoes/definicoes-modal';

// Onboarding (#40): wizard sequencial (página por pergunta) que nasce no 1.º
// login de um user fresh — reusa o chassis Dialog das Definições, mas linear.
// As respostas preenchem as notas pessoais do Kernel (Sobre mim, Prioridades,
// Regras do agente). Reabre enquanto o pessoal não existir.
const PASSOS = [
    {
        chave: 'sobreMim' as const,
        titulo: 'Quem és tu?',
        ajuda: 'Cargo, contexto, como queres ser tratado — o agente usa isto para te conhecer.',
        placeholder: 'Ex.: Sou o/a..., trabalho em... . Trata-me por tu.',
    },
    {
        chave: 'prioridades' as const,
        titulo: 'Quais são as tuas prioridades?',
        ajuda: 'No que estás focado agora — ajuda o agente a saber o que importa.',
        placeholder: 'Ex.: este trimestre estou focado em...',
    },
    {
        chave: 'regras' as const,
        titulo: 'Como queres que o agente trabalhe?',
        ajuda: 'Tom, língua, hábitos — as regras da casa para o teu agente.',
        placeholder: 'Ex.: português, direto, sem rodeios; regista decisões...',
    },
];

const VAZIO = { sobreMim: '', prioridades: '', regras: '' };

export function OnboardingWizard({ precisaOnboarding }: { precisaOnboarding: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(true);
    const [passo, setPasso] = useState(0);
    const [respostas, setRespostas] = useState(VAZIO);
    const [aGravar, setAGravar] = useState(false);

    if (!precisaOnboarding) return null;

    const atual = PASSOS[passo];
    const valor = respostas[atual.chave];
    const ultimo = passo === PASSOS.length - 1;
    const podeAvancar = valor.trim().length > 0;

    async function concluir() {
        setAGravar(true);
        const ok = await runClientAction({ area: 'onboarding', action: 'completar' }, () =>
            completarOnboarding(respostas),
        );
        setAGravar(false);
        if (ok) {
            setOpen(false);
            // Caminho (a): a seguir ao onboarding, o user configura as ligações.
            // Abrir as Definições e refrescar só DEPOIS de este Dialog fechar —
            // no mesmo tick, dois Dialogs Radix trocam o lock de pointer-events
            // (e o refresh desmonta este a meio) e o overlay ficava preso.
            setTimeout(() => {
                pedirDefinicoes('agentes');
                router.refresh();
            }, 250);
        }
    }

    return (
        // Não-dismissable: o onboarding não fecha a meio (sem X, sem Esc/clique
        // fora — `[&>button]:hidden` esconde o X do DialogContent). Só sai ao
        // concluir; o objetivo é o Kernel nascer preenchido.
        <Dialog open={open} onOpenChange={() => undefined}>
            <DialogContent className="max-w-2xl [&>button]:hidden">
                <DialogHeader>
                    <DialogTitle>{atual.titulo}</DialogTitle>
                    <DialogDescription>
                        Passo {passo + 1} de {PASSOS.length} — {atual.ajuda}
                    </DialogDescription>
                </DialogHeader>
                <Textarea
                    value={valor}
                    onChange={(e) => setRespostas((r) => ({ ...r, [atual.chave]: e.target.value }))}
                    placeholder={atual.placeholder}
                    rows={8}
                    autoFocus
                />
                <div className="flex justify-between">
                    <Button
                        variant="ghost"
                        onClick={() => setPasso((p) => p - 1)}
                        disabled={passo === 0 || aGravar}
                    >
                        Anterior
                    </Button>
                    {ultimo ? (
                        <Button onClick={() => void concluir()} disabled={!podeAvancar || aGravar}>
                            {aGravar ? 'A guardar…' : 'Concluir'}
                        </Button>
                    ) : (
                        <Button onClick={() => setPasso((p) => p + 1)} disabled={!podeAvancar}>
                            Próximo
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
