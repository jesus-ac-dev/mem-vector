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
import { gravarDefinicoes, testarProvider } from '@/modules/definicoes/definicoes.actions';
import { getJson } from '@/lib/api-get';
import {
    DEFINICOES_VISTA_DEFAULT,
    MODOS_POR_PROVIDER,
    MODULO_LABEL,
    MODULOS,
    modoEfetivo,
    PROVIDER_LABEL,
    PROVIDERS,
    type AgenteVista,
    type Definicoes,
    type DefinicoesVista,
    type MetodoDestilacao,
    type ModoAgente,
    type Modulo,
    type Provider,
} from '@/modules/definicoes/definicoes.schema';
import { ProviderIcon } from '@/components/layout/provider-icon';
import { providersPorForcarTeste } from '@/components/layout/definicoes-modal.logic';

// Mega modal das definições (#60, design do Carlos): menu lateral à esquerda,
// forms à direita. Aqui PARAMETRIZA-SE (Comportamento, Agentes, Módulos) com
// botão Guardar explícito — ao guardar, só os providers LIGADOS nesta sessão e
// não testados são testados à força (mudar modelo/key ou desativar não dispara).
// A ESCOLHA do provider/modelo do chat vive na mini-modal do link sobre o Enviar.

type Pagina = 'comportamento' | 'agentes' | 'modulos' | Modulo;

export const ABRIR_DEFINICOES_EVENT = 'memvector:abrir-definicoes';
// Emitido ao guardar com sucesso: o composer do chat lê o provider/modelo das
// definições e re-busca sem F5.
export const DEFINICOES_MUDARAM_EVENT = 'memvector:definicoes-mudaram';

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

// Verde claro no sucesso (pedido do Carlos) — fora do JSX, como o corPrioridade.
function corTeste(ok: boolean): string {
    return ok ? 'text-green-400' : 'text-destructive';
}

export function DefinicoesModal({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [pagina, setPagina] = useState<Pagina>('comportamento');
    const [defs, setDefs] = useState<DefinicoesVista>(DEFINICOES_VISTA_DEFAULT);
    // Keys escritas nesta sessão da modal ('' = limpar; só seguem no Guardar).
    const [keysNovas, setKeysNovas] = useState<Partial<Record<Provider, string>>>({});
    const [testes, setTestes] = useState<
        Partial<Record<Provider, 'a-testar' | { ok: boolean; detalhe: string }>>
    >({});
    // Providers LIGADOS nesta sessão (ativo→true) — o Guardar força-lhes o teste
    // se não forem confirmados pelo botão; o ✓ do teste manual confirma-os.
    const [ligados, setLigados] = useState<Set<Provider>>(new Set());
    const [confirmados, setConfirmados] = useState<Set<Provider>>(new Set());
    const [sujo, setSujo] = useState(false);
    const [carregado, setCarregado] = useState(false);
    const [estado, setEstado] = useState<'' | 'a-guardar' | 'guardado' | 'falhou'>('');

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
            setCarregado(false);
            setKeysNovas({});
            setTestes({});
            setLigados(new Set());
            setConfirmados(new Set());
            setSujo(false);
            setEstado('');
        }
    }

    useEffect(() => {
        if (!open) return;
        let cancelado = false;
        void runClientAction({ area: 'definicoes', action: 'lerDefinicoes' }, () =>
            getJson<DefinicoesVista>('/api/definicoes'),
        ).then((d) => {
            if (cancelado || !d) return;
            setDefs(d);
            setCarregado(true);
        });
        return () => {
            cancelado = true;
        };
    }, [open]);

    // Edições só mexem no estado local; persistir é trabalho do Guardar.
    function editar(novas: DefinicoesVista) {
        setDefs(novas);
        setSujo(true);
        setEstado('');
    }

    function descartarConfirmacao(p: Provider) {
        setConfirmados((s) => {
            const n = new Set(s);
            n.delete(p);
            return n;
        });
    }

    function mudarAgente(p: Provider, campos: Partial<AgenteVista>) {
        const atual = defs.agentes[p] ?? AGENTE_SEM_CONFIG;
        editar({ ...defs, agentes: { ...defs.agentes, [p]: { ...atual, ...campos } } });
        // Ligar nesta sessão marca-o para teste forçado no Guardar; desligar
        // tira-o da lista (um provider inativo nunca é testado).
        if (campos.ativo === true) setLigados((s) => new Set(s).add(p));
        if (campos.ativo === false)
            setLigados((s) => {
                const n = new Set(s);
                n.delete(p);
                return n;
            });
        descartarConfirmacao(p);
    }

    function escreverKey(p: Provider, valor: string) {
        setKeysNovas((k) => ({ ...k, [p]: valor }));
        setSujo(true);
        setEstado('');
        // Mudar a key reseta o ✓ (a prova antiga deixa de valer) mas não força
        // teste no Guardar — só ligar um provider o faz.
        descartarConfirmacao(p);
    }

    function toggleModulo(m: Modulo, ativo: boolean) {
        const set = new Set(defs.modulosAtivos);
        if (ativo) set.add(m);
        else set.delete(m);
        editar({ ...defs, modulosAtivos: [...set] });
        if (!ativo && pagina === m) setPagina('modulos');
    }

    async function correrTeste(p: Provider): Promise<boolean> {
        setTestes((t) => ({ ...t, [p]: 'a-testar' }));
        // O teste leva a config PENDENTE do form (r9) — modo/modelo/key por
        // gravar contam; uma key ao calhas rebenta AQUI, antes do Guardar.
        const cfg = defs.agentes[p] ?? AGENTE_SEM_CONFIG;
        const r = await runClientAction(
            { area: 'definicoes', action: 'testarProvider', meta: { p } },
            () =>
                testarProvider({
                    provider: p,
                    config: {
                        ativo: cfg.ativo,
                        modo: modoEfetivo(p, cfg.modo),
                        modelo: cfg.modelo,
                        esforco: cfg.esforco,
                        // undefined = usa a key gravada; '' = testar sem key.
                        apiKey: keysNovas[p],
                    },
                }),
        );
        const resultado = r ?? { ok: false, detalhe: 'o teste não respondeu' };
        setTestes((t) => ({ ...t, [p]: resultado }));
        // O teste descobriu modelos (#60 r5): refletir já nas dropdowns.
        if (resultado.ok && r?.modelos?.length) {
            setDefs((d) => ({
                ...d,
                agentes: {
                    ...d.agentes,
                    [p]: { ...(d.agentes[p] ?? AGENTE_SEM_CONFIG), modelos: r.modelos },
                },
            }));
        }
        return resultado.ok;
    }

    function testarManual(p: Provider) {
        void correrTeste(p).then((ok) => {
            if (ok) setConfirmados((s) => new Set(s).add(p));
        });
    }

    // Guardar (pedido do Carlos): persiste tudo, mas antes FORÇA o teste de
    // ligação só aos providers LIGADOS nesta sessão e ainda não confirmados.
    // Teste vermelho = não grava (corrige ou desativa) — o teste corre contra o
    // pendente (r9), keys novas incluídas. Desativar todos passa sem testar.
    async function guardarTudo() {
        setEstado('a-guardar');
        const porTestar = providersPorForcarTeste(defs.agentes, ligados, confirmados);
        for (const p of porTestar) {
            const ok = await correrTeste(p);
            if (!ok) {
                setEstado('falhou');
                setPagina('agentes');
                return;
            }
        }
        const payload: Definicoes = {
            metodoDestilacao: defs.metodoDestilacao,
            modulosAtivos: defs.modulosAtivos,
            chatProvider: defs.chatProvider,
            matchCount: defs.matchCount,
            webHabilitada: defs.webHabilitada,
            agentes: Object.fromEntries(
                (Object.entries(defs.agentes) as [Provider, AgenteVista][]).map(([p, a]) => [
                    p,
                    {
                        ativo: a.ativo,
                        modo: modoEfetivo(p, a.modo),
                        modelo: a.modelo,
                        esforco: a.esforco,
                        // A lista descoberta pelo teste viaja AQUI (r13).
                        modelos: a.modelos,
                        // undefined = manter a key cifrada existente; '' = limpar.
                        apiKey: keysNovas[p],
                    },
                ]),
            ),
        };
        const r = await runClientAction({ area: 'definicoes', action: 'gravarDefinicoes' }, () =>
            gravarDefinicoes(payload),
        );
        if (!r) {
            setEstado('falhou');
            return;
        }
        setDefs(r);
        setKeysNovas({});
        setLigados(new Set());
        setSujo(false);
        setEstado('guardado');
        // O composer do chat lê o provider/modelo daqui — avisa-o para re-buscar
        // sem F5 (antes ficava preso à leitura do mount).
        window.dispatchEvent(new Event(DEFINICOES_MUDARAM_EVENT));
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
            <DialogContent className="grid h-[85vh] max-w-5xl grid-rows-[auto,1fr,auto] gap-0 p-0">
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle>Definições</DialogTitle>
                    <DialogDescription>
                        Comportamento, agentes e módulos deste workspace.
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
                                        editar({ ...defs, metodoDestilacao: v as MetodoDestilacao })
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
                                <div>
                                    <h3 className="text-sm font-medium">Fontes no retrieval</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Quantas notas/excertos o chat consulta por pergunta (antes
                                        era fixo em 5). Mais apanha contexto; demasiadas enchem o
                                        prompt de ruído e custo.
                                    </p>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={defs.matchCount}
                                        onChange={(e) => {
                                            const n = Number(e.target.value);
                                            if (Number.isInteger(n) && n >= 1 && n <= 50)
                                                editar({ ...defs, matchCount: n });
                                        }}
                                        className="mt-2 h-8 w-24 text-xs"
                                    />
                                </div>
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="text-sm font-medium">
                                            Pesquisa na internet
                                        </h3>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Quando ligado, a resposta do chat pode consultar a web
                                            (mais lenta e cara; sem streaming). Usa DuckDuckGo; uma
                                            key Brave fica para mais robustez.
                                        </p>
                                    </div>
                                    <Switch
                                        checked={defs.webHabilitada}
                                        onCheckedChange={(webHabilitada) =>
                                            editar({ ...defs, webHabilitada })
                                        }
                                        aria-label="Ligar pesquisa na internet"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Proatividade, estilo e personalidade do agente vão acumulando
                                    aqui.
                                </p>
                            </div>
                        ) : pagina === 'agentes' ? (
                            // Parametrização dos providers ("novos" agentes). A
                            // ESCOLHA de quem responde ao chat vive na mini-modal
                            // do link sobre o Enviar.
                            <div className="max-w-xl space-y-4">
                                <div>
                                    <h3 className="text-sm font-medium">
                                        Agentes (orquestradores)
                                    </h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Parametriza os providers que o workspace pode usar. CLI usa
                                        a tua subscrição/instalação local; API precisa de key
                                        (cifrada, nunca volta ao browser). A escolha de quem
                                        responde ao chat faz-se no link sobre o botão Enviar.
                                    </p>
                                </div>

                                <ul className="space-y-3">
                                    {PROVIDERS.map((p) => {
                                        const cfg = defs.agentes[p] ?? AGENTE_SEM_CONFIG;
                                        const teste = testes[p];
                                        const modos = MODOS_POR_PROVIDER[p];
                                        const modo = modoEfetivo(p, cfg.modo);
                                        return (
                                            <li key={p} className="space-y-2 rounded-md border p-3">
                                                <div className="flex items-center justify-between gap-4">
                                                    <p className="flex items-center gap-2 text-sm font-medium">
                                                        <ProviderIcon provider={p} />
                                                        {PROVIDER_LABEL[p]}
                                                        {p === 'claude' && (
                                                            <span className="ml-1 text-xs font-normal text-muted-foreground">
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
                                                            {/* Só se oferece o que o factory implementa
                                                                (r9): gemini é só API, ollama é só local. */}
                                                            {modos.length > 1 ? (
                                                                <Select
                                                                    value={modo}
                                                                    onValueChange={(m) =>
                                                                        mudarAgente(p, {
                                                                            modo: m as ModoAgente,
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
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {p === 'ollama'
                                                                        ? 'daemon local'
                                                                        : 'API'}
                                                                </span>
                                                            )}
                                                            {/* Modelo e esforço vivem na
                                                                ESCOLHA (mini-modal do chat) —
                                                                aqui só se parametriza a ligação. */}
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => testarManual(p)}
                                                                disabled={teste === 'a-testar'}
                                                                className="ml-auto h-8 text-xs"
                                                            >
                                                                {teste === 'a-testar'
                                                                    ? 'A testar…'
                                                                    : 'Testar ligação'}
                                                            </Button>
                                                        </div>
                                                        {modo === 'api' && (
                                                            <div className="flex items-center gap-2">
                                                                <Input
                                                                    type="password"
                                                                    // Sem autofill do browser: um type=password
                                                                    // preenchido pelo gestor de passwords parece
                                                                    // config feita sem o ser (relato do Carlos).
                                                                    autoComplete="new-password"
                                                                    value={keysNovas[p] ?? ''}
                                                                    onChange={(e) =>
                                                                        escreverKey(
                                                                            p,
                                                                            e.target.value,
                                                                        )
                                                                    }
                                                                    placeholder={
                                                                        keysNovas[p] === ''
                                                                            ? 'key será removida ao guardar'
                                                                            : cfg.temApiKey
                                                                              ? `key configurada (····${cfg.apiKeySufixo})`
                                                                              : 'API key'
                                                                    }
                                                                    className="h-8 flex-1 text-xs"
                                                                />
                                                                {cfg.temApiKey && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            escreverKey(p, '')
                                                                        }
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
                                                                    corTeste(teste.ok),
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

                {/* Footer: o Guardar explícito (pedido do Carlos). */}
                <div className="flex items-center justify-end gap-3 border-t px-6 py-3">
                    {estado === 'guardado' && (
                        <span className="text-xs text-primary">Guardado.</span>
                    )}
                    {estado === 'falhou' && (
                        <span className="text-xs text-destructive">
                            Um teste de ligação falhou — corrige ou desativa o provider.
                        </span>
                    )}
                    <Button
                        onClick={() => void guardarTudo()}
                        disabled={!sujo || estado === 'a-guardar'}
                    >
                        {estado === 'a-guardar' ? 'A guardar…' : 'Guardar'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
