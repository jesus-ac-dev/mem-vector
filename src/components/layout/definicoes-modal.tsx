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
import { Input } from '@/components/ui/input';
import {
    gravarDefinicoes,
    lerDefinicoes,
    testarProvider,
} from '@/modules/definicoes/definicoes.actions';
import {
    DEFINICOES_VISTA_DEFAULT,
    ESFORCOS,
    MODELOS_SUGERIDOS,
    MODULO_LABEL,
    MODULOS,
    PROVIDER_LABEL,
    PROVIDERS,
    type AgenteVista,
    type Definicoes,
    type DefinicoesVista,
    type Esforco,
    type MetodoDestilacao,
    type ModoAgente,
    type Modulo,
    type Provider,
} from '@/modules/definicoes/definicoes.schema';

// Mega modal das definições (#60, design do Carlos): menu lateral à esquerda,
// forms à direita. Secções principais: Comportamento (como o agente-autor
// age — acumula ideias), Agentes (os providers/orquestradores — o
// FactoryProvider distribui e o chat responde com o escolhido) e Módulos;
// módulo ativo ganha grupo próprio no menu com a página dele por baixo.

type Pagina = 'comportamento' | 'agentes' | 'modulos' | Modulo;

// O chat (link sobre o Enviar) abre a modal aqui — mesmo padrão de evento do
// banner stale (a modal vive no header, fora do WorkspaceProvider).
export const ABRIR_DEFINICOES_EVENT = 'memvector:abrir-definicoes';

export function pedirDefinicoes(pagina: Pagina = 'comportamento') {
    window.dispatchEvent(new CustomEvent(ABRIR_DEFINICOES_EVENT, { detail: pagina }));
}

// Só o GitHub está disponível; os restantes vêm do roadmap (brief §5:
// Campanhas; visão do calendário: Google Workspace/agenda; Emails da escada).
const MODULOS_DISPONIVEIS: Record<Modulo, boolean> = {
    github: true,
    emails: false,
    'google-workspace': false,
    campanhas: false,
};

const MODULO_DESCRICAO: Record<Modulo, string> = {
    github: 'Importa projetos e issues dos teus repositórios (read-only primeiro).',
    emails: 'Caixa de entrada no workspace — há de vir.',
    'google-workspace': 'Agenda e docs no workspace (o calendário liga-se aqui) — há de vir.',
    campanhas: 'Campanhas online (marketing) — há de vir.',
};

const AGENTE_SEM_CONFIG: AgenteVista = { ativo: false, modo: 'cli', temApiKey: false };

// Esforço de raciocínio: por agora só o codex o aceita (model_reasoning_effort).
const PROVIDERS_COM_ESFORCO: Provider[] = ['codex'];

export function DefinicoesModal({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [pagina, setPagina] = useState<Pagina>('comportamento');
    const [defs, setDefs] = useState<DefinicoesVista>(DEFINICOES_VISTA_DEFAULT);
    const [keysNovas, setKeysNovas] = useState<Partial<Record<Provider, string>>>({});
    const [testes, setTestes] = useState<
        Partial<Record<Provider, 'a-testar' | { ok: boolean; detalhe: string }>>
    >({});
    const [carregado, setCarregado] = useState(false);
    const [gravado, setGravado] = useState(false);

    // O chat pede a modal por evento (padrão do banner stale).
    useEffect(() => {
        function abrir(e: Event) {
            const destino = (e as CustomEvent<Pagina>).detail;
            setPagina(destino ?? 'comportamento');
            onOpenChange(true);
        }
        window.addEventListener(ABRIR_DEFINICOES_EVENT, abrir);
        return () => window.removeEventListener(ABRIR_DEFINICOES_EVENT, abrir);
    }, [onOpenChange]);

    // Reset ao abrir — derive-no-render (o lint da casa não deixa setState
    // síncrono no corpo de um effect).
    const [ultimoOpen, setUltimoOpen] = useState(open);
    if (open !== ultimoOpen) {
        setUltimoOpen(open);
        if (open) {
            setGravado(false);
            setCarregado(false);
            setKeysNovas({});
            setTestes({});
        }
    }

    useEffect(() => {
        if (!open) return;
        let cancelado = false;
        void runClientAction({ area: 'definicoes', action: 'lerDefinicoes' }, lerDefinicoes).then(
            (d) => {
                if (cancelado || !d) return;
                setDefs(d);
                setCarregado(true);
            },
        );
        return () => {
            cancelado = true;
        };
    }, [open]);

    // Gravação imediata: a vista local atualiza já; o servidor responde com a
    // vista canónica (keys mascaradas) que substitui o estado.
    function gravar(novas: DefinicoesVista, keysParaEnviar: Partial<Record<Provider, string>>) {
        setDefs(novas);
        setGravado(false);
        const payload: Definicoes = {
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
                        // undefined = manter a key cifrada existente.
                        apiKey: keysParaEnviar[p],
                    },
                ]),
            ),
        };
        void runClientAction({ area: 'definicoes', action: 'gravarDefinicoes' }, () =>
            gravarDefinicoes(payload),
        ).then((r) => {
            if (!r) return;
            setDefs(r);
            setGravado(true);
        });
    }

    function mudarAgente(p: Provider, campos: Partial<AgenteVista>) {
        const atual = defs.agentes[p] ?? AGENTE_SEM_CONFIG;
        gravar({ ...defs, agentes: { ...defs.agentes, [p]: { ...atual, ...campos } } }, keysNovas);
    }

    function guardarKey(p: Provider) {
        const key = keysNovas[p]?.trim();
        if (!key) return;
        gravar(defs, { ...keysNovas, [p]: key });
        setKeysNovas((k) => ({ ...k, [p]: undefined }));
    }

    function limparKey(p: Provider) {
        gravar(defs, { ...keysNovas, [p]: '' });
    }

    function testar(p: Provider) {
        setTestes((t) => ({ ...t, [p]: 'a-testar' }));
        void runClientAction({ area: 'definicoes', action: 'testarProvider', meta: { p } }, () =>
            testarProvider(p),
        ).then((r) => {
            setTestes((t) => ({
                ...t,
                [p]: r ?? { ok: false, detalhe: 'o teste não respondeu' },
            }));
        });
    }

    function toggleModulo(m: Modulo, ativo: boolean) {
        const set = new Set(defs.modulosAtivos);
        if (ativo) set.add(m);
        else set.delete(m);
        gravar({ ...defs, modulosAtivos: [...set] }, keysNovas);
        if (!ativo && pagina === m) setPagina('modulos');
    }

    const ativos = PROVIDERS.filter((p) => defs.agentes[p]?.ativo);

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
            <DialogContent className="grid h-[85vh] max-w-5xl grid-rows-[auto,1fr] gap-0 p-0">
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle>Definições</DialogTitle>
                    <DialogDescription>
                        Comportamento, agentes e módulos deste workspace.
                        {gravado && <span className="ml-2 text-primary">Guardado.</span>}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid min-h-0 grid-cols-[12rem,1fr]">
                    {/* Menu lateral */}
                    <nav className="space-y-0.5 overflow-y-auto border-r p-3">
                        <p className="px-2 pb-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                            Principais
                        </p>
                        {itemMenu('comportamento', 'Comportamento')}
                        {itemMenu('agentes', 'Agentes')}
                        {itemMenu('modulos', 'Módulos')}
                        {defs.modulosAtivos.length > 0 && (
                            <>
                                <p className="px-2 pb-1 pt-3 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                                    Módulos ativos
                                </p>
                                {defs.modulosAtivos.map((m) => itemMenu(m, MODULO_LABEL[m], true))}
                            </>
                        )}
                    </nav>

                    {/* Form da página ativa */}
                    <div className="overflow-y-auto p-6">
                        {!carregado ? (
                            <p className="text-sm text-muted-foreground">A carregar…</p>
                        ) : pagina === 'comportamento' ? (
                            // Comportamento (#60 r2): COMO o agente-autor age — a
                            // secção acumula (proatividade, estilo, personalidade
                            // hão de entrar aqui; ver memória de alto nível).
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
                                    value={defs.metodoDestilacao}
                                    onValueChange={(v) =>
                                        gravar(
                                            { ...defs, metodoDestilacao: v as MetodoDestilacao },
                                            keysNovas,
                                        )
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
                                    Proatividade, estilo e personalidade do agente vão acumulando
                                    aqui.
                                </p>
                            </div>
                        ) : pagina === 'agentes' ? (
                            <div className="max-w-xl space-y-4">
                                <div>
                                    <h3 className="text-sm font-medium">
                                        Agentes (orquestradores)
                                    </h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Os providers que o workspace pode usar. CLI usa a tua
                                        subscrição/instalação local; API precisa de key (cifrada,
                                        nunca volta ao browser).
                                    </p>
                                </div>

                                {/* A mudança que a interface provoca: quem responde ao chat. */}
                                <div className="flex items-center gap-2 rounded-md border p-3">
                                    <p className="text-sm">Responde ao chat:</p>
                                    <Select
                                        value={defs.chatProvider}
                                        onValueChange={(v) =>
                                            gravar(
                                                { ...defs, chatProvider: v as Provider },
                                                keysNovas,
                                            )
                                        }
                                    >
                                        <SelectTrigger className="h-8 w-40 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(ativos.length ? ativos : ['claude' as Provider]).map(
                                                (p) => (
                                                    <SelectItem key={p} value={p}>
                                                        {PROVIDER_LABEL[p]}
                                                    </SelectItem>
                                                ),
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <ul className="space-y-3">
                                    {PROVIDERS.map((p) => {
                                        const cfg = defs.agentes[p] ?? AGENTE_SEM_CONFIG;
                                        const teste = testes[p];
                                        const sugeridos = MODELOS_SUGERIDOS[p];
                                        return (
                                            <li key={p} className="space-y-2 rounded-md border p-3">
                                                <div className="flex items-center justify-between gap-4">
                                                    <p className="text-sm font-medium">
                                                        {PROVIDER_LABEL[p]}
                                                        {p === 'claude' && (
                                                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                                                                o orquestrador atual
                                                            </span>
                                                        )}
                                                    </p>
                                                    <Switch
                                                        checked={cfg.ativo}
                                                        onCheckedChange={(ativo) =>
                                                            mudarAgente(p, { ativo })
                                                        }
                                                        aria-label={`Ativar ${PROVIDER_LABEL[p]}`}
                                                    />
                                                </div>
                                                {cfg.ativo && (
                                                    <div className="space-y-2">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Select
                                                                value={cfg.modo}
                                                                onValueChange={(modo) =>
                                                                    mudarAgente(p, {
                                                                        modo: modo as ModoAgente,
                                                                    })
                                                                }
                                                            >
                                                                <SelectTrigger className="h-8 w-24 text-xs">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="cli">
                                                                        CLI
                                                                    </SelectItem>
                                                                    <SelectItem value="api">
                                                                        API
                                                                    </SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            {sugeridos.length > 0 ? (
                                                                <Select
                                                                    value={cfg.modelo ?? 'default'}
                                                                    onValueChange={(m) =>
                                                                        mudarAgente(p, {
                                                                            modelo:
                                                                                m === 'default'
                                                                                    ? undefined
                                                                                    : m,
                                                                        })
                                                                    }
                                                                >
                                                                    <SelectTrigger className="h-8 w-44 text-xs">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="default">
                                                                            modelo default
                                                                        </SelectItem>
                                                                        {sugeridos.map((m) => (
                                                                            <SelectItem
                                                                                key={m}
                                                                                value={m}
                                                                            >
                                                                                {m}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            ) : (
                                                                <Input
                                                                    value={cfg.modelo ?? ''}
                                                                    onChange={(e) =>
                                                                        mudarAgente(p, {
                                                                            modelo:
                                                                                e.target.value ||
                                                                                undefined,
                                                                        })
                                                                    }
                                                                    placeholder="modelo (default)"
                                                                    className="h-8 w-44 text-xs"
                                                                />
                                                            )}
                                                            {PROVIDERS_COM_ESFORCO.includes(p) && (
                                                                <Select
                                                                    value={cfg.esforco ?? 'default'}
                                                                    onValueChange={(v) =>
                                                                        mudarAgente(p, {
                                                                            esforco:
                                                                                v === 'default'
                                                                                    ? undefined
                                                                                    : (v as Esforco),
                                                                        })
                                                                    }
                                                                >
                                                                    <SelectTrigger className="h-8 w-32 text-xs">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="default">
                                                                            esforço default
                                                                        </SelectItem>
                                                                        {ESFORCOS.map((e) => (
                                                                            <SelectItem
                                                                                key={e}
                                                                                value={e}
                                                                            >
                                                                                {e}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => testar(p)}
                                                                disabled={teste === 'a-testar'}
                                                                className="h-8 text-xs"
                                                            >
                                                                {teste === 'a-testar'
                                                                    ? 'A testar…'
                                                                    : 'Testar ligação'}
                                                            </Button>
                                                        </div>
                                                        {cfg.modo === 'api' && (
                                                            <div className="flex items-center gap-2">
                                                                <Input
                                                                    type="password"
                                                                    value={keysNovas[p] ?? ''}
                                                                    onChange={(e) =>
                                                                        setKeysNovas((k) => ({
                                                                            ...k,
                                                                            [p]: e.target.value,
                                                                        }))
                                                                    }
                                                                    placeholder={
                                                                        cfg.temApiKey
                                                                            ? `key configurada (····${cfg.apiKeySufixo})`
                                                                            : 'API key'
                                                                    }
                                                                    className="h-8 flex-1 text-xs"
                                                                />
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => guardarKey(p)}
                                                                    disabled={!keysNovas[p]?.trim()}
                                                                    className="h-8 text-xs"
                                                                >
                                                                    Guardar key
                                                                </Button>
                                                                {cfg.temApiKey && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => limparKey(p)}
                                                                        className="h-8 text-xs text-muted-foreground hover:text-destructive"
                                                                    >
                                                                        Limpar
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        )}
                                                        {teste && teste !== 'a-testar' && (
                                                            <p
                                                                className={cn(
                                                                    'text-xs',
                                                                    teste.ok
                                                                        ? 'text-primary'
                                                                        : 'text-destructive',
                                                                )}
                                                            >
                                                                {teste.ok ? '✓' : '✗'}{' '}
                                                                {teste.detalhe}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                                <p className="text-xs text-muted-foreground">
                                    As keys cifram-se na base de dados (AES-256-GCM) e nunca voltam
                                    ao browser.
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
                                                checked={defs.modulosAtivos.includes(m)}
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
