import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { listarDailies } from '@/modules/daily/daily.service';

export default async function DailyIndexPage() {
    const dailies = await listarDailies();

    return (
        <main className="space-y-6 p-6">
            <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-muted-foreground" aria-hidden />
                <h1 className="text-xl font-semibold text-foreground">Daily Notes</h1>
            </div>

            {dailies.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há Daily Notes.</p>
            ) : (
                <ol className="space-y-2">
                    {dailies.map((daily) => (
                        <li key={daily.id}>
                            <Link
                                href={`/daily/${daily.dia}`}
                                className="flex items-center justify-between gap-4 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted"
                            >
                                <span className="font-medium text-foreground">{daily.dia}</span>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(daily.updatedAt).toLocaleString('pt-PT', {
                                        dateStyle: 'short',
                                        timeStyle: 'short',
                                    })}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ol>
            )}
        </main>
    );
}
