import { array, boolean, integer, literal, object, oneOf, string, type JsonSchema, type Shape } from './shape';
import { byList } from './ids';
import type { Certainty, Severity } from './types';

// The CI gate report: what a producer's gate command (Python, Node.js, Laravel) prints as JSON after checking a
// document's diagnostics, comparisons and migration tracks against thresholds. It is a separate format from the
// document; docs/contract.md, "Gate reports", gives the rules.

export const GATE_FORMAT = 'laranex-schema-gate';
export const GATE_VERSION = '1.0';

export type GateFinding = {
    source: 'diagnostic' | 'comparison' | 'migration';
    // The diagnostic's, difference's or migration track's id.
    id: string;
    // The diagnostic kind; <object_type>_<change> for a difference (column_changed, primary_key_missing);
    // migration_<status> for a track (migration_behind).
    kind: string;
    severity: Severity;
    certainty: Certainty;
    label: string;
    message: string;
};

// What kept the gate from checking: an incomplete comparison, an unknown migration status, a failed inspection or
// a validation that could not be completed. Any error makes the exit code 2.
export type GateError = { kind: string; message: string };

export type GateReport = {
    format: typeof GATE_FORMAT;
    version: string;
    passed: boolean;
    // 0: passed. 1: at least one finding meets the thresholds. 2: the check could not be completed.
    exitCode: 0 | 1 | 2;
    // A finding qualifies when its severity is at least thresholds.severity and, with certainty "certain", it is
    // certain (with "likely", certain and likely findings both qualify).
    thresholds: { severity: Severity; certainty: Certainty };
    counts: { findings: number; qualifying: number; error: number; warning: number; info: number };
    findings: GateFinding[];
    errors: GateError[];
};

const severity = oneOf(['error', 'warning', 'info']);
const certainty = oneOf(['certain', 'likely']);
const count = () => integer({ minimum: 0 });

export const gateReportShape: Shape = object({
    format: literal(GATE_FORMAT),
    version: string({ pattern: '^1\\.(0|[1-9][0-9]*)$' }),
    passed: boolean(),
    exitCode: {
        schema: { enum: [0, 1, 2] },
        check: (v, path, { errors }) => {
            if (v !== 0 && v !== 1 && v !== 2) {
                errors.push(`${path}: expected 0, 1 or 2, got ${JSON.stringify(v)}`);
            }
        },
    },
    thresholds: object({ severity, certainty }),
    counts: object({ findings: count(), qualifying: count(), error: count(), warning: count(), info: count() }),
    findings: array(
        object({
            source: oneOf(['diagnostic', 'comparison', 'migration']),
            id: string({ minLength: 1 }),
            kind: string({ pattern: '^[a-z][a-z0-9_]*$' }),
            severity,
            certainty,
            label: string(),
            message: string(),
        }),
    ),
    errors: array(object({ kind: string({ pattern: '^[a-z][a-z0-9_]*$' }), message: string({ minLength: 1 }) })),
});

export function gateReportJsonSchema(): JsonSchema {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://laranex.github.io/schema-viewer-ui/laranex-schema-gate/1.0.json',
        title: 'laranex-schema-gate 1.x report',
        ...gateReportShape.schema,
    };
}

const RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };
const PREFIX: Record<GateFinding['source'], string> = { diagnostic: 'n', comparison: 'x', migration: 'm' };

export const qualifies = (finding: Pick<GateFinding, 'severity' | 'certainty'>, thresholds: GateReport['thresholds']) =>
    RANK[finding.severity] >= RANK[thresholds.severity] && (thresholds.certainty === 'likely' || finding.certainty === 'certain');

export type GateValidationResult = { ok: true; report: GateReport; errors: [] } | { ok: false; errors: string[] };

export function validateGateReport(value: unknown, options: { strict?: boolean } = {}): GateValidationResult {
    const errors: string[] = [];
    gateReportShape.check(value, '$', { errors, strict: options.strict ?? false });
    if (errors.length === 0) {
        const r = value as GateReport;
        if (options.strict && r.version !== GATE_VERSION) {
            errors.push(`$.version: strict validation is for version ${GATE_VERSION}, got ${JSON.stringify(r.version)}`);
        }
        const qualifying = r.findings.filter((f) => qualifies(f, r.thresholds)).length;
        const expectedExit = r.errors.length ? 2 : qualifying ? 1 : 0;
        if (r.exitCode !== expectedExit) {
            errors.push(`Exit code ${r.exitCode} does not follow the errors and qualifying findings (expected ${expectedExit})`);
        }
        if (r.passed !== (r.exitCode === 0)) {
            errors.push('passed is true exactly when the exit code is 0');
        }
        const by = (s: Severity) => r.findings.filter((f) => f.severity === s).length;
        if (r.counts.findings !== r.findings.length || r.counts.qualifying !== qualifying || r.counts.error !== by('error') || r.counts.warning !== by('warning') || r.counts.info !== by('info')) {
            errors.push('Counts do not count the findings');
        }
        r.findings.forEach((f, i) => {
            if (!f.id.startsWith(PREFIX[f.source])) {
                errors.push(`A ${f.source} finding names a ${f.source === 'diagnostic' ? 'diagnostic' : f.source === 'comparison' ? 'difference' : 'migration track'} id: findings[${i}]`);
            }
            if (i > 0 && byList([r.findings[i - 1].source, r.findings[i - 1].id, r.findings[i - 1].kind], [f.source, f.id, f.kind]) >= 0) {
                errors.push(`Findings are unique and sorted by source, id and kind: findings[${i}]`);
            }
        });
        r.errors.forEach((e, i) => {
            if (i > 0 && byList([r.errors[i - 1].kind, r.errors[i - 1].message], [e.kind, e.message]) >= 0) {
                errors.push(`Errors are unique and sorted by kind and message: errors[${i}]`);
            }
        });
    }
    return errors.length ? { ok: false, errors } : { ok: true, report: value as GateReport, errors: [] };
}
