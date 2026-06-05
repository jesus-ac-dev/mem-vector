import type { DiffLine } from './knowledge.diff';

const gutterChar: Record<DiffLine['op'], string> = {
    add: '+',
    del: '-',
    same: ' ',
};

const rowClass: Record<DiffLine['op'], string> = {
    add: 'bg-success/10 text-success',
    del: 'bg-destructive/10 text-destructive',
    same: 'text-muted-foreground',
};

export function DiffView({ diff }: { diff: DiffLine[] }) {
    if (diff.length === 0) {
        return <p className="text-sm italic text-muted-foreground">Sem alterações.</p>;
    }

    return (
        <div className="overflow-hidden rounded-md border font-mono text-sm">
            <table className="w-full border-collapse">
                <tbody>
                    {diff.map((line, i) => (
                        <tr key={i} className={rowClass[line.op]}>
                            {/* gutter */}
                            <td
                                className="w-6 select-none border-r border-border px-2 text-center align-top text-muted-foreground"
                                aria-hidden="true"
                            >
                                {gutterChar[line.op]}
                            </td>
                            {/* line content */}
                            <td className="w-full whitespace-pre-wrap break-words px-3 py-0.5 align-top">
                                {line.text || ' '}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
