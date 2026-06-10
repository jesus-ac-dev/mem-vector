/**
 * Shared helper for Codex-side agent routing.
 *
 * matchHook(prompt, agentName, map) -> reminder string or null.
 */
export function matchHook(prompt, agentName, map) {
    const lowerPrompt = (prompt ?? '').toLowerCase();

    const entry = (map.hooks ?? []).find((h) => h.agent === agentName);
    if (!entry) return null;

    const matched = (entry.trigger_keywords ?? []).some((k) => lowerPrompt.includes(k));
    if (!matched) return null;

    for (const defer of entry.defer_to ?? []) {
        const shouldDefer = (defer.keywords ?? []).some((k) => lowerPrompt.includes(k));
        if (shouldDefer) return null;
    }

    return entry.reminder ?? null;
}
