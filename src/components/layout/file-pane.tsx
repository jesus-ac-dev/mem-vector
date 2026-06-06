'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, History, Pencil, FileText, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { NotaEditor } from '@/components/layout/nota-editor';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useWorkspace, tabKey, type FicheiroAberto } from '@/components/layout/workspace-context';
import {
    lerFicheiro,
    versoesFicheiro,
    guardarFicheiro,
    abrirOuCriarNota,
} from '@/modules/workspace/workspace.actions';
import { DiffView } from '@/modules/knowledge/diff-view';
import { diffLines } from '@/modules/knowledge/knowledge.diff';
import type { Versao } from '@/modules/knowledge/knowledge.schema';

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
    | { tipo: 'ok'; titulo: string; contentMd: string };

type HistoryEstado = { tipo: 'carregando' } | { tipo: 'ok'; versoes: Versao[] };

// ──────────────────────────────────────────────
// FicheiroVista — conteúdo / histórico / editor de UM ficheiro
// ──────────────────────────────────────────────
function FicheiroVista({ ficheiro }: { ficheiro: FicheiroAberto }) {
    const router = useRouter();
    const { abrirFicheiro } = useWorkspace();
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

    // Carrega o conteúdo. Se arrancar em editor, semeia já o rascunho.
    useEffect(() => {
        let cancelled = false;
        lerFicheiro(ficheiro.tipo, ficheiro.chave)
            .then((res) => {
                if (cancelled) return;
                if (!res) {
                    setEstado({ tipo: 'erro' });
                    return;
                }
                setEstado({ tipo: 'ok', titulo: res.titulo, contentMd: res.contentMd });
                if (ficheiro.vistaInicial === 'editor') setRascunho(res.contentMd);
            })
            .catch(() => {
                if (!cancelled) setEstado({ tipo: 'erro' });
            });
        return () => {
            cancelled = true;
        };
    }, [ficheiro.tipo, ficheiro.chave, ficheiro.vistaInicial]);

    // Carrega versões ao entrar no histórico.
    useEffect(() => {
        if (vista !== 'history') return;
        let cancelled = false;
        versoesFicheiro(ficheiro.tipo, ficheiro.chave)
            .then((versoes) => {
                if (cancelled) return;
                setHistoryEstado({ tipo: 'ok', versoes });
                setBaseId(versoes[1]?.id ?? null);
            })
            .catch(() => {
                if (!cancelled) setHistoryEstado({ tipo: 'ok', versoes: [] });
            });
        return () => {
            cancelled = true;
        };
    }, [vista, ficheiro.tipo, ficheiro.chave]);

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
            const res = await guardarFicheiro(ficheiro.tipo, ficheiro.chave, rascunho);
            setGuardando(false);
            if (!res.ok) {
                setErroGuardar(res.erro);
                return;
            }
            const titulo =
                estado.tipo === 'ok' ? estado.titulo : (ficheiro.titulo ?? ficheiro.chave);
            setEstado({ tipo: 'ok', titulo, contentMd: rascunho });
            setVista('conteudo');
        } catch (e) {
            setGuardando(false);
            setErroGuardar(e instanceof Error ? e.message : 'erro ao guardar');
        }
    }

    // Clicar num wikilink abre o alvo numa tab; se a nota não existir (link
    // quebrado), cria-a primeiro (comportamento Obsidian).
    async function handleInternalLink(href: string) {
        const mKnow = /^\/knowledge\/(.+)$/.exec(href);
        if (mKnow) {
            const slug = decodeURIComponent(mKnow[1]);
            const nota = await abrirOuCriarNota(slug);
            abrirFicheiro({ tipo: 'knowledge', chave: nota.chave, titulo: nota.titulo });
            if (nota.criada) router.refresh();
            return;
        }
        const mDaily = /^\/daily\/(.+)$/.exec(href);
        if (mDaily) {
            const dia = decodeURIComponent(mDaily[1]);
            abrirFicheiro({ tipo: 'daily', chave: dia, titulo: dia });
        }
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Toolbar de ações — topo-direito do ficheiro (longe do toggle da direita) */}
            {vista !== 'editor' && (
                <div className="flex h-8 shrink-0 items-center justify-end gap-0.5 border-b px-2">
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
                        onClick={() => setVista(vista === 'history' ? 'conteudo' : 'history')}
                        title="Histórico"
                        aria-label="Histórico"
                        className={cn(
                            'h-6 w-6 text-muted-foreground',
                            vista === 'history' && 'bg-accent text-accent-foreground',
                        )}
                    >
                        <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {}}
                        title="Arquivar"
                        aria-label="Arquivar"
                        className="h-6 w-6 text-muted-foreground"
                    >
                        <Archive className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}

            {/* Corpo */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm">
                {vista === 'conteudo' && (
                    <>
                        {estado.tipo === 'carregando' && (
                            <p className="text-muted-foreground">a carregar…</p>
                        )}
                        {estado.tipo === 'erro' && (
                            <p className="text-muted-foreground">não encontrado</p>
                        )}
                        {estado.tipo === 'ok' && (
                            <Markdown
                                content={estado.contentMd}
                                wikilinks
                                onInternalLink={handleInternalLink}
                            />
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
                                                        {v.author}
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
                            placeholder="Escreve em Markdown..."
                        />
                        {erroGuardar && <p className="text-xs text-destructive">{erroGuardar}</p>}
                        <div className="flex shrink-0 items-center justify-end gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setVista('conteudo')}
                                disabled={guardando}
                            >
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => void handleGuardar()}
                                disabled={guardando}
                            >
                                {guardando ? 'A guardar…' : 'Guardar'}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
