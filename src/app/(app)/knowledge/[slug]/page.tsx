import { notFound } from 'next/navigation';
import { getNota, listarVersoes } from '@/modules/knowledge/knowledge.service';
import { diffLines } from '@/modules/knowledge/knowledge.diff';
import { DiffView } from '@/modules/knowledge/diff-view';
import { NoteContent } from '@/modules/knowledge/note-content';
import { VersionPicker } from '@/modules/knowledge/version-picker';

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

    // Versions available for comparison (all except the current/latest)
    const compareVersions = versoes.slice(1);

    return (
        <main className="space-y-6 p-6">
            {/* Note content */}
            <section>
                <h1 className="text-xl font-semibold text-foreground">{nota.title}</h1>
                <NoteContent content={nota.contentMd} />
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
                        {/* Version picker dropdown */}
                        <VersionPicker
                            versions={compareVersions}
                            slug={slug}
                            currentBase={baseId}
                        />

                        {/* Diff view */}
                        <DiffView diff={diff} />
                    </>
                )}
            </section>
        </main>
    );
}
