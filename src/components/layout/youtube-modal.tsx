'use client';

import { useState } from 'react';
import Link from 'next/link';

import { logClientError } from '@/lib/client-error-log';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ingerirVideoAction, type IngestaoResult } from '@/modules/youtube/youtube.actions';

// #101: cola um link do YouTube → o transcript vira uma nota (YouTube/<autor>/),
// pronta para discutir no chat. A ingestão é um dump; a inteligência é a conversa.
type Estado =
    | { tipo: 'idle' }
    | { tipo: 'a-ingerir' }
    | { tipo: 'ok'; r: IngestaoResult }
    | { tipo: 'erro'; msg: string };

export function YoutubeModal({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const [url, setUrl] = useState('');
    const [estado, setEstado] = useState<Estado>({ tipo: 'idle' });

    async function ingerir() {
        setEstado({ tipo: 'a-ingerir' });
        try {
            // Chamada DIRETA (não runClientAction): este último engole o erro e
            // devolve undefined, o que comia as mensagens do servidor (sem
            // legendas, 429, privado). Aqui o catch recebe-as e mostra-as.
            const r = await ingerirVideoAction(url);
            setEstado({ tipo: 'ok', r });
            setUrl('');
        } catch (e) {
            logClientError({ area: 'youtube', action: 'ingerir' }, e);
            setEstado({ tipo: 'erro', msg: e instanceof Error ? e.message : 'Falhou.' });
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                onOpenChange(v);
                if (!v) setEstado({ tipo: 'idle' });
            }}
        >
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Ingerir vídeo do YouTube</DialogTitle>
                    <DialogDescription>
                        Cola o link — o transcript vira uma nota no workspace, pronta para
                        discutires.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <Input
                            value={url}
                            placeholder="https://www.youtube.com/watch?v=..."
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && url.trim()) void ingerir();
                            }}
                        />
                        <Button
                            disabled={estado.tipo === 'a-ingerir' || !url.trim()}
                            onClick={() => void ingerir()}
                        >
                            {estado.tipo === 'a-ingerir' ? 'A ingerir…' : 'Ingerir'}
                        </Button>
                    </div>
                    {estado.tipo === 'a-ingerir' ? (
                        <p className="text-sm text-muted-foreground">A buscar a transcrição…</p>
                    ) : null}
                    {estado.tipo === 'erro' ? (
                        <p className="text-sm text-destructive">{estado.msg}</p>
                    ) : null}
                    {estado.tipo === 'ok' ? (
                        <p className="text-sm text-muted-foreground">
                            Pronto:{' '}
                            <Link
                                href={`/knowledge/${estado.r.slug}`}
                                className="font-medium text-primary"
                                onClick={() => onOpenChange(false)}
                            >
                                {estado.r.title}
                            </Link>{' '}
                            — de {estado.r.author}. Já podes falar sobre ele.
                        </p>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}
