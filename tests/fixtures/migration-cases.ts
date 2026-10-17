import type { MigrationHistory, MigrationRevision, MigrationStatus } from '../../src/contract/types';

// Migration conformance cases, written to contract/conformance/migrations/<name>.json as
// { description, input: { revisions, current }, expected: { history, status, pending, unknownRevisions } }.
// revisions null means the scripts could not be read; current null means the version table could not be read, and []
// that it records nothing or does not exist. The expected values are written out by hand.

export type MigrationCase = {
    description: string;
    input: { revisions: MigrationRevision[] | null; current: string[] | null };
    expected: { history: MigrationHistory | null; status: MigrationStatus; pending: string[] | null; unknownRevisions: string[] };
};

const r = (id: string, parents: string[] = [], branchLabels: string[] = []): MigrationRevision => ({ id, parents, branchLabels });
// a → b → c
const LINEAR = [r('a'), r('b', ['a']), r('c', ['b'])];
const LINEAR_HISTORY: MigrationHistory = { revisions: LINEAR, heads: ['c'], missing: [] };
// a → b, a → x (two heads)
const BRANCHED = [r('a'), r('b', ['a']), r('x', ['a'], ['feature'])];
const BRANCHED_HISTORY: MigrationHistory = { revisions: BRANCHED, heads: ['b', 'x'], missing: [] };
// a → b → m, a → x → m (merged)
const MERGED = [r('a'), r('b', ['a']), r('m', ['x', 'b']), r('x', ['a'])];
const MERGED_HISTORY: MigrationHistory = { revisions: [r('a'), r('b', ['a']), r('m', ['b', 'x']), r('x', ['a'])], heads: ['m'], missing: [] };
// (z missing) → b → c
const PARTIAL = [r('c', ['b']), r('b', ['z'])];
const PARTIAL_HISTORY: MigrationHistory = { revisions: [r('b', ['z']), r('c', ['b'])], heads: ['c'], missing: ['z'] };

export const MIGRATION_CASES: Record<string, MigrationCase> = {
    'up-to-date': {
        description: 'The database is at the only head',
        input: { revisions: LINEAR, current: ['c'] },
        expected: { history: LINEAR_HISTORY, status: 'up_to_date', pending: [], unknownRevisions: [] },
    },
    behind: {
        description: 'The database is at an ancestor of the head; pending lists what is not applied, sorted',
        input: { revisions: LINEAR, current: ['a'] },
        expected: { history: LINEAR_HISTORY, status: 'behind', pending: ['b', 'c'], unknownRevisions: [] },
    },
    'multiple-heads-behind': {
        description: 'With two unmerged heads, a database at one of them is behind the other',
        input: { revisions: BRANCHED, current: ['b'] },
        expected: { history: BRANCHED_HISTORY, status: 'behind', pending: ['x'], unknownRevisions: [] },
    },
    'multiple-heads-up-to-date': {
        description: 'A database at every head is up to date',
        input: { revisions: BRANCHED, current: ['b', 'x'] },
        expected: { history: BRANCHED_HISTORY, status: 'up_to_date', pending: [], unknownRevisions: [] },
    },
    'merge-behind': {
        description: 'A database at both merged branches is behind the merge revision; parents are sorted',
        input: { revisions: MERGED, current: ['b', 'x'] },
        expected: { history: MERGED_HISTORY, status: 'behind', pending: ['m'], unknownRevisions: [] },
    },
    diverged: {
        description: 'Current revisions that overlap (one is an ancestor of another) are diverged; pending is not determined',
        input: { revisions: LINEAR, current: ['a', 'c'] },
        expected: { history: LINEAR_HISTORY, status: 'diverged', pending: null, unknownRevisions: [] },
    },
    uninitialized: {
        description: 'No revision recorded: uninitialized, with every revision pending',
        input: { revisions: LINEAR, current: [] },
        expected: { history: LINEAR_HISTORY, status: 'uninitialized', pending: ['a', 'b', 'c'], unknownRevisions: [] },
    },
    'uninitialized-without-history': {
        description: 'Uninitialized takes precedence over unreadable scripts; pending is then not determined',
        input: { revisions: null, current: [] },
        expected: { history: null, status: 'uninitialized', pending: null, unknownRevisions: [] },
    },
    'history-unavailable': {
        description: 'Unreadable scripts with a recorded revision: unknown, and nothing can be called an unknown revision',
        input: { revisions: null, current: ['c'] },
        expected: { history: null, status: 'unknown', pending: null, unknownRevisions: [] },
    },
    'version-table-unreadable': {
        description: 'An unreadable version table: unknown',
        input: { revisions: LINEAR, current: null },
        expected: { history: LINEAR_HISTORY, status: 'unknown', pending: null, unknownRevisions: [] },
    },
    'unknown-revision': {
        description: 'A recorded revision the history does not have is listed in unknownRevisions; status unknown',
        input: { revisions: LINEAR, current: ['q', 'c'] },
        expected: { history: LINEAR_HISTORY, status: 'unknown', pending: null, unknownRevisions: ['q'] },
    },
    'partial-history-behind': {
        description: 'A missing parent below the current revision does not prevent a status',
        input: { revisions: PARTIAL, current: ['b'] },
        expected: { history: PARTIAL_HISTORY, status: 'behind', pending: ['c'], unknownRevisions: [] },
    },
    'partial-history-missing-pending': {
        description: 'A missing revision that would be pending cannot be judged: unknown',
        input: { revisions: [r('b', ['z']), r('c', ['b']), r('d', ['y'])], current: ['c'] },
        expected: { history: { revisions: [r('b', ['z']), r('c', ['b']), r('d', ['y'])], heads: ['c', 'd'], missing: ['y', 'z'] }, status: 'unknown', pending: null, unknownRevisions: [] },
    },
    'missing-parent-recorded': {
        description: 'A recorded revision that is only a missing parent is an unknown revision',
        input: { revisions: PARTIAL, current: ['z'] },
        expected: { history: PARTIAL_HISTORY, status: 'unknown', pending: null, unknownRevisions: ['z'] },
    },
};
