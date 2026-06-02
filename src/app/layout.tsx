import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
    title: 'mem-vector',
    description: 'Núcleo SaaS do MythosEngine — falas, os agentes escrevem.',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="pt-PT" suppressHydrationWarning>
            <body className="min-h-screen bg-background text-foreground antialiased">
                {children}
            </body>
        </html>
    );
}
