import Link from 'next/link';
import { listarKnowledge } from '@/modules/knowledge/knowledge.service';

export default async function KnowledgePage() {
    const notas = await listarKnowledge();
    return (
        <main className="mx-auto max-w-2xl p-6">
            <h1 className="text-xl font-semibold text-foreground">Knowledge</h1>
            <ul className="mt-4 space-y-2">
                {notas.map((n) => (
                    <li key={n.id}>
                        <Link href={`/knowledge/${n.slug}`} className="text-primary underline">
                            {n.title}
                        </Link>
                    </li>
                ))}
            </ul>
        </main>
    );
}
