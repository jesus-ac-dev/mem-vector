import { Markdown } from '@/components/ui/markdown';

/**
 * Renders note markdown content (headings, lists, code, blockquotes, etc.)
 * with [[wikilinks]] resolved to internal Next.js links.
 * All styles use semantic design tokens only — no raw palette colors.
 */
export function NoteContent({ content }: { content: string }) {
    return (
        <div className="mt-4 space-y-0">
            <Markdown content={content} wikilinks />
        </div>
    );
}
