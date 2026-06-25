import { describe, expect, it } from 'vitest';

import { CHAT_PREFILL_EVENT, emitirPrefillChat, type ChatPrefillDetail } from './chat.events';

describe('emitirPrefillChat', () => {
    it('por omissão só preenche o chat', () => {
        let detail: ChatPrefillDetail | null = null;
        window.addEventListener(
            CHAT_PREFILL_EVENT,
            (ev) => {
                detail = (ev as CustomEvent<ChatPrefillDetail>).detail;
            },
            { once: true },
        );

        emitirPrefillChat('diagnostica isto');

        expect(detail).toEqual({ prompt: 'diagnostica isto', autoSend: false });
    });

    it('transporta autoSend para o kill-switch', () => {
        let detail: ChatPrefillDetail | null = null;
        window.addEventListener(
            CHAT_PREFILL_EVENT,
            (ev) => {
                detail = (ev as CustomEvent<ChatPrefillDetail>).detail;
            },
            { once: true },
        );

        emitirPrefillChat('recupera o relay', true);

        expect(detail).toEqual({ prompt: 'recupera o relay', autoSend: true });
    });
});
