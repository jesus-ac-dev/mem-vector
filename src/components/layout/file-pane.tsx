'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, History, Pencil, FileText, Archive, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logClientError, runClientAction } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { NotaEditor } from '@/components/layout/nota-editor';
import { NotaPropriedades } from '@/components/layout/nota-propriedades';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useWorkspace, tabKey, type FicheiroAberto } from '@/components/layout/workspace-context';
import {
    versoesFicheiro,
    guardarFicheiro,
    abrirOuCriarNota,
    arquivarNotaAction,
    type NotaResolvidaWikilink,
} from '@/modules/workspace/workspace.actions';
import type { ConteudoFicheiro } from '@/modules/workspace/workspace.files';
import { DiffView } from '@/modules/knowledge/diff-view';
import { rotuloAutor } from '@/modules/knowledge/versao-autor';
import { diffLines } from '@/modules/knowledge/knowledge.diff';
import type { Versao } from '@/modules/knowledge/knowledge.schema';
import type { PropriedadesNota } from '@/modules/knowledge/knowledge.props';

// ──────────────────────────────────────────────
// FilePane — barra de tabs + corpo do ficheiro ativo
// ──────────────────────────────────────────────
export function FilePane() {
    const { ficheirosAbertos, ficheiroAtivo, activarFicheiro, fecharFicheiro } = useWorkspace();
    const ativo = ficheirosAbertos.find((f) => tabKey(f) === ficheiroAtivo) ?? null;

    return (
        <div className="flex h-full w-full flex-col overflow-hidden border-l duration-200 animate-in fade-in slide-in-from-right-2">
            {/* Barra de tabs */}
            <div className="flex h-9 shrink-0 items-center overflow-x-auto border-b">
                {ficheirosAbertos.map((f) => {
                    const key = tabKey(f);
                    const isActive = key === ficheiroAtivo;
                    const titulo = f.titulo ?? f.chave;
                    return (
                        <div
                            key={key}
                            className={cn(
                                'flex h-full min-w-0 max-w-[12rem] shrink-0 items-center border-r pr-1 text-sm',
                                isActive ? 'bg-background' : 'hover:bg-muted/50',
                            )}
                        >
                            <Button
                                variant="ghost"
                                onClick={() => activarFicheiro(key)}
                                title={titulo}
                                className={cn(
                                    'h-full min-w-0 flex-1 justify-start truncate rounded-none px-3 text-sm font-normal hover:bg-transparent',
                                    isActive ? 'text-foreground' : 'text-muted-foreground',
                                )}
                            >
                                {titulo}
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => fecharFicheiro(key)}
                                title="Fechar"
                                aria-label="Fechar ficheiro"
                                className="h-5 w-5 shrink-0 text-muted-foreground opacity-60 hover:opacity-100"
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    );
                })}
            </div>

            {/* Corpo do ficheiro ativo (key → estado fresco por tab) */}
            {ativo ? (
                <FicheiroVista key={ficheiroAtivo} ficheiro={ativo} />
            ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Sem ficheiro selecionado
                </div>
            )}
        </div>
    );
}

type PaneEstado =
    | { tipo: 'carregando' }
    | { tipo: 'erro' }
    | {
          tipo: 'ok';
          titulo: string;
          contentMd: string;
          folderId?: string | null;
          propriedades?: PropriedadesNota;
      };

type HistoryEstado = { tipo: 'carregando' } | { tipo: 'ok'; versoes: Versao[] };

async function carregarFicheiroViaApi(
    tipo: FicheiroAberto['tipo'],
    chave: string,
    id?: string,
): Promise<ConteudoFicheiro | null> {
    const params = new URLSearchParams({ tipo, chave });
    if (id) params.set('id', id);

    const res = await fetch(`/api/file?${params.toString()}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`ler ficheiro: HTTP ${res.status}`);
    return (await res.json()) as ConteudoFicheiro;
}

// ──────────────────────────────────────────────
// FicheiroVista — conteúdo / histórico / editor de UM ficheiro
// ──────────────────────────────────────────────
function FicheiroVista({ ficheiro }: { ficheiro: FicheiroAberto }) {
    const router = useRouter();
    const {
        abrirFicheiro,
        atualizarFicheiroAberto,
        fecharFicheiro,
        notificarWorkspaceMudou,
        workspaceVersion,
    } = useWorkspace();
    const ficheiroKey = tabKey(ficheiro);
    // ── conteúdo ──
    const [estado, setEstado] = useState<PaneEstado>({ tipo: 'carregando' });
    // ── vista (arranca em editor se pedido, ex.: "Criar Nota") ──
    const [vista, setVista] = useState<'conteudo' | 'history' | 'editor'>(
        ficheiro.vistaInicial === 'editor' ? 'editor' : 'conteudo',
    );
    // ── histórico ──
    const [historyEstado, setHistoryEstado] = useState<HistoryEstado>({ tipo: 'carregando' });
    const [baseId, setBaseId] = useState<string | null>(null);
    // ── editor co-autor ──
    const [rascunho, setRascunho] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [erroGuardar, setErroGuardar] = useState<string | null>(null);
    const [confirmarArquivo, setConfirmarArquivo] = useState(false);
    const [wikilinkAmbiguo, setWikilinkAmbiguo] = useState<{
        slug: string;
        opcoes: NotaResolvidaWikilink[];
    } | null>(null);
    const loadRef = useRef<{
        key: string;
        promise: Promise<ConteudoFicheiro | null>;
    } | null>(null);

    // Carrega o conteúdo. Se arrancar em editor, semeia já o rascunho.
    useEffect(() => {
        let cancelled = false;
        const loadKey = `${ficheiro.tipo}:${ficheiro.id ?? ficheiro.chave}:${workspaceVersion}`;

        if (loadRef.current?.key !== loadKey) {
            setEstado({ tipo: 'carregando' });
            loadRef.current = {
                key: loadKey,
                promise: carregarFicheiroViaApi(ficheiro.tipo, ficheiro.chave, ficheiro.id),
            };
        }

        loadRef.current.promise
            .then((res) => {
                if (cancelled) return;
                if (!res) {
                    setEstado({ tipo: 'erro' });
                    return;
                }
                setEstado({
                    tipo: 'ok',
                    titulo: res.titulo,
                    contentMd: res.contentMd,
                    folderId: res.folderId ?? null,
                    propriedades: res.propriedades,
                });
                if (ficheiro.vistaInicial === 'editor') {
                    setRascunho((atual) => atual || res.contentMd);
                }
            })
            .catch((error) => {
                logClientError(
                    {
                        area: 'file-pane',
                        action: 'lerFicheiro',
                        meta: { tipo: ficheiro.tipo, chave: ficheiro.chave, id: ficheiro.id },
                    },
                    error,
                );
                if (!cancelled) setEstado({ tipo: 'erro' });
            });
        return () => {
            cancelled = true;
        };
    }, [ficheiro.tipo, ficheiro.chave, ficheiro.id, ficheiro.vistaInicial, workspaceVersion]);

    // Carrega versões ao entrar no histórico.
    useEffect(() => {
        if (vista !== 'history') return;
        let cancelled = false;
        versoesFicheiro(ficheiro.tipo, ficheiro.chave, ficheiro.id)
            .then((versoes) => {
                if (cancelled) return;
                setHistoryEstado({ tipo: 'ok', versoes });
                setBaseId(versoes[1]?.id ?? null);
            })
            .catch((error) => {
                logClientError(
                    {
                        area: 'file-pane',
                        action: 'versoesFicheiro',
                        meta: { tipo: ficheiro.tipo, chave: ficheiro.chave, id: ficheiro.id },
                    },
                    error,
                );
                if (!cancelled) setHistoryEstado({ tipo: 'ok', versoes: [] });
            });
        return () => {
            cancelled = true;
        };
    }, [vista, ficheiro.tipo, ficheiro.chave, ficheiro.id]);

    const diff = (() => {
        if (historyEstado.tipo !== 'ok' || historyEstado.versoes.length < 2) return null;
        const versoes = historyEstado.versoes;
        const current = versoes[0];
        const base = versoes.find((v) => v.id === baseId) ?? versoes[1];
        if (!current || !base) return null;
        return diffLines(base.contentMd, current.contentMd);
    })();

    async function handleGuardar() {
        if (guardando) return;
        setGuardando(true);
        setErroGuardar(null);
        try {
            const res = await guardarFicheiro(ficheiro.tipo, ficheiro.chave, rascunho, ficheiro.id);
            setGuardando(false);
            if (!res.ok) {
                setErroGuardar(res.erro);
                return;
            }
            const titulo = res.titulo ?? (estado.tipo === 'ok' ? estado.titulo : ficheiro.titulo);
            const chave = res.chave ?? ficheiro.chave;
            setEstado((prev) => ({
                tipo: 'ok',
                titulo: titulo ?? chave,
                contentMd: rascunho,
                folderId: prev.tipo === 'ok' ? prev.folderId : null,
                propriedades: prev.tipo === 'ok' ? prev.propriedades : undefined,
            }));
            atualizarFicheiroAberto(ficheiroKey, { chave, titulo: titulo ?? chave });
            setRascunho(rascunho);
            setVista('conteudo');
            notificarWorkspaceMudou();
            router.refresh();
        } catch (e) {
            logClientError(
                {
                    area: 'file-pane',
                    action: 'guardarFicheiro',
                    meta: { tipo: ficheiro.tipo, chave: ficheiro.chave, id: ficheiro.id },
                },
                e,
            );
            setGuardando(false);
            setErroGuardar(e instanceof Error ? e.message : 'erro ao guardar');
        }
    }

    function cancelarEdicao() {
        if (estado.tipo === 'ok') setRascunho(estado.contentMd);
        setErroGuardar(null);
        setVista('conteudo');
    }

    async function handleArquivar() {
        if (ficheiro.tipo !== 'knowledge') return;
        await arquivarNotaAction(ficheiro.chave, ficheiro.id);
        fecharFicheiro(ficheiroKey);
        notificarWorkspaceMudou();
        router.refresh();
    }

    // Clicar num wikilink abre o alvo numa tab; se a nota não existir (link
    // quebrado), cria-a primeiro (comportamento Obsidian).
    async function handleInternalLink(href: string) {
        try {
            const url = new URL(href, 'http://mem-vector.local');
            const mKnow = /^\/knowledge\/(.+)$/.exec(url.pathname);
            if (mKnow) {
                const slug = decodeURIComponent(mKnow[1]);
                const path = url.searchParams.get('path');
                const nota = await abrirOuCriarNota(slug, path);
                if (nota.estado === 'ambiguo') {
                    setWikilinkAmbiguo({ slug: nota.slug, opcoes: nota.opcoes });
                    return;
                }
                setWikilinkAmbiguo(null);
                abrirFicheiro({
                    tipo: 'knowledge',
                    id: nota.id,
                    chave: nota.chave,
                    titulo: nota.titulo,
                });
                if (nota.criada) router.refresh();
                return;
            }
            const mDaily = /^\/daily\/(.+)$/.exec(url.pathname);
            if (mDaily) {
                setWikilinkAmbiguo(null);
                const dia = decodeURIComponent(mDaily[1]);
                const id = url.searchParams.get('id') ?? undefined;
                abrirFicheiro({ tipo: 'daily', id, chave: dia, titulo: dia });
            }
        } catch (error) {
            logClientError(
                {
                    area: 'file-pane',
                    action: 'handleInternalLink',
                    meta: { href, ficheiroKey },
                },
                error,
            );
        }
    }

    function abrirEscolhaWikilink(nota: NotaResolvidaWikilink) {
        setWikilinkAmbiguo(null);
        abrirFicheiro({
            tipo: 'knowledge',
            id: nota.id,
            chave: nota.chave,
            titulo: nota.titulo,
        });
        router.push('/chat');
    }

    return (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Toolbar de ações. O nome do ficheiro vem do primeiro H1 do markdown. */}
            <div className="flex h-9 shrink-0 items-center justify-end gap-0.5 border-b px-2">
                {vista === 'editor' ? (
                    <>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={cancelarEdicao}
                            disabled={guardando}
                            title="Cancelar"
                            aria-label="Cancelar"
                            className="h-6 w-6 text-muted-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                                void runClientAction(
                                    {
                                        area: 'file-pane',
                                        action: 'handleGuardar',
                                        meta: { ficheiroKey },
                                    },
                                    handleGuardar,
                                )
                            }
                            disabled={guardando}
                            title={guardando ? 'A guardar…' : 'Guardar'}
                            aria-label="Guardar"
                            className="h-6 w-6 text-muted-foreground hover:bg-success/10 hover:text-success"
                        >
                            <Save className="h-3.5 w-3.5" />
                        </Button>
                    </>
                ) : (
                    <>
                        {vista === 'conteudo' ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                    if (estado.tipo === 'ok') {
                                        setRascunho(estado.contentMd);
                                        setErroGuardar(null);
                                        setVista('editor');
                                    }
                                }}
                                title="Editar"
                                aria-label="Editar"
                                className="h-6 w-6 text-muted-foreground"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setVista('conteudo')}
                                title="Voltar ao conteúdo"
                                aria-label="Voltar ao conteúdo"
                                className="h-6 w-6 text-muted-foreground"
                            >
                                <FileText className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                // Reset: sem isto, reabrir o histórico depois de um
                                // guardar mantinha um baseId de uma lista antiga.
                                setBaseId(null);
                                setVista(vista === 'history' ? 'conteudo' : 'history');
                            }}
                            title="Histórico"
                            aria-label="Histórico"
                            className={cn(
                                'h-6 w-6 text-muted-foreground',
                                vista === 'history' && 'bg-accent text-accent-foreground',
                            )}
                        >
                            <History className="h-3.5 w-3.5" />
                        </Button>
                        {ficheiro.tipo === 'knowledge' && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setConfirmarArquivo(true)}
                                title="Arquivar"
                                aria-label="Arquivar"
                                className="h-6 w-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                                <Archive className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </>
                )}
            </div>

            {/* Corpo */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm">
                {wikilinkAmbiguo && (
                    <div className="mb-4 space-y-2 border-l-2 border-border pl-3">
                        <div className="flex items-start justify-between gap-3">
                            <p className="text-xs text-muted-foreground">
                                `[[{wikilinkAmbiguo.slug}]]` tem vários destinos. Escolhe um:
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setWikilinkAmbiguo(null)}
                                className="h-6 px-2 text-xs"
                            >
                                Fechar
                            </Button>
                        </div>
                        <div className="space-y-1">
                            {wikilinkAmbiguo.opcoes.map((opcao) => (
                                <Button
                                    key={opcao.id}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => abrirEscolhaWikilink(opcao)}
                                    className="h-auto w-full justify-start px-2 py-1 text-left text-xs"
                                >
                                    <span className="truncate">{opcao.titulo}</span>
                                    <span className="ml-2 shrink-0 text-muted-foreground">
                                        {opcao.pasta}
                                    </span>
                                </Button>
                            ))}
                        </div>
                    </div>
                )}
                {vista === 'conteudo' && (
                    <>
                        {estado.tipo === 'carregando' && (
                            <p className="text-muted-foreground">a carregar…</p>
                        )}
                        {estado.tipo === 'erro' && (
                            <p className="text-muted-foreground">não encontrado</p>
                        )}
                        {estado.tipo === 'ok' && (
                            <>
                                {ficheiro.tipo === 'knowledge' && estado.propriedades && (
                                    <NotaPropriedades
                                        key={estado.propriedades.id}
                                        propriedades={estado.propriedades}
                                        onMudou={() => {
                                            notificarWorkspaceMudou();
                                            router.refresh();
                                        }}
                                    />
                                )}
                                <Markdown
                                    content={estado.contentMd}
                                    wikilinks
                                    onInternalLink={handleInternalLink}
                                />
                            </>
                        )}
                    </>
                )}

                {vista === 'history' && (
                    <>
                        {historyEstado.tipo === 'carregando' && (
                            <p className="text-muted-foreground">a carregar…</p>
                        )}
                        {historyEstado.tipo === 'ok' && historyEstado.versoes.length < 2 && (
                            <p className="text-sm italic text-muted-foreground">
                                Versão única — sem histórico para comparar.
                            </p>
                        )}
                        {historyEstado.tipo === 'ok' && historyEstado.versoes.length >= 2 && (
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    {/* Quem fez a versão ATUAL — sem isto, o autor da base de
                                        comparação lia-se como autoria do edit (#23). */}
                                    <p className="text-xs text-muted-foreground">
                                        Versão atual:{' '}
                                        <span className="font-mono">
                                            {new Date(
                                                historyEstado.versoes[0].createdAt,
                                            ).toLocaleString('pt-PT', {
                                                dateStyle: 'short',
                                                timeStyle: 'short',
                                            })}
                                        </span>{' '}
                                        ·{' '}
                                        <span className="text-foreground">
                                            {rotuloAutor(
                                                historyEstado.versoes[0].author,
                                                historyEstado.versoes[0].autorNome,
                                            )}
                                        </span>
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Comparar a versão atual com:
                                    </p>
                                    <Select
                                        value={baseId ?? historyEstado.versoes[1]?.id ?? ''}
                                        onValueChange={setBaseId}
                                    >
                                        <SelectTrigger className="w-64 text-xs">
                                            <SelectValue placeholder="Escolher versão..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {historyEstado.versoes.slice(1).map((v) => (
                                                <SelectItem
                                                    key={v.id}
                                                    value={v.id}
                                                    className="text-xs"
                                                >
                                                    <span className="font-mono">
                                                        {new Date(v.createdAt).toLocaleString(
                                                            'pt-PT',
                                                            {
                                                                dateStyle: 'short',
                                                                timeStyle: 'short',
                                                            },
                                                        )}
                                                    </span>
                                                    <span className="ml-2 text-muted-foreground">
                                                        {rotuloAutor(v.author, v.autorNome)}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {diff !== null && <DiffView diff={diff} />}
                            </div>
                        )}
                    </>
                )}

                {vista === 'editor' && (
                    <div className="flex h-full flex-col gap-2">
                        <NotaEditor
                            value={rascunho}
                            onChange={setRascunho}
                            folderId={estado.tipo === 'ok' ? estado.folderId : null}
                            onCancel={cancelarEdicao}
                            placeholder="Escreve em Markdown..."
                        />
                        {erroGuardar && <p className="text-xs text-destructive">{erroGuardar}</p>}
                    </div>
                )}
            </div>

            {confirmarArquivo && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-4">
                    <div className="w-full max-w-sm rounded-md border bg-popover p-4 shadow-md">
                        <p className="text-sm font-medium text-foreground">Arquivar nota?</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            A nota sai do explorer e do RAG ativo, mas mantém histórico e pode ser
                            reposta.
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmarArquivo(false)}
                            >
                                Cancelar
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() =>
                                    void runClientAction(
                                        {
                                            area: 'file-pane',
                                            action: 'handleArquivar',
                                            meta: { ficheiroKey },
                                        },
                                        handleArquivar,
                                    )
                                }
                            >
                                Arquivar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
