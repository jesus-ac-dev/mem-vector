#!/usr/bin/env node
// SessionStart hook — gera o manifest dos agentes deste projecto, varrendo
// `.claude/agents/**/*.md` e extraindo o frontmatter. Subdirectorias = categoria.
// Output injectado como contexto no início de cada sessão.
// Doc: https://docs.claude.com/en/docs/claude-code/hooks

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const agentsDir = join(process.cwd(), '.claude', 'agents');
if (!existsSync(agentsDir)) process.exit(0);

function parseFrontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return null;
    const out = {};
    let currentKey = null;
    for (const rawLine of m[1].split(/\r?\n/)) {
        const colonIdx = rawLine.indexOf(':');
        const looksLikeKey = colonIdx > 0 && /^[A-Za-z_][\w-]*\s*:/.test(rawLine);
        if (looksLikeKey) {
            currentKey = rawLine.slice(0, colonIdx).trim();
            out[currentKey] = rawLine.slice(colonIdx + 1).trim();
        } else if (currentKey && rawLine.trim()) {
            out[currentKey] += ' ' + rawLine.trim();
        }
    }
    return out;
}

function walkMarkdown(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkMarkdown(full));
        else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
    }
    return out;
}

const files = walkMarkdown(agentsDir);
if (files.length === 0) process.exit(0);

const agents = files
    .map((fullPath) => {
        try {
            const fm = parseFrontmatter(readFileSync(fullPath, 'utf8'));
            if (!fm || !fm.name || !fm.description) return null;
            const rel = relative(agentsDir, fullPath);
            const segments = rel.split(sep);
            const category = segments.length > 1 ? segments[0] : '(geral)';
            return {
                name: fm.name,
                description: fm.description,
                tools: fm.tools ?? '(herda todas)',
                model: fm.model ?? 'inherit',
                category,
            };
        } catch {
            return null;
        }
    })
    .filter(Boolean)
    .sort((a, b) => (a.category !== b.category ? a.category.localeCompare(b.category) : a.name.localeCompare(b.name)));

if (agents.length === 0) process.exit(0);

const lines = [
    '# Agentes disponíveis neste projecto',
    '',
    'Para tarefas em domínios cobertos abaixo, **invoca o subagent correspondente via Agent tool antes de actuar**. Os agentes lêem as skills (`.claude/skills/*.md`) e aplicam as regras da casa.',
    '',
];

let lastCategory = null;
for (const a of agents) {
    if (a.category !== lastCategory) {
        lines.push('---', `### Domínio: \`${a.category}\``, '');
        lastCategory = a.category;
    }
    lines.push(`#### \`${a.name}\``, `**Tools:** ${a.tools} · **Model:** ${a.model}`, `**Quando usar:** ${a.description}`, '');
}

process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') } }),
);
