import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    buildBranchArgs,
    buildCommitPushArgs,
    buildIdentidadeArgs,
    buildRetomaArgs,
    buildStatusArgs,
    buildWorktreeAddArgs,
    buildWorktreeRemoveArgs,
    comandoTestes,
    INTERN_EMAIL,
    INTERN_NOME,
    nomeBranch,
    prepararWorktree,
    removerWorktree,
    worktreeDir,
    worktreeRoot,
} from './relay.git';

describe('nomeBranch', () => {
    it('feat/issue-N (Intern Rule)', () => {
        expect(nomeBranch(42)).toBe('feat/issue-42');
    });
});

describe('buildBranchArgs', () => {
    it('parte do ramo default REAL (não assume main), cria o branch e põe a identidade', () => {
        const seq = buildBranchArgs('feat/issue-1', 'master');
        expect(seq[0]).toEqual(['checkout', 'master']);
        expect(seq).toContainEqual(['pull', '--ff-only']);
        expect(seq).toContainEqual(['checkout', '-B', 'feat/issue-1']);
        expect(seq).toContainEqual(['config', 'user.name', INTERN_NOME]);
    });
});

describe('buildRetomaArgs', () => {
    it('CONTINUA o branch (checkout sem -B, sem tocar na base) + identidade', () => {
        const seq = buildRetomaArgs('feat/issue-1');
        expect(seq[0]).toEqual(['checkout', 'feat/issue-1']);
        // Não reseta: nada de checkout base nem -B (preserva o trabalho no disco).
        expect(seq.some((a) => a[0] === 'checkout' && a[1] === 'main')).toBe(false);
        expect(seq.some((a) => a.includes('-B'))).toBe(false);
        expect(seq).toContainEqual(['config', 'user.name', INTERN_NOME]);
    });
});

describe('buildCommitPushArgs', () => {
    it('add -A → commit → push do branch', () => {
        const seq = buildCommitPushArgs('feat/issue-1', 'feat: x');
        expect(seq[0]).toEqual(['add', '-A']);
        expect(seq[1]).toEqual(['commit', '-m', 'feat: x']);
        expect(seq[2]).toEqual(['push', '-u', 'origin', 'feat/issue-1']);
    });
});

describe('buildStatusArgs', () => {
    it('preflight de árvore limpa antes de fresh run', () => {
        expect(buildStatusArgs()).toEqual(['status', '--porcelain']);
    });
});

describe('comandoTestes', () => {
    it('default = npm test', () => {
        expect(comandoTestes(undefined)).toBe('npm test');
    });
    it('respeita o RELAY_TEST_CMD', () => {
        expect(comandoTestes('pnpm -s test')).toBe('pnpm -s test');
    });
});

describe('worktreeRoot', () => {
    it('default = irmã do repo (.relay-worktrees), sem sujar a working-copy', () => {
        expect(worktreeRoot('/home/x/src/mem-vector', undefined)).toBe('/home/x/src/.relay-worktrees');
    });
    it('respeita o RELAY_WORKTREE_ROOT', () => {
        expect(worktreeRoot('/home/x/src/mem-vector', '/custom/wt')).toBe('/custom/wt');
    });
});

describe('worktreeDir', () => {
    it('dir determinístico por issue (<basename>-issue-N) sob a raiz', () => {
        expect(worktreeDir('/r/mem-vector', 7, '/custom')).toBe('/custom/mem-vector-issue-7');
    });
});

describe('buildWorktreeAddArgs', () => {
    it('cria o branch a partir do base REMOTO fresco (origin/<base>)', () => {
        expect(buildWorktreeAddArgs('/wt/d', 'feat/issue-3', 'main')).toEqual([
            'worktree',
            'add',
            '-B',
            'feat/issue-3',
            '/wt/d',
            'origin/main',
        ]);
    });
});

describe('buildIdentidadeArgs', () => {
    it('configura a identidade do bot (nunca commita como o humano)', () => {
        expect(buildIdentidadeArgs()).toEqual([
            ['config', 'user.name', INTERN_NOME],
            ['config', 'user.email', INTERN_EMAIL],
        ]);
    });
});

describe('buildWorktreeRemoveArgs', () => {
    it('remove --force o dir do worktree', () => {
        expect(buildWorktreeRemoveArgs('/wt/d')).toEqual(['worktree', 'remove', '--force', '/wt/d']);
    });
});

describe('prepararWorktree (integração git)', () => {
    let tmpRoot: string;
    let repo: string;
    let dir: string;
    const git = (cwd: string, ...args: string[]) =>
        execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

    beforeAll(() => {
        tmpRoot = mkdtempSync(join(tmpdir(), 'relay-wt-'));
        const bare = join(tmpRoot, 'origin.git');
        repo = join(tmpRoot, 'repo');
        execFileSync('git', ['init', '--bare', bare]);
        execFileSync('git', ['init', '-b', 'main', repo]);
        git(repo, 'config', 'user.name', 'Test');
        git(repo, 'config', 'user.email', 'test@test.local');
        writeFileSync(join(repo, 'README.md'), '# base\n');
        git(repo, 'add', '-A');
        git(repo, 'commit', '-m', 'base');
        git(repo, 'remote', 'add', 'origin', bare);
        git(repo, 'push', '-u', 'origin', 'main');
        // Artefactos NÃO-versionados que o worktree deve ligar por symlink.
        mkdirSync(join(repo, 'node_modules'));
        writeFileSync(join(repo, 'node_modules', 'marker.txt'), 'dep');
        writeFileSync(join(repo, '.env.local'), 'SECRET=1\n');
        dir = worktreeDir(repo, 1, join(tmpRoot, 'wt'));
    });

    afterAll(() => {
        rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('cria o worktree isolado no branch da issue, com os artefactos ligados', async () => {
        await prepararWorktree({ repoPath: repo, dir, branch: 'feat/issue-1', base: 'main', token: '', retoma: false });
        expect(existsSync(dir)).toBe(true);
        expect(git(dir, 'branch', '--show-current').trim()).toBe('feat/issue-1');
        expect(existsSync(join(dir, 'README.md'))).toBe(true); // checkout do base
        expect(existsSync(join(dir, 'node_modules', 'marker.txt'))).toBe(true); // symlink resolve
        expect(existsSync(join(dir, '.env.local'))).toBe(true);
    });

    it('na retoma reusa o dir e preserva o trabalho NÃO-commitado', async () => {
        writeFileSync(join(dir, 'WIP.txt'), 'em progresso');
        await prepararWorktree({ repoPath: repo, dir, branch: 'feat/issue-1', base: 'main', token: '', retoma: true });
        expect(existsSync(join(dir, 'WIP.txt'))).toBe(true); // não resetou de base
    });

    it('removerWorktree apaga o dir', async () => {
        await removerWorktree(repo, dir);
        expect(existsSync(dir)).toBe(false);
    });
});
