'use client';

import { useEffect } from 'react';
import { logClientError } from '@/lib/client-error-log';

export function ClientErrorListener() {
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

        window.addEventListener('unhandledrejection', onUnhandledRejection);
        window.addEventListener('error', onError);
        return () => {
            window.removeEventListener('unhandledrejection', onUnhandledRejection);
            window.removeEventListener('error', onError);
        };
    }, []);

    return null;
}
