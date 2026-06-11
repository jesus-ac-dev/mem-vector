import Link from 'next/link';
import { notFound } from 'next/navigation';
import { History, FileText } from 'lucide-react';
import { getNota, getNotaPorId, listarVersoes } from '@/modules/knowledge/knowledge.service';
import { diffLines } from '@/modules/knowledge/knowledge.diff';
import { DiffView } from '@/modules/knowledge/diff-view';
import { NoteContent } from '@/modules/knowledge/note-content';
import { VersionPicker } from '@/modules/knowledge/version-picker';

export default async function NotaPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ base?: string; id?: string; view?: string }>;
}) {
    const { slug } = await params;
    const { base: baseId, id, view } = await searchParams;

    const isHistoryView = view === 'history';

    const nota = id ? await getNotaPorId(id) : await getNota(slug);
    if (!nota) notFound();

    const versoes = await listarVersoes(nota.id);

    // Current = newest version; base = version selected via ?base=<id> or the previous one.
    const current = versoes[0] ?? null;
    const baseVersion = baseId
        ? (versoes.find((v) => v.id === baseId) ?? versoes[1] ?? null)
        : (versoes[1] ?? null);

    const hasDiff = current && baseVersion;
    const diff = hasDiff ? diffLines(baseVersion.contentMd, current.contentMd) : [];

    // Versions available for comparison (all except the current/latest)
    const compareVersions = versoes.slice(1);
    const basePath = `/knowledge/${encodeURIComponent(nota.slug)}${id ? `?id=${encodeURIComponent(id)}` : ''}`;
    const contentHref = id
        ? `/knowledge/${encodeURIComponent(nota.slug)}?id=${encodeURIComponent(id)}`
        : `/knowledge/${encodeURIComponent(nota.slug)}`;
    const historyHref = `${contentHref}${id ? '&' : '?'}view=history`;

    return (
        <main className="space-y-6 p-6">
            {/* Shared header: title + toggle icon */}
            <div className="flex items-start justify-between gap-2">
                <h1 className="text-xl font-semibold text-foreground">{nota.title}</h1>

                {isHistoryView ? (
                    <Link
                        href={contentHref}
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                        title="Voltar ao conteúdo"
                        aria-label="Voltar ao conteúdo"
                    >
                        <FileText className="h-4 w-4" />
                    </Link>
                ) : (
                    <Link
                        href={historyHref}
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                        title="Histórico"
                        aria-label="Histórico"
                    >
                        <History className="h-4 w-4" />
                    </Link>
                )}
            </div>

            {isHistoryView ? (
                /* History mode: comparator only */
                <section className="space-y-4">
                    {versoes.length < 2 ? (
                        <p className="text-sm italic text-muted-foreground">
                            Versão única — sem histórico para comparar.
                        </p>
                    ) : (
                        <>
                            <VersionPicker
                                versions={compareVersions}
                                basePath={basePath}
                                currentBase={baseId}
                                keepView
                                atual={current ?? undefined}
                            />
                            <DiffView diff={diff} />
                        </>
                    )}
                </section>
            ) : (
                /* Content mode: note body only */
                <section>
                    <NoteContent content={nota.contentMd} />
                </section>
            )}
        </main>
    );
}
