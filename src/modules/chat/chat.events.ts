export const CHAT_PREFILL_EVENT = 'memvector:chat-prefill';

export interface ChatPrefillDetail {
    prompt: string;
    // #M7-C: true = o chat envia logo (kill-switch); false/omisso = preenche e espera.
    autoSend?: boolean;
}

export function emitirPrefillChat(prompt: string, autoSend = false): void {
    window.dispatchEvent(
        new CustomEvent<ChatPrefillDetail>(CHAT_PREFILL_EVENT, { detail: { prompt, autoSend } }),
    );
}
