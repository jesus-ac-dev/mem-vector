'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { runClientAction } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
import {
    DEFINICOES_DEFAULT,
    MODULO_LABEL,
    MODULOS,
    type Definicoes,
    type MetodoDestilacao,
    type Modulo,
} from '@/modules/definicoes/definicoes.schema';

// Mega modal das definições (#60, design do Carlos): menu lateral à esquerda,
// forms à direita. Secções principais: Agentes e Módulos; módulo ativo ganha
// grupo próprio no menu com a página de configuração dele por baixo.

type Pagina = 'agentes' | 'modulos' | Modulo;

// Emails está reservado (toggle desativado até o módulo existir).
const MODULOS_DISPONIVEIS: Record<Modulo, boolean> = { github: true, emails: false };

const MODULO_DESCRICAO: Record<Modulo, string> = {
    github: 'Importa projetos e issues dos teus repositórios (read-only primeiro).',
    emails: 'Caixa de entrada no workspace — há de vir.',
};

export function DefinicoesModal({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [pagina, setPagina] = useState<Pagina>('agentes');
    const [definicoes, setDefinicoes] = useState<Definicoes>(DEFINICOES_DEFAULT);
    const [carregado, setCarregado] = useState(false);
    const [gravado, setGravado] = useState(false);

    // Reset ao abrir — derive-no-render (o lint da casa não deixa setState
    // síncrono no corpo de um effect).
    const [ultimoOpen, setUltimoOpen] = useState(open);
    if (open !== ultimoOpen) {
        setUltimoOpen(open);
        if (open) {
            setGravado(false);
            setCarregado(false);
        }
    }

    useEffect(() => {
        if (!open) return;
        let cancelado = false;
        void runClientAction({ area: 'definicoes', action: 'lerDefinicoes' }, lerDefinicoes).then(
            (d) => {
                if (cancelado || !d) return;
                setDefinicoes(d);
                setCarregado(true);
            },
        );
        return () => {
            cancelado = true;
        };
    }, [open]);

    // Gravação imediata (sem botão por opção): cada mudança persiste já e o
    // rodapé confirma — numa modal de toggles, "Guardar" só adiava o óbvio.
    function gravar(novas: Definicoes) {
        setDefinicoes(novas);
        setGravado(false);
        void runClientAction({ area: 'definicoes', action: 'gravarDefinicoes' }, () =>
            gravarDefinicoes(novas),
        ).then((r) => {
            if (r) setGravado(true);
        });
    }

    function toggleModulo(m: Modulo, ativo: boolean) {
        const set = new Set(definicoes.modulosAtivos);
        if (ativo) set.add(m);
        else set.delete(m);
        gravar({ ...definicoes, modulosAtivos: [...set] });
        if (!ativo && pagina === m) setPagina('modulos');
    }

    const itemMenu = (id: Pagina, label: string, grupo = false) => (
        <Button
            key={id}
            type="button"
            variant="ghost"
            onClick={() => setPagina(id)}
            className={cn(
                'h-auto w-full justify-start rounded px-2 py-1.5 text-left text-sm font-normal',
                grupo && 'pl-5 text-xs',
                pagina === id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
        >
            {label}
        </Button>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="grid h-[34rem] max-w-3xl grid-rows-[auto,1fr] gap-0 p-0">
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle>Definições</DialogTitle>
                    <DialogDescription>
                        Agentes e módulos deste workspace.
                        {gravado && <span className="ml-2 text-primary">Guardado.</span>}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid min-h-0 grid-cols-[11rem,1fr]">
                    {/* Menu lateral */}
                    <nav className="space-y-0.5 overflow-y-auto border-r p-3">
                        <p className="px-2 pb-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                            Principais
                        </p>
                        {itemMenu('agentes', 'Agentes')}
                        {itemMenu('modulos', 'Módulos')}
                        {definicoes.modulosAtivos.length > 0 && (
                            <>
                                <p className="px-2 pb-1 pt-3 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                                    Módulos ativos
                                </p>
                                {definicoes.modulosAtivos.map((m) =>
                                    itemMenu(m, MODULO_LABEL[m], true),
                                )}
                            </>
                        )}
                    </nav>

                    {/* Form da página ativa */}
                    <div className="overflow-y-auto p-6">
                        {!carregado ? (
                            <p className="text-sm text-muted-foreground">A carregar…</p>
                        ) : pagina === 'agentes' ? (
                            <div className="max-w-md space-y-4">
                                <div>
                                    <h3 className="text-sm font-medium">Método de destilação</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Como o agente-autor processa cada turno do chat. O one-shot
                                        decide tudo numa chamada (rápido, ~¼ do custo); o agentic
                                        abre uma sessão com tools — lê as notas antes de escrever,
                                        ao custo de ser ~4× mais lento e caro.
                                    </p>
                                </div>
                                <Select
                                    value={definicoes.metodoDestilacao}
                                    onValueChange={(v) =>
                                        gravar({
                                            ...definicoes,
                                            metodoDestilacao: v as MetodoDestilacao,
                                        })
                                    }
                                >
                                    <SelectTrigger className="w-64">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="one-shot">
                                            One-shot (recomendado)
                                        </SelectItem>
                                        <SelectItem value="agentic">
                                            Agentic (lê antes de escrever)
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Modelos e personalidade do agente chegam aqui mais tarde.
                                </p>
                            </div>
                        ) : pagina === 'modulos' ? (
                            <div className="max-w-md space-y-4">
                                <div>
                                    <h3 className="text-sm font-medium">Módulos</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Liga um módulo para ele ganhar página própria no menu ao
                                        lado.
                                    </p>
                                </div>
                                <ul className="space-y-3">
                                    {MODULOS.map((m) => (
                                        <li
                                            key={m}
                                            className="flex items-center justify-between gap-4 rounded-md border p-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium">
                                                    {MODULO_LABEL[m]}
                                                    {!MODULOS_DISPONIVEIS[m] && (
                                                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                            em breve
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {MODULO_DESCRICAO[m]}
                                                </p>
                                            </div>
                                            <Switch
                                                checked={definicoes.modulosAtivos.includes(m)}
                                                disabled={!MODULOS_DISPONIVEIS[m]}
                                                onCheckedChange={(ativo) => toggleModulo(m, ativo)}
                                                aria-label={`Ativar ${MODULO_LABEL[m]}`}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="max-w-md space-y-3">
                                <h3 className="text-sm font-medium">{MODULO_LABEL[pagina]}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {pagina === 'github'
                                        ? 'O módulo está ativo. A configuração (ligar a conta, escolher repositórios, importar projetos e issues) chega com a próxima atividade — a importação GitHub.'
                                        : 'Configuração deste módulo chega com o próprio módulo.'}
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPagina('modulos')}
                                >
                                    Voltar aos módulos
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
