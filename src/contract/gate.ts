import { byRequest, coverageGaps, coverageGapText, expandComparisonRequests, spellScope as spell, tableLabel, type CoverageGap, type RequestedComparison } from './comparison';
import { byCodePoint, byList } from './ids';
import { array, boolean, integer, literal, nullable, object, oneOf, string, type JsonSchema, type Shape } from './shape';
import { CHANGES, FEATURES, MAJOR, OBJECT_TYPES, VERSION, type Certainty, type Comparison, type Connection, type Diagnostic, type MigrationTrack, type SchemaDocument, type Scope, type Severity, type Table } from './types';

export type { RequestedComparison };
import { validateDocument } from './validate';

// The CI drift gate: gateDocument() checks a document's comparisons, drift and reconciliation diagnostics and
// migration tracks against thresholds and returns a laranex-schema-gate report, a separate format from the document.
// docs/contract.md, "Gate reports", is the normative description; contract/conformance/gate/ checks it.

export const GATE_FORMAT = 'laranex-schema-gate';
export const GATE_VERSION = '1.0';

export type GateThresholds = { severity: Severity; certainty: Certainty };

export type GateOptions = {
    // Each one defaults separately: severity "warning", certainty "certain".
    thresholds?: Partial<GateThresholds> | null;
    // Empty or absent: every stored comparison is checked. Otherwise only these, and each must be in the document.
    requested?: RequestedComparison[] | null;
};

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

export const GATE_ERROR_KINDS = ['comparison_incomplete', 'comparison_not_found', 'coverage_incomplete', 'inspection_failed', 'invalid_document', 'migration_unknown', 'validation_incomplete'] as const;
export type GateErrorKind = (typeof GATE_ERROR_KINDS)[number];

// What kept the gate from completing the check. Any error makes the exit code 2.
export type GateError = { kind: GateErrorKind; message: string };

export type GateReport = {
    format: typeof GATE_FORMAT;
    version: string;
    passed: boolean;
    // 0: passed. 1: at least one finding meets the thresholds. 2: the check could not be completed.
    exitCode: 0 | 1 | 2;
    // A finding qualifies when its severity is at least thresholds.severity and, with certainty "certain", it is
    // certain (with "likely", certain and likely findings both qualify).
    thresholds: GateThresholds;
    // The requested comparisons, sorted and without duplicates; empty when none was requested.
    requested: RequestedComparison[];
    // The ids of the stored comparisons the gate checked, sorted.
    comparisons: string[];
    counts: { findings: number; qualifying: number; error: number; warning: number; info: number };
    findings: GateFinding[];
    errors: GateError[];
};

const severity = oneOf(['error', 'warning', 'info']);
const certainty = oneOf(['certain', 'likely']);
const count = () => integer({ minimum: 0 });
const KIND = '^[a-z][a-z0-9_]*$';
const requestedScope = object({ connection: string({ minLength: 1 }), schema: nullable(string()) });

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
    requested: array(object({ baseline: requestedScope, target: requestedScope })),
    comparisons: array(string({ minLength: 1 })),
    counts: object({ findings: count(), qualifying: count(), error: count(), warning: count(), info: count() }),
    findings: array(
        object({
            source: oneOf(['diagnostic', 'comparison', 'migration']),
            id: string({ minLength: 1 }),
            kind: string({ pattern: KIND }),
            severity,
            certainty,
            label: string(),
            message: string(),
        }),
    ),
    errors: array(object({ kind: oneOf(GATE_ERROR_KINDS), message: string({ minLength: 1 }) })),
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
const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const COMPARISON_KINDS = OBJECT_TYPES.flatMap((o) => CHANGES.map((c) => `${snake(o)}_${c}`));
// The migration statuses that are findings, with their severity; up_to_date is none, unknown an error.
const MIGRATION_SEVERITY: Partial<Record<MigrationTrack['status'], Severity>> = { behind: 'error', diverged: 'error', uninitialized: 'warning' };
export const DEFAULT_THRESHOLDS: GateThresholds = { severity: 'warning', certainty: 'certain' };
const REQUIRED_FEATURES: string[] = ['tables', 'columns'];

export const qualifies = (finding: Pick<GateFinding, 'severity' | 'certainty'>, thresholds: GateThresholds) =>
    RANK[finding.severity] >= RANK[thresholds.severity] && (thresholds.certainty === 'likely' || finding.certainty === 'certain');

// The report for what was found. Findings are sorted by source, id and kind; errors by kind and message, each listed once.
function report(thresholds: GateThresholds, requested: RequestedComparison[], comparisons: string[], findings: GateFinding[], errors: GateError[]): GateReport {
    const sortedFindings = [...findings].sort((a, b) => byList([a.source, a.id, a.kind], [b.source, b.id, b.kind]));
    const unique = new Map(errors.map((e) => [JSON.stringify([e.kind, e.message]), e]));
    const sortedErrors = [...unique.values()].sort((a, b) => byList([a.kind, a.message], [b.kind, b.message]));
    const qualifying = findings.filter((f) => qualifies(f, thresholds)).length;
    const exitCode = sortedErrors.length ? 2 : qualifying ? 1 : 0;
    const by = (s: Severity) => findings.filter((f) => f.severity === s).length;
    return {
        format: GATE_FORMAT,
        version: GATE_VERSION,
        passed: exitCode === 0,
        exitCode,
        thresholds,
        requested,
        comparisons,
        counts: { findings: findings.length, qualifying, error: by('error'), warning: by('warning'), info: by('info') },
        findings: sortedFindings,
        errors: sortedErrors,
    };
}

// The document's validity, as the gate reads it: null when it validates strictly (2.0) or leniently (a newer 2.x),
// else the invalid_document message.
function invalid(input: unknown): string | null {
    if (input === undefined) {
        return 'The input could not be parsed as JSON.';
    }
    const doc = input as { format?: unknown; version?: unknown } | null;
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc) || doc.format !== 'laranex-schema' || typeof doc.version !== 'string') {
        return 'The input is not a laranex-schema document.';
    }
    if (doc.version.split('.')[0] !== String(MAJOR)) {
        return `The document is laranex-schema ${doc.version}; the gate reads ${MAJOR}.x.`;
    }
    return validateDocument(input, { strict: doc.version === VERSION }).ok ? null : `The document fails laranex-schema ${doc.version} validation.`;
}

// Gates a document: input is the parsed JSON (undefined when the text could not be parsed). Never throws for any
// input; an input that is not a valid laranex-schema 2.x document gives an invalid_document report.
export function gateDocument(input: unknown, options: GateOptions = {}): GateReport {
    const thresholds: GateThresholds = { ...DEFAULT_THRESHOLDS, ...Object.fromEntries(Object.entries(options.thresholds ?? {}).filter(([, v]) => v !== undefined && v !== null)) };
    const requested: RequestedComparison[] = [];
    for (const r of [...(options.requested ?? [])].sort(byRequest)) {
        if (requested.length === 0 || byRequest(requested[requested.length - 1], r) !== 0) {
            requested.push({ baseline: { connection: r.baseline.connection, schema: r.baseline.schema }, target: { connection: r.target.connection, schema: r.target.schema } });
        }
    }
    const problem = invalid(input);
    if (problem) {
        return report(thresholds, requested, [], [], [{ kind: 'invalid_document', message: problem }]);
    }
    const doc = input as SchemaDocument;
    const errors: GateError[] = [];
    if (doc.version !== VERSION) {
        errors.push({ kind: 'validation_incomplete', message: `The document is laranex-schema ${doc.version}; only ${VERSION} is validated strictly, so what ${doc.version} adds was not checked.` });
    }

    const connections = new Map(doc.connections.map((c) => [c.id, c]));
    const nameOf = (id: string) => connections.get(id)?.name ?? id;
    const pair = (baseline: Scope, target: Scope) => `${spell(nameOf(baseline.connection), baseline.schema)} → ${spell(nameOf(target.connection), target.schema)}`;

    // The comparisons to check: every stored one, or only the requested ones.
    let checked: Comparison[] = doc.comparisons;
    if (requested.length) {
        const wanted = new Set<string>();
        const expanded = expandComparisonRequests(doc, requested);
        expanded.errors.forEach((e) => errors.push({ kind: 'comparison_not_found', message: e.message }));
        for (const { baseline, target } of expanded.pairs) {
            const found = doc.comparisons.find((c) => c.baseline.connection === baseline.connection && c.baseline.schema === baseline.schema && c.target.connection === target.connection && c.target.schema === target.schema);
            if (found) {
                wanted.add(found.id);
            } else {
                errors.push({ kind: 'comparison_not_found', message: `Requested comparison ${pair(baseline, target)} is not in the document.` });
            }
        }
        checked = doc.comparisons.filter((c) => wanted.has(c.id));
    }

    const findings: GateFinding[] = [];
    for (const c of checked) {
        const label = pair(c.baseline, c.target);
        for (const d of c.differences) {
            findings.push({
                source: 'comparison',
                id: d.id,
                kind: `${snake(d.objectType)}_${d.change}`,
                severity: d.severity,
                certainty: d.certainty,
                label: `${label} · ${(d.baseline ?? d.target)?.label ?? d.key.join('.')}`,
                message: d.change === 'missing' ? 'Only in the baseline' : d.change === 'extra' ? 'Only in the target' : `Differs in ${d.fields.map((f) => f.field).join(', ')}`,
            });
        }
        if (!c.complete) {
            const reasons: string[] = [];
            if (c.omitted > 0) {
                reasons.push(`${c.omitted} of ${c.summary.missing + c.summary.extra + c.summary.changed} differences omitted`);
            }
            for (const [side, scope] of [['baseline', c.baseline], ['target', c.target]] as const) {
                if (coverageGaps(doc, scope).length) {
                    reasons.push(`the ${side} ${spell(nameOf(scope.connection), scope.schema)} was not inspected completely`);
                }
            }
            errors.push({ kind: 'comparison_incomplete', message: `Comparison ${label} is incomplete${reasons.length ? `: ${reasons.join('; ')}` : ''}.` });
        }
    }

    // Required database coverage in database and combined documents: tables and columns complete, and no feature
    // unavailable. A partial feature (a dialect's known limit) is judged by the comparisons that read it.
    if (doc.source !== 'declared') {
        for (const c of doc.connections) {
            const features = c.coverage.database?.features ?? {};
            const gaps: CoverageGap[] = FEATURES.filter((f) => features[f] === 'unavailable' || (REQUIRED_FEATURES.includes(f) && features[f] !== 'complete')).map((f) => ({ kind: 'feature', feature: f, state: features[f] ?? 'unknown' }));
            if (gaps.length) {
                errors.push({ kind: 'coverage_incomplete', message: `Connection ${c.name}: the database inspection is incomplete: ${gaps.map(coverageGapText).join(', ')}.` });
            }
        }
    }

    const label = diagnosticLabel(doc, pair);
    for (const d of doc.diagnostics) {
        if (d.category === 'drift' || d.category === 'reconciliation') {
            findings.push({ source: 'diagnostic', id: d.id, kind: d.kind, severity: d.severity, certainty: d.certainty, label: label(d), message: d.message });
        } else if (d.category === 'inspection' && d.severity === 'error') {
            errors.push({ kind: 'inspection_failed', message: `${d.kind} on ${label(d)}: ${d.message}` });
        }
    }

    for (const t of doc.migrations) {
        const where = trackLabel(t, nameOf);
        const severity = MIGRATION_SEVERITY[t.status];
        if (severity) {
            const message =
                t.status === 'behind'
                    ? `${t.provider} revisions not applied: ${(t.pending ?? []).join(', ')}`
                    : t.status === 'diverged'
                      ? `The ${t.provider} version table records overlapping revisions, one an ancestor of another: ${(t.current ?? []).join(', ')}`
                      : t.versionTable === null
                        ? `The database has no ${t.provider} version table`
                        : `The ${t.provider} version table records no revision`;
            findings.push({ source: 'migration', id: t.id, kind: `migration_${t.status}`, severity, certainty: 'certain', label: where, message });
        } else if (t.status === 'unknown') {
            const reason =
                t.current === null
                    ? 'the version table could not be read'
                    : t.history === null
                      ? 'the migration scripts could not be read'
                      : t.unknownRevisions.length
                        ? `the database records revisions the scripts do not have: ${t.unknownRevisions.join(', ')}`
                        : 'the history is missing revisions it needs';
            errors.push({ kind: 'migration_unknown', message: `Migration track ${where} (${t.provider}) has an unknown status: ${reason}.` });
        }
    }

    return report(thresholds, requested, checked.map((c) => c.id).sort(byCodePoint), findings, errors);
}

const trackLabel = (t: MigrationTrack, nameOf: (id: string) => string) => (t.schema === null ? nameOf(t.connection) : `${nameOf(t.connection)} · ${t.schema}`);

// A diagnostic's label: the subject's own label, else the name its id resolves to, else the id ("document" for the
// document).
function diagnosticLabel(doc: SchemaDocument, pair: (baseline: Scope, target: Scope) => string): (d: Diagnostic) => string {
    const tables = new Map<string, { table: Table; connection: Connection }>();
    doc.connections.forEach((connection) => connection.tables.forEach((table) => tables.set(table.id, { table, connection })));
    const where = ({ table, connection }: { table: Table; connection: Connection }) => `${connection.name} · ${tableLabel(table)}`;
    const nameOf = (id: string) => doc.connections.find((c) => c.id === id)?.name ?? id;
    const resolve = (d: Diagnostic): string | undefined => {
        const { type, id, columns } = d.subject;
        if (id === null) {
            return undefined;
        }
        if (type === 'connection') {
            return doc.connections.find((c) => c.id === id)?.name;
        }
        if (type === 'table' || type === 'column') {
            const t = tables.get(id);
            return t && (type === 'table' ? where(t) : `${where(t)}.${(columns ?? []).join(', ')}`);
        }
        if (type === 'index' || type === 'foreignKey' || type === 'constraint') {
            for (const t of tables.values()) {
                const entity = (type === 'index' ? t.table.indexes : type === 'foreignKey' ? t.table.foreignKeys : t.table.constraints).find((e: { id: string }) => e.id === id);
                if (entity) {
                    return `${where(t)}.${entity.name ?? entity.id}`;
                }
            }
            return undefined;
        }
        if (type === 'model') {
            return doc.models.find((m) => m.id === id)?.className;
        }
        if (type === 'relationship') {
            const r = doc.relationships.find((x) => x.id === id);
            return r && `${doc.models.find((m) => m.id === r.model)?.className ?? r.model}.${r.name}`;
        }
        if (type === 'comparison') {
            const c = doc.comparisons.find((x) => x.id === id);
            return c && pair(c.baseline, c.target);
        }
        if (type === 'migration') {
            const t = doc.migrations.find((x) => x.id === id);
            return t && trackLabel(t, nameOf);
        }
        return undefined;
    };
    return (d) => d.subject.label ?? resolve(d) ?? d.subject.id ?? 'document';
}

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
            if (f.source === 'comparison' && !COMPARISON_KINDS.includes(f.kind)) {
                errors.push(`A comparison finding's kind is <object_type>_<change>: findings[${i}]`);
            }
            if (f.source === 'migration' && (MIGRATION_SEVERITY[f.kind.replace(/^migration_/, '') as MigrationTrack['status']] !== f.severity || !f.kind.startsWith('migration_') || f.certainty !== 'certain')) {
                errors.push(`A migration finding is migration_behind or migration_diverged (error) or migration_uninitialized (warning), and certain: findings[${i}]`);
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
        if (r.errors.some((e) => e.kind === 'invalid_document') && (r.errors.length > 1 || r.findings.length || r.comparisons.length)) {
            errors.push('A report on an invalid document has no other error, no findings and no checked comparisons');
        }
        r.requested.forEach((q, i) => {
            if (i > 0 && byRequest(r.requested[i - 1], q) >= 0) {
                errors.push(`Requested comparisons are unique and sorted: requested[${i}]`);
            }
        });
        r.comparisons.forEach((c, i) => {
            if (i > 0 && byCodePoint(r.comparisons[i - 1], c) >= 0) {
                errors.push(`Checked comparisons are unique and sorted: comparisons[${i}]`);
            }
        });
    }
    return errors.length ? { ok: false, errors } : { ok: true, report: value as GateReport, errors: [] };
}
