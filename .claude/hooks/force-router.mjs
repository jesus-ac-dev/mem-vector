#!/usr/bin/env node
// UserPromptSubmit hook — router ÚNICO. Lê routing-map.json e, para cada agente,
// injeta um lembrete se as keywords casarem (com defer entre agentes). Lean: um
// ficheiro em vez de um por agente.
// Doc: https://docs.claude.com/en/docs/claude-code/hooks

import { readFileSync } from 'node:fs';
import { matchHook } from './_lib/match.mjs';

const map = JSON.parse(readFileSync(new URL('../routing-map.json', import.meta.url)));
const input = JSON.parse(readFileSync(0, 'utf8'));
const prompt = input.prompt ?? '';

const reminders = [];
for (const entry of map.hooks ?? []) {
    const r = matchHook(prompt, entry.agent, map);
    if (r) reminders.push(`- ${r}`);
}

if (reminders.length === 0) process.exit(0);

const additionalContext = ['# Agentes sugeridos para este pedido', '', ...reminders].join('\n');
process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } }),
);
