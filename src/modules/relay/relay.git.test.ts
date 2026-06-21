import { describe, expect, it } from 'vitest';

import {
    buildBranchArgs,
    buildCommitPushArgs,
    buildRetomaArgs,
    comandoTestes,
    INTERN_NOME,
    nomeBranch,
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

describe('comandoTestes', () => {
    it('default = npm test', () => {
        expect(comandoTestes(undefined)).toBe('npm test');
    });
    it('respeita o RELAY_TEST_CMD', () => {
        expect(comandoTestes('pnpm -s test')).toBe('pnpm -s test');
    });
});
