import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { slugify } from '@/modules/knowledge/knowledge.links';
import { Button } from '@/components/ui/button';

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

interface MarkdownProps {
    content: string;
    /** Pre-process [[wikilinks]] into internal links. Defaults to true. */
    wikilinks?: boolean;
    /**
     * Quando definido, os links internos (href que começa por "/") chamam este
     * handler em vez de navegar — usado no pane para abrir o alvo numa tab
     * (criando a nota se o link estiver quebrado). Torna o componente client-only.
     */
    onInternalLink?: (href: string) => void;
}

/**
 * Shared markdown renderer used in note pages (wikilinks=true, the default)
 * and in the chat assistant bubbles (wikilinks=false).
 *
 * No 'use client' — react-markdown is isomorphic; this component is usable
 * in both server components and client components.
 *
 * XSS: rehype-raw / allowDangerousHtml are intentionally NOT used — react-markdown
 * escapes HTML by default, keeping the surface safe.
 */
export function Markdown({ content, wikilinks = true, onInternalLink }: MarkdownProps) {
    const processed = wikilinks ? preprocessWikilinks(content) : content;

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                h1: ({ children }) => (
                    <h1 className="mb-2 mt-6 text-2xl font-semibold text-foreground">{children}</h1>
                ),
                h2: ({ children }) => (
                    <h2 className="mb-2 mt-5 text-xl font-semibold text-foreground">{children}</h2>
                ),
                h3: ({ children }) => (
                    <h3 className="mb-1 mt-4 text-lg font-medium text-foreground">{children}</h3>
                ),
                p: ({ children }) => (
                    <p className="my-2 leading-relaxed text-foreground">{children}</p>
                ),
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>,
                ol: ({ children }) => (
                    <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>
                ),
                li: ({ children }) => <li className="text-foreground">{children}</li>,
                a: ({ href, children }) => {
                    if (href?.startsWith('/')) {
                        if (onInternalLink) {
                            return (
                                <Button
                                    variant="link"
                                    onClick={() => onInternalLink(href)}
                                    className="h-auto p-0 align-baseline text-primary underline"
                                >
                                    {children}
                                </Button>
                            );
                        }
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
                            <code className="font-mono text-sm text-foreground">{children}</code>
                        );
                    }
                    return (
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">
                            {children}
                        </code>
                    );
                },
                pre: ({ children }) => (
                    <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3">{children}</pre>
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
    );
}
