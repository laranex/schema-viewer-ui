import { gateDocument, type GateReport } from '../../src/contract/gate';
import { VALID } from './documents';

// Gate report fixtures, written to contract/fixtures/gate/{valid,invalid}/<name>.json: gateDocument's reports on the
// synthetic documents, and broken copies of them. contract/conformance/gate/ checks gateDocument itself.

type Mutable = any;
export type InvalidGateCase = { description: string; errors: string[]; report: unknown };

export const GATE_VALID: Record<string, GateReport> = {
    // Only info and warning findings, below the error threshold.
    passed: gateDocument(VALID['inferred-associations'](), { thresholds: { severity: 'error' } }),
    // Tenant drift and a migration track behind its head.
    drift: gateDocument(VALID['comparison-tenant-schemas']()),
    // Only the requested comparisons, here every tenant compared with tenant_a.
    requested: gateDocument(VALID['comparison-tenant-schemas'](), { requested: [{ baseline: { connection: 'app', schema: 'tenant_a' }, target: { connection: 'app', schema: '*' } }] }),
    // An incomplete comparison and unavailable coverage never pass, whatever was found.
    incomplete: gateDocument(VALID['comparison-incomplete'](), { thresholds: { severity: 'error', certainty: 'likely' } }),
    // Migration tracks in every status: findings, unknown statuses and a failed inspection.
    migrations: gateDocument(VALID['migrations-alembic']()),
    invalid: gateDocument({ ...VALID['database-sqlite-indexes'](), version: '3.0' }),
};

const from = (name: string, change: (r: Mutable) => void) => {
    const r = structuredClone(GATE_VALID[name]) as Mutable;
    change(r);
    return r;
};

export const GATE_INVALID: Record<string, InvalidGateCase> = {
    'passed-with-qualifying-findings': {
        description: 'A report that passes although findings meet the thresholds',
        errors: ['Exit code 0 does not follow the errors and qualifying findings (expected 1)'],
        report: from('drift', (r) => ((r.exitCode = 0), (r.passed = true))),
    },
    'incomplete-reported-as-drift': {
        description: 'An incomplete check reported with exit code 1 instead of 2',
        errors: ['expected 2'],
        report: from('incomplete', (r) => (r.exitCode = 1)),
    },
    'passed-flag-mismatch': {
        description: 'passed true beside a non-zero exit code',
        errors: ['passed is true exactly when the exit code is 0'],
        report: from('drift', (r) => (r.passed = true)),
    },
    'counts-mismatch': {
        description: 'Counts that do not count the findings',
        errors: ['Counts do not count the findings'],
        report: from('drift', (r) => (r.counts.qualifying += 1)),
    },
    'finding-wrong-id': {
        description: 'A migration finding naming a difference id',
        errors: ['A migration finding names a migration track id'],
        report: from('drift', (r) => (r.findings.find((f: Mutable) => f.source === 'migration').id = r.findings[0].id)),
    },
    'findings-unsorted': {
        description: 'Findings out of order',
        errors: ['Findings are unique and sorted by source, id and kind'],
        report: from('drift', (r) => r.findings.reverse()),
    },
    'exit-code-out-of-range': {
        description: 'An exit code the gate does not define',
        errors: ['$.exitCode: expected 0, 1 or 2, got 3'],
        report: from('incomplete', (r) => (r.exitCode = 3)),
    },
    'unknown-error-kind': {
        description: 'An error kind the gate does not define',
        errors: ['$.errors[0].kind: expected one of'],
        report: from('incomplete', (r) => (r.errors[0].kind = 'comparison_failed')),
    },
    'comparison-finding-kind': {
        description: 'A comparison finding whose kind is not <object_type>_<change>',
        errors: ["A comparison finding's kind is <object_type>_<change>"],
        report: from('drift', (r) => (r.findings[0].kind = 'column_renamed')),
    },
    'migration-finding-severity': {
        description: 'A behind migration track reported as a warning',
        errors: ['A migration finding is migration_behind or migration_diverged (error) or migration_uninitialized (warning), and certain'],
        report: from('drift', (r) => {
            const f = r.findings.find((x: Mutable) => x.source === 'migration');
            f.severity = 'warning';
            r.counts.error -= 1;
            r.counts.warning += 1;
        }),
    },
    'invalid-document-with-findings': {
        description: 'A report on an invalid document that lists findings',
        errors: ['A report on an invalid document has no other error, no findings and no checked comparisons'],
        report: from('invalid', (r) => (r.comparisons = ['c0000000000000000'])),
    },
    'checked-comparisons-unsorted': {
        description: 'Checked comparison ids out of order',
        errors: ['Checked comparisons are unique and sorted'],
        report: from('drift', (r) => r.comparisons.push(r.comparisons[0])),
    },
    'requested-unsorted': {
        description: 'Requested comparisons out of order',
        errors: ['Requested comparisons are unique and sorted'],
        report: from('requested', (r) => r.requested.push({ baseline: { connection: 'app', schema: null }, target: { connection: 'app', schema: 'tenant_b' } })),
    },
};
