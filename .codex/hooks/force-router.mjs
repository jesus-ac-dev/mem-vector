#!/usr/bin/env node
// Codex-side router shim. Codex does not currently consume Claude Code hook
// settings in this repo, but this keeps the routing data executable/testable.

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
