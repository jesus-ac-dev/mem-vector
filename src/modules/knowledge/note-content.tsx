import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { slugify } from './knowledge.links';

/**
 * Pre-processes [[wikilinks]] into standard markdown links so react-markdown
 * handles them via the normal `a` component. Handles simple [[target]] only —
 * aliased [[target|text]] is out of scope.
 */
function preprocessWikilinks(content: string): string {
    return content.replace(/\[\[([^\]|]+)\]\]/g, (_match, target: string) => {
        const slug = slugify(target.trim());
        return `[${target.trim()}](/knowledge/${slug})`;
    });
}

/**
 * Renders note markdown content (headings, lists, code, blockquotes, etc.)
 * with [[wikilinks]] resolved to internal Next.js links.
 * All styles use semantic design tokens only — no raw palette colors.
 */
export function NoteContent({ content }: { content: string }) {
    const processed = preprocessWikilinks(content);

    return (
        <div className="mt-4 space-y-0">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => (
                        <h1 className="mb-2 mt-6 text-2xl font-semibold text-foreground">
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="mb-2 mt-5 text-xl font-semibold text-foreground">
                            {children}
                        </h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="mb-1 mt-4 text-lg font-medium text-foreground">
                            {children}
                        </h3>
                    ),
                    p: ({ children }) => (
                        <p className="my-2 leading-relaxed text-foreground">{children}</p>
                    ),
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    ul: ({ children }) => (
                        <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>
                    ),
                    li: ({ children }) => <li className="text-foreground">{children}</li>,
                    a: ({ href, children }) => {
                        if (href?.startsWith('/')) {
                            return (
                                <Link href={href} className="text-primary underline">
                                    {children}
                                </Link>
                            );
                        }
                        return (
                            <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline"
                            >
                                {children}
                            </a>
                        );
                    },
                    code: ({ children, className }) => {
                        // Block code has a language className; inline code does not
                        const isBlock = Boolean(className);
                        if (isBlock) {
                            return (
                                <code className="font-mono text-sm text-foreground">
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children }) => (
                        <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3">
                            {children}
                        </pre>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
                            {children}
                        </blockquote>
                    ),
                    hr: () => <hr className="my-4 border-border" />,
                }}
            >
                {processed}
            </ReactMarkdown>
        </div>
    );
}
