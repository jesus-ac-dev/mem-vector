/**
 * Helper partilhado para routing de agentes.
 *
 * matchHook(prompt, agentName, map) → string (lembrete a injectar) ou null.
 *
 * Lógica: encontra a entrada do agente no map; se alguma trigger_keyword casar
 * com o prompt e nenhuma regra defer_to casar, devolve o reminder.
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
