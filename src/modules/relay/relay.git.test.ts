import { describe, expect, it } from 'vitest';

import { buildBranchArgs, buildCommitPushArgs, INTERN_NOME, nomeBranch } from './relay.git';

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

describe('buildCommitPushArgs', () => {
    it('add -A → commit → push do branch', () => {
        const seq = buildCommitPushArgs('feat/issue-1', 'feat: x');
        expect(seq[0]).toEqual(['add', '-A']);
        expect(seq[1]).toEqual(['commit', '-m', 'feat: x']);
        expect(seq[2]).toEqual(['push', '-u', 'origin', 'feat/issue-1']);
    });
});
