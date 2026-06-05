import { notFound } from 'next/navigation';
import { getNota, listarVersoes } from '@/modules/knowledge/knowledge.service';
import { diffLines } from '@/modules/knowledge/knowledge.diff';

export default async function NotaPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const nota = await getNota(slug);
    if (!nota) notFound();
    const versoes = await listarVersoes(nota.id);
    const diff = versoes.length >= 2 ? diffLines(versoes[1].contentMd, versoes[0].contentMd) : [];

    return (
        <main className="p-6">
            <h1 className="text-xl font-semibold text-foreground">{nota.title}</h1>
            <pre className="mt-4 whitespace-pre-wrap text-sm text-foreground">{nota.contentMd}</pre>
            <h2 className="mt-6 text-sm font-medium text-muted-foreground">
                Histórico ({versoes.length}) — última alteração
            </h2>
            <pre className="mt-2 text-sm">
                {diff.map((d, i) => (
                    <span
                        key={i}
                        className={
                            d.op === 'add'
                                ? 'block bg-primary/10'
                                : d.op === 'del'
                                  ? 'block bg-destructive/10 line-through'
                                  : 'block text-muted-foreground'
                        }
                    >
                        {d.op === 'add' ? '+ ' : d.op === 'del' ? '- ' : '  '}
                        {d.text}
                    </span>
                ))}
            </pre>
        </main>
    );
}
