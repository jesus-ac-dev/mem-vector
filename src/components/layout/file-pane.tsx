'use client';

import { useEffect, useState } from 'react';
import { X, History, FileText, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/ui/markdown';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useWorkspace, type FicheiroAberto } from '@/components/layout/workspace-context';
import {
    lerFicheiro,
    versoesFicheiro,
    guardarFicheiro,
} from '@/modules/workspace/workspace.actions';
import { DiffView } from '@/modules/knowledge/diff-view';
import { diffLines } from '@/modules/knowledge/knowledge.diff';
import type { Versao } from '@/modules/knowledge/knowledge.schema';

interface FilePaneProps {
    ficheiro: FicheiroAberto;
}

type PaneEstado =
    | { tipo: 'carregando' }
    | { tipo: 'erro' }
    | { tipo: 'ok'; titulo: string; contentMd: string };

type HistoryEstado = { tipo: 'carregando' } | { tipo: 'ok'; versoes: Versao[] };

export function FilePane({ ficheiro }: FilePaneProps) {
    const { fecharFicheiro } = useWorkspace();

    // ── content state ────────────────────────────────────────────
    const [estado, setEstado] = useState<PaneEstado>({ tipo: 'carregando' });

    // ── history toggle state ─────────────────────────────────────
    const [vista, setVista] = useState<'conteudo' | 'history' | 'editor'>('conteudo');
    const [historyEstado, setHistoryEstado] = useState<HistoryEstado>({ tipo: 'carregando' });
    const [baseId, setBaseId] = useState<string | null>(null);

    // ── editor state ─────────────────────────────────────────────
    const [rascunho, setRascunho] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [erroGuardar, setErroGuardar] = useState<string | null>(null);

    // Load content; cleanup resets everything (view, history, content) when file changes.
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
            })
            .catch(() => {
                if (!cancelled) setEstado({ tipo: 'erro' });
            });

        return () => {
            cancelled = true;
            setEstado({ tipo: 'carregando' });
            setVista('conteudo');
            setHistoryEstado({ tipo: 'carregando' });
            setBaseId(null);
            setRascunho('');
            setErroGuardar(null);
            setGuardando(false);
        };
    }, [ficheiro.tipo, ficheiro.chave]);

    // Load versions when entering history view.
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

    const titulo = estado.tipo === 'ok' ? estado.titulo : (ficheiro.titulo ?? ficheiro.chave);

    // ── save handler ─────────────────────────────────────────────
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
            setEstado({ tipo: 'ok', titulo, contentMd: rascunho });
            setVista('conteudo');
        } catch (e) {
            setGuardando(false);
            setErroGuardar(e instanceof Error ? e.message : 'erro ao guardar');
        }
    }

    // ── diff computation ─────────────────────────────────────────
    const diff = (() => {
        if (historyEstado.tipo !== 'ok' || historyEstado.versoes.length < 2) return null;
        const versoes = historyEstado.versoes;
        const current = versoes[0];
        const base = versoes.find((v) => v.id === baseId) ?? versoes[1];
        if (!current || !base) return null;
        return diffLines(base.contentMd, current.contentMd);
    })();

    return (
        <div className="flex h-full w-full flex-col overflow-hidden border-l duration-200 animate-in fade-in slide-in-from-right-2">
            {/* Header */}
            <div className="flex h-10 min-w-0 shrink-0 items-center justify-between border-b px-4">
                <span className="truncate text-sm font-medium text-foreground" title={titulo}>
                    {titulo}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                    {/* View toggles */}
                    {vista === 'conteudo' && (
                        <>
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
                                className="h-7 w-7 text-muted-foreground"
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setVista('history')}
                                title="Histórico"
                                aria-label="Histórico"
                                className="h-7 w-7 text-muted-foreground"
                            >
                                <History className="h-4 w-4" />
                            </Button>
                        </>
                    )}
                    {vista === 'history' && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setVista('conteudo')}
                            title="Voltar ao conteúdo"
                            aria-label="Voltar ao conteúdo"
                            className="h-7 w-7 text-muted-foreground"
                        >
                            <FileText className="h-4 w-4" />
                        </Button>
                    )}

                    {/* Close */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={fecharFicheiro}
                        title="Fechar pane"
                        aria-label="Fechar pane"
                        className="h-7 w-7 text-muted-foreground"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Body */}
            {vista === 'editor' ? (
                <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 animate-in fade-in">
                    <Textarea
                        value={rascunho}
                        onChange={(e) => setRascunho(e.target.value)}
                        className="h-full min-h-0 w-full flex-1 resize-none font-mono text-sm"
                        disabled={guardando}
                    />
                    {erroGuardar && <p className="text-xs text-destructive">{erroGuardar}</p>}
                    <div className="flex shrink-0 justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVista('conteudo')}
                            disabled={guardando}
                        >
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={handleGuardar} disabled={guardando}>
                            {guardando ? 'A guardar…' : 'Guardar'}
                        </Button>
                    </div>
                </div>
            ) : (
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
                                <Markdown content={estado.contentMd} wikilinks />
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
                                    {/* Inline version picker — avoids router navigation inside pane */}
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

                                    {/* Diff */}
                                    {diff !== null && <DiffView diff={diff} />}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
