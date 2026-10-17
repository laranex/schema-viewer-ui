import type { GateFinding, GateReport } from '../../src/contract/gate';
import { VALID } from './documents';

// Gate report fixtures, written to contract/fixtures/gate/{valid,invalid}/<name>.json. The findings come from the
// synthetic documents, so their ids are real.

type Mutable = any;
export type InvalidGateCase = { description: string; errors: string[]; report: unknown };

const tenants = VALID['comparison-tenant-schemas']();
const migrations = VALID['migrations-alembic']();
const incomplete = VALID['comparison-incomplete']();

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const differences = (doc: typeof tenants): GateFinding[] =>
    doc.comparisons.flatMap((c) =>
        c.differences.map((d) => ({
            source: 'comparison' as const,
            id: d.id,
            kind: `${snake(d.objectType)}_${d.change}`,
            severity: d.severity,
            certainty: d.certainty,
            label: (d.baseline ?? d.target)?.label ?? d.key.join('.'),
            message: d.change === 'changed' ? `${d.fields.map((f) => f.field).join(', ')} differ` : d.change === 'missing' ? 'Only in the baseline' : 'Only in the target',
        })),
    );

function report(thresholds: GateReport['thresholds'], findings: GateFinding[], errors: GateReport['errors'] = []): GateReport {
    const rank = { info: 0, warning: 1, error: 2 };
    const qualifying = findings.filter((f) => rank[f.severity] >= rank[thresholds.severity] && (thresholds.certainty === 'likely' || f.certainty === 'certain')).length;
    const sorted = [...findings].sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : a.kind < b.kind ? -1 : 1));
    const exitCode = errors.length ? 2 : qualifying ? 1 : 0;
    const by = (s: GateFinding['severity']) => findings.filter((f) => f.severity === s).length;
    return {
        format: 'laranex-schema-gate',
        version: '1.0',
        passed: exitCode === 0,
        exitCode,
        thresholds,
        counts: { findings: findings.length, qualifying, error: by('error'), warning: by('warning'), info: by('info') },
        findings: sorted,
        errors,
    };
}

const behind = migrations.migrations.find((m) => m.status === 'behind') as (typeof migrations.migrations)[number];
const migrationFinding: GateFinding = { source: 'migration', id: behind.id, kind: 'migration_behind', severity: 'error', certainty: 'certain', label: `alembic · ${behind.schema}`, message: `${behind.pending?.length} revisions are not applied` };
const infoOnly = differences(tenants).filter((f) => f.severity === 'info');

export const GATE_VALID: Record<string, GateReport> = {
    // Only info findings, below the warning threshold.
    passed: report({ severity: 'warning', certainty: 'certain' }, infoOnly),
    // Tenant drift and a migration behind its head.
    drift: report({ severity: 'warning', certainty: 'certain' }, [...differences(tenants), migrationFinding]),
    // An incomplete comparison never passes, whatever it found.
    incomplete: report({ severity: 'error', certainty: 'likely' }, differences(incomplete), [
        { kind: 'comparison_incomplete', message: `Comparison ${incomplete.comparisons[0].id} is incomplete: ${incomplete.comparisons[0].omitted} differences omitted, and check constraints were not read.` },
    ]),
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
};
