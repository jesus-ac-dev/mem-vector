import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getNota, listarVersoes } from '@/modules/knowledge/knowledge.service';
import { diffLines } from '@/modules/knowledge/knowledge.diff';
import { DiffView } from '@/modules/knowledge/diff-view';

export default async function NotaPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ base?: string }>;
}) {
    const { slug } = await params;
    const { base: baseId } = await searchParams;

    const nota = await getNota(slug);
    if (!nota) notFound();

    const versoes = await listarVersoes(nota.id);

    // Current = newest version; base = version selected via ?base=<id> or the previous one.
    const current = versoes[0] ?? null;
    const baseVersion = baseId
        ? (versoes.find((v) => v.id === baseId) ?? versoes[1] ?? null)
        : (versoes[1] ?? null);

    const hasDiff = current && baseVersion;
    const diff = hasDiff ? diffLines(baseVersion.contentMd, current.contentMd) : [];

    return (
        <main className="space-y-6 p-6">
            {/* Note content */}
            <section>
                <h1 className="text-xl font-semibold text-foreground">{nota.title}</h1>
                <pre className="mt-4 whitespace-pre-wrap text-sm text-foreground">
                    {nota.contentMd}
                </pre>
            </section>

            {/* Version history + diff */}
            <section className="space-y-4">
                <h2 className="text-sm font-medium text-muted-foreground">
                    Histórico ({versoes.length})
                </h2>

                {versoes.length < 2 ? (
                    <p className="text-sm italic text-muted-foreground">
                        Versão única — sem histórico para comparar.
                    </p>
                ) : (
                    <>
                        {/* Version picker */}
                        <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                                Comparar a versão atual com:
                            </p>
                            <div className="flex flex-col gap-1">
                                {versoes.slice(1).map((v) => {
                                    const isActive =
                                        baseId === v.id || (!baseId && v.id === versoes[1]?.id);
                                    return (
                                        <Link
                                            key={v.id}
                                            href={`/knowledge/${slug}?base=${v.id}`}
                                            className={[
                                                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors',
                                                isActive
                                                    ? 'bg-accent font-medium text-accent-foreground'
                                                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
                                            ].join(' ')}
                                        >
                                            <span className="font-mono">
                                                {new Date(v.createdAt).toLocaleString('pt-PT', {
                                                    dateStyle: 'short',
                                                    timeStyle: 'short',
                                                })}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {v.author}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Diff view */}
                        <DiffView diff={diff} />
                    </>
                )}
            </section>
        </main>
    );
}
