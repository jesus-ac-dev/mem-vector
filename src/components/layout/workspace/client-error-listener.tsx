'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

import { logClientError, STALE_APP_EVENT } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';

export function ClientErrorListener() {
    // Banner de app stale (#49): a UI deixa de morrer em silêncio quando o
    // build rodou os action IDs ou a sessão expirou — oferece a recarga.
    // Sem auto-reload: o utilizador pode ter edição por guardar.
    const [staleApp, setStaleApp] = useState(false);

    useEffect(() => {
        function onUnhandledRejection(event: PromiseRejectionEvent) {
            logClientError(
                { area: 'browser', action: 'unhandledrejection' },
                event.reason ?? 'Promise rejeitada sem reason',
            );
        }

        function onError(event: ErrorEvent) {
            logClientError(
                {
                    area: 'browser',
                    action: 'error',
                    meta: {
                        message: event.message,
                        filename: event.filename,
                        lineno: event.lineno,
                        colno: event.colno,
                    },
                },
                event.error ?? event.message,
            );
        }

        function onStaleApp() {
            setStaleApp(true);
        }

        window.addEventListener('unhandledrejection', onUnhandledRejection);
        window.addEventListener('error', onError);
        window.addEventListener(STALE_APP_EVENT, onStaleApp);
        return () => {
            window.removeEventListener('unhandledrejection', onUnhandledRejection);
            window.removeEventListener('error', onError);
            window.removeEventListener(STALE_APP_EVENT, onStaleApp);
        };
    }, []);

    if (!staleApp) return null;

    return (
        <div
            role="alert"
            className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b bg-muted px-4 py-2 text-sm text-foreground"
        >
            <span>A app foi atualizada ou a sessão expirou — recarrega para continuar.</span>
            <Button
                size="sm"
                onClick={() => window.location.reload()}
                className="h-7 gap-1.5 px-2 text-xs"
            >
                <RefreshCw className="h-3.5 w-3.5" />
                Recarregar
            </Button>
            <Button
                variant="ghost"
                size="icon"
                title="Dispensar"
                aria-label="Dispensar"
                onClick={() => setStaleApp(false)}
                className="h-6 w-6"
            >
                <X className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}
