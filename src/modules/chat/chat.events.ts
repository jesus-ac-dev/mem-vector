export const CHAT_PREFILL_EVENT = 'memvector:chat-prefill';

export interface ChatPrefillDetail {
    prompt: string;
}

export function emitirPrefillChat(prompt: string): void {
    window.dispatchEvent(
        new CustomEvent<ChatPrefillDetail>(CHAT_PREFILL_EVENT, { detail: { prompt } }),
    );
}
