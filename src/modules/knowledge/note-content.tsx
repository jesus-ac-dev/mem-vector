import Link from 'next/link';
import { slugify } from './knowledge.links';

/**
 * Renders note markdown text with [[wikilinks]] turned into clickable links.
 * Preserves all whitespace (whitespace-pre-wrap). Full markdown rendering
 * (headings, bold, etc.) is out of scope — just wikilinks + whitespace.
 */
export function NoteContent({ content }: { content: string }) {
    const segments: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // Create the regex inside the function so lastIndex resets are safe
    const wikilinkRe = /\[\[([^\]]+)\]\]/g;

    while ((match = wikilinkRe.exec(content)) !== null) {
        // Text before this wikilink
        if (match.index > lastIndex) {
            segments.push(content.slice(lastIndex, match.index));
        }

        const target = match[1];
        const slug = slugify(target);
        segments.push(
            <Link
                key={`${slug}-${match.index}`}
                href={`/knowledge/${slug}`}
                className="text-primary underline"
            >
                {target}
            </Link>,
        );

        lastIndex = match.index + match[0].length;
    }

    // Remaining text after the last wikilink
    if (lastIndex < content.length) {
        segments.push(content.slice(lastIndex));
    }

    return <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">{segments}</p>;
}
