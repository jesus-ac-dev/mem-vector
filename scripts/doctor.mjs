#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const requiredEnv = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MEMVECTOR_KEYS_SECRET',
];

const optionalCommands = [
    ['docker', ['--version'], 'Supabase local'],
    ['supabase', ['--version'], 'migrations/DB local'],
    ['gh', ['--version'], 'GitHub module/issues'],
    ['python3', ['--version'], 'ferramentas auxiliares'],
    ['yt-dlp', ['--version'], 'ingestao YouTube local'],
    ['claude', ['--version'], 'provider Claude em modo CLI'],
    ['codex', ['--version'], 'provider Codex em modo CLI'],
    ['gemini', ['--version'], 'provider Gemini em modo CLI'],
];

let failures = 0;

function ok(message) {
    console.log(`OK   ${message}`);
}

function warn(message) {
    console.log(`WARN ${message}`);
}

function fail(message) {
    failures += 1;
    console.log(`FAIL ${message}`);
}

function commandExists(bin, args = ['--version']) {
    const res = spawnSync(bin, args, { encoding: 'utf8', stdio: 'pipe' });
    return !res.error && res.status === 0;
}

function parseEnvFile(path) {
    if (!existsSync(path)) return null;
    const env = new Map();
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
        env.set(key.trim(), value);
    }
    return env;
}

console.log('mem-vector doctor\n');

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
if (nodeMajor >= 20) ok(`Node ${process.versions.node}`);
else fail(`Node 20+ necessario; encontrado ${process.versions.node}`);

if (commandExists('npm')) ok('npm no PATH');
else fail('npm nao encontrado no PATH');

const env = parseEnvFile('.env.local');
if (!env) {
    fail('.env.local nao existe; corre: cp .env.example .env.local');
} else {
    ok('.env.local encontrado');
    for (const key of requiredEnv) {
        const value = env.get(key) ?? process.env[key] ?? '';
        if (value && !value.includes('<') && !value.includes('>')) ok(`${key} definido`);
        else fail(`${key} em falta ou ainda placeholder`);
    }
}

for (const [bin, args, purpose] of optionalCommands) {
    if (commandExists(bin, args)) ok(`${bin} encontrado (${purpose})`);
    else warn(`${bin} nao encontrado (${purpose}; opcional conforme o caminho usado)`);
}

console.log('');
if (failures > 0) {
    console.error(`${failures} requisito(s) obrigatorio(s) por resolver.`);
    process.exit(1);
}

console.log('Maquina pronta para arrancar a app.');
