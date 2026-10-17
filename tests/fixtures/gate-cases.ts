import { compareScopes } from '../../src/contract/comparison';
import type { GateError, GateFinding, GateReport, GateThresholds, RequestedComparison } from '../../src/contract/gate';
import { comparisonId, differenceId, migrationTrackId } from '../../src/contract/ids';
import { migrationHistory, migrationState } from '../../src/contract/migration';
import type { Column, Coverage, MigrationRevision, MigrationTrack, SchemaDocument, Scope, Table } from '../../src/contract/types';
import { column, connection, diagnostic, document, foreignKey, table } from './builders';

// Gate conformance cases, written to contract/conformance/gate/<name>.json as
// { description, input: { document, thresholds, requested }, expected }. The documents are built with the shared
// algorithms; the expected reports' findings, errors, labels, messages and exit codes are written out by hand, so
// they check gateDocument.

export type GateCase = {
    description: string;
    input: { document: unknown; thresholds: Partial<GateThresholds> | null; requested: RequestedComparison[] | null };
    expected: GateReport;
};

const FULL: Coverage['features'] = {
    tables: 'complete',
    columns: 'complete',
    columnTypes: 'complete',
    defaults: 'complete',
    comments: 'complete',
    primaryKeys: 'complete',
    foreignKeys: 'complete',
    referentialActions: 'complete',
    indexes: 'complete',
    indexExpressions: 'complete',
    indexPredicates: 'complete',
    includedColumns: 'complete',
    uniqueConstraints: 'complete',
    checkConstraints: 'complete',
    models: 'not_applicable',
    relationships: 'not_applicable',
};
const cov = (schemas: string[] | null, features: Coverage['features'] = FULL): Coverage => ({
    complete: Object.values(features).every((f) => f === 'complete' || f === 'not_applicable'),
    schemas,
    features,
});

const APP = 'connection:app';
const S = (schema: string | null): Scope => ({ connection: APP, schema });
const R = (baseline: [string, string | null], target: [string, string | null]): RequestedComparison => ({ baseline: { connection: baseline[0], schema: baseline[1] }, target: { connection: target[0], schema: target[1] } });
const DEFAULT: GateThresholds = { severity: 'warning', certainty: 'certain' };

// users in a tenant schema. In tenant_b, email is nullable and status defaults to 'pending': a certain and a likely
// changed column.
function users(schema: string, drift: { nullable?: boolean; status?: boolean } = {}): Table {
    const columns: Column[] = [
        column('id', 'bigint'),
        column('email', 'text', { nullable: drift.nullable ?? false }),
        column('status', 'text', { default: { kind: 'literal', value: drift.status ? "'pending'" : "'active'" } }),
    ];
    return table(`app:${schema}.users`, 'users', columns, { schema });
}

const versionTable = (schema: string | null) => table(`app:${schema ?? 'public'}.alembic_version`, 'alembic_version', [column('version_num', 'character varying(32)', { typeName: 'varchar' })], { schema: schema ?? 'public', primaryKey: ['version_num'] });

type Parts = { tables?: Table[]; features?: Coverage['features']; schemas?: string[] | null; comparisons?: [Scope, Scope, number?][]; diagnostics?: SchemaDocument['diagnostics']; migrations?: MigrationTrack[] };

function doc(parts: Parts = {}): SchemaDocument {
    const app = connection('app', 'postgresql', parts.tables ?? [users('tenant_a'), users('tenant_b', { nullable: true, status: true })], {
        defaultSchema: 'public',
        coverage: { database: cov(parts.schemas === undefined ? ['tenant_a', 'tenant_b'] : parts.schemas, parts.features), declared: null },
    });
    const base = { source: 'database' as const, connections: [app] };
    return document('database', { name: 'laranex-schema-viewer', orm: null }, {
        connections: [app],
        comparisons: (parts.comparisons ?? []).map(([b, t, limit]) => compareScopes(base, b, t, { limit: limit ?? null })),
        diagnostics: parts.diagnostics ?? [],
        migrations: parts.migrations ?? [],
    });
}

const AB = [S('tenant_a'), S('tenant_b')] as [Scope, Scope];
const AB_ID = comparisonId(S('tenant_a'), S('tenant_b'));
const AB_LABEL = 'app:tenant_a → app:tenant_b';
const email = (comparison = AB_ID, label = `${AB_LABEL} · tenant_a.users.email`): GateFinding => ({
    source: 'comparison',
    id: differenceId(comparison, 'column', ['users', 'email']),
    kind: 'column_changed',
    severity: 'warning',
    certainty: 'certain',
    label,
    message: 'Differs in nullable',
});
const status = (comparison = AB_ID, label = `${AB_LABEL} · tenant_a.users.status`): GateFinding => ({
    source: 'comparison',
    id: differenceId(comparison, 'column', ['users', 'status']),
    kind: 'column_changed',
    severity: 'warning',
    certainty: 'likely',
    label,
    message: 'Differs in default',
});

const REVISIONS: MigrationRevision[] = [
    { id: 'a1', parents: [], branchLabels: [] },
    { id: 'b2', parents: ['a1'], branchLabels: [] },
    { id: 'c3', parents: ['b2'], branchLabels: [] },
];

function track(schema: string | null, versionTable: string | null, current: string[] | null, revisions: MigrationRevision[] | null = REVISIONS): MigrationTrack {
    const history = revisions === null ? null : migrationHistory(revisions);
    return { id: migrationTrackId('alembic', APP, schema), provider: 'alembic', connection: APP, schema, versionTable, history, current, ...migrationState(history, current), coverage: [] };
}

// The expected report. Findings and errors are listed in the order the contract gives (source, id, kind; kind,
// message); the counts are counted here.
function report(exitCode: 0 | 1 | 2, thresholds: GateThresholds, requested: RequestedComparison[], comparisons: string[], findings: GateFinding[], errors: GateError[]): GateReport {
    const rank = { info: 0, warning: 1, error: 2 };
    const qualifying = findings.filter((f) => rank[f.severity] >= rank[thresholds.severity] && (thresholds.certainty === 'likely' || f.certainty === 'certain')).length;
    const by = (s: GateFinding['severity']) => findings.filter((f) => f.severity === s).length;
    const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    return {
        format: 'laranex-schema-gate',
        version: '1.0',
        passed: exitCode === 0,
        exitCode,
        thresholds,
        requested,
        comparisons,
        counts: { findings: findings.length, qualifying, error: by('error'), warning: by('warning'), info: by('info') },
        findings: [...findings].sort((a, b) => order(a.source, b.source) || order(a.id, b.id) || order(a.kind, b.kind)),
        errors: [...errors].sort((a, b) => order(a.kind, b.kind) || order(a.message, b.message)),
    };
}

const gateCase = (description: string, document: unknown, thresholds: Partial<GateThresholds> | null, requested: RequestedComparison[] | null, expected: GateReport): GateCase => ({ description, input: { document, thresholds, requested }, expected });

// Tenant b's users table only, so only a likely difference (status default) separates the tenants.
const likelyOnly = () => doc({ tables: [users('tenant_a'), users('tenant_b', { status: true })], comparisons: [AB] });

const tenantB = migrationTrackId('alembic', APP, 'tenant_b');

export const GATE_CASES: Record<string, GateCase> = {
    'zero-comparisons': gateCase('A document without comparisons, diagnostics or migration tracks passes with the default thresholds', doc(), null, null, report(0, DEFAULT, [], [], [], [])),

    'requested-none': gateCase('Nothing requested and nothing stored: zero comparisons is valid and passes', doc(), { severity: 'info', certainty: 'likely' }, [], report(0, { severity: 'info', certainty: 'likely' }, [], [], [], [])),

    'comparison-drift': gateCase(
        'Every stored comparison is checked when none is requested; a certain warning qualifies, the likely one does not',
        doc({ comparisons: [AB] }),
        null,
        null,
        report(1, DEFAULT, [], [AB_ID], [email(), status()], []),
    ),

    'diagnostics-only': gateCase(
        'Drift and reconciliation diagnostics are findings with their own message; extraction, lint and inspection warnings are not',
        doc({
            tables: [users('tenant_a')],
            diagnostics: [
                diagnostic('column_drift', 'drift', { type: 'column', id: 'app:tenant_a.users', columns: ['email'] }, 'The database stores email as text; the model declares VARCHAR(255).'),
                diagnostic('database_only', 'reconciliation', { type: 'table', id: 'app:tenant_a.users', label: 'tenant_a.users (custom label)' }, 'No model maps tenant_a.users.', { severity: 'info' }),
                diagnostic('unsupported_metadata', 'extraction', { type: 'table', id: 'app:tenant_a.users' }, 'A column type could not be read.'),
                diagnostic('missing_index', 'lint', { type: 'column', id: 'app:tenant_a.users', columns: ['email'] }, 'email is filtered on but has no index.', { certainty: 'likely' }),
                diagnostic('inspection_unavailable', 'inspection', { type: 'connection', id: APP }, 'Comments were read only partly.'),
            ],
        }),
        null,
        null,
        report(1, DEFAULT, [], [], [
            { source: 'diagnostic', id: diagnostic('column_drift', 'drift', { type: 'column', id: 'app:tenant_a.users', columns: ['email'] }, 'The database stores email as text; the model declares VARCHAR(255).').id, kind: 'column_drift', severity: 'warning', certainty: 'certain', label: 'app · tenant_a.users.email', message: 'The database stores email as text; the model declares VARCHAR(255).' },
            { source: 'diagnostic', id: diagnostic('database_only', 'reconciliation', { type: 'table', id: 'app:tenant_a.users', label: 'tenant_a.users (custom label)' }, 'No model maps tenant_a.users.').id, kind: 'database_only', severity: 'info', certainty: 'certain', label: 'tenant_a.users (custom label)', message: 'No model maps tenant_a.users.' },
        ], []),
    ),

    'extraction-warning-only': gateCase(
        'An unresolved foreign key (an extraction warning) is never a finding: the gate passes with the default thresholds',
        doc({
            tables: [table('app:tenant_a.orders', 'orders', [column('id', 'bigint'), column('customer_id', 'bigint')], { schema: 'tenant_a', foreignKeys: [foreignKey('app:tenant_a.orders', 'orders_customer_id_fkey', ['customer_id'], 'app:tenant_a.customers', ['id'])] })],
            diagnostics: [diagnostic('unresolved_foreign_key', 'extraction', { type: 'foreignKey', id: 'app:tenant_a.orders:fk:orders_customer_id_fkey' }, 'orders.customer_id references tenant_a.customers, which was not read.')],
        }),
        null,
        null,
        report(0, DEFAULT, [], [], [], []),
    ),

    'migration-only': gateCase(
        'Behind, diverged and uninitialized tracks are migration findings labelled connection · schema (the connection alone for a null schema); up to date is none',
        doc({
            tables: [users('tenant_a'), versionTable('tenant_a'), versionTable('tenant_b'), versionTable('tenant_c'), versionTable('tenant_d'), users('tenant_e')],
            schemas: null,
            migrations: [
                track('tenant_a', 'app:tenant_a.alembic_version', ['a1']),
                track('tenant_b', 'app:tenant_b.alembic_version', ['b2', 'c3']),
                track('tenant_c', 'app:tenant_c.alembic_version', []),
                track('tenant_d', 'app:tenant_d.alembic_version', ['c3']),
                track(null, null, []),
            ],
        }),
        null,
        null,
        report(1, DEFAULT, [], [], [
            { source: 'migration', id: migrationTrackId('alembic', APP, 'tenant_a'), kind: 'migration_behind', severity: 'error', certainty: 'certain', label: 'app · tenant_a', message: 'alembic revisions not applied: b2, c3' },
            { source: 'migration', id: tenantB, kind: 'migration_diverged', severity: 'error', certainty: 'certain', label: 'app · tenant_b', message: 'The alembic version table records overlapping revisions, one an ancestor of another: b2, c3' },
            { source: 'migration', id: migrationTrackId('alembic', APP, 'tenant_c'), kind: 'migration_uninitialized', severity: 'warning', certainty: 'certain', label: 'app · tenant_c', message: 'The alembic version table records no revision' },
            { source: 'migration', id: migrationTrackId('alembic', APP, null), kind: 'migration_uninitialized', severity: 'warning', certainty: 'certain', label: 'app', message: 'The database has no alembic version table' },
        ], []),
    ),

    'migration-unknown': gateCase(
        'An unknown migration status is an error, with its reason',
        doc({
            tables: [versionTable('tenant_a'), versionTable('tenant_b'), versionTable('tenant_c')],
            migrations: [track('tenant_a', 'app:tenant_a.alembic_version', null), track('tenant_b', 'app:tenant_b.alembic_version', ['c3'], null), track('tenant_c', 'app:tenant_c.alembic_version', ['f9'])],
        }),
        null,
        null,
        report(2, DEFAULT, [], [], [], [
            { kind: 'migration_unknown', message: 'Migration track app · tenant_a (alembic) has an unknown status: the version table could not be read.' },
            { kind: 'migration_unknown', message: 'Migration track app · tenant_b (alembic) has an unknown status: the migration scripts could not be read.' },
            { kind: 'migration_unknown', message: 'Migration track app · tenant_c (alembic) has an unknown status: the database records revisions the scripts do not have: f9.' },
        ]),
    ),

    'incomplete-comparison': gateCase(
        'A comparison that omitted differences is incomplete: exit 2 whatever it found',
        doc({ comparisons: [[S('tenant_a'), S('tenant_b'), 1]] }),
        { severity: 'error' },
        null,
        report(2, { severity: 'error', certainty: 'certain' }, [], [AB_ID], [email()], [{ kind: 'comparison_incomplete', message: 'Comparison app:tenant_a → app:tenant_b is incomplete: 1 of 2 differences omitted.' }]),
    ),

    'incomplete-coverage': gateCase(
        'Unavailable database coverage is an error; the comparison that reads it is incomplete too',
        doc({ comparisons: [AB], features: { ...FULL, checkConstraints: 'unavailable', comments: 'not_applicable' } }),
        null,
        null,
        report(2, DEFAULT, [], [AB_ID], [email(), status()], [
            { kind: 'comparison_incomplete', message: 'Comparison app:tenant_a → app:tenant_b is incomplete: the baseline app:tenant_a was not inspected completely; the target app:tenant_b was not inspected completely.' },
            { kind: 'coverage_incomplete', message: 'Connection app: the database inspection is incomplete: checkConstraints unavailable.' },
        ]),
    ),

    'incomplete-required-coverage': gateCase(
        'Tables and columns must be read completely; a feature left out is unknown',
        doc({ features: { tables: 'complete', columns: 'partial' } }),
        null,
        null,
        report(2, DEFAULT, [], [], [], [{ kind: 'coverage_incomplete', message: 'Connection app: the database inspection is incomplete: columns partial.' }]),
    ),

    'partial-coverage': gateCase(
        'Partial and not applicable features other than tables and columns (a dialect\'s known limits) do not fail a gate without comparisons',
        doc({ features: { ...FULL, checkConstraints: 'partial', comments: 'not_applicable', includedColumns: 'not_applicable' } }),
        null,
        null,
        report(0, DEFAULT, [], [], [], []),
    ),

    'failed-inspection': gateCase(
        'An inspection diagnostic with severity error is a failed inspection',
        doc({ tables: [users('tenant_a')], diagnostics: [diagnostic('inspection_unavailable', 'inspection', { type: 'connection', id: APP }, 'Indexes could not be read: permission denied.', { severity: 'error' })] }),
        null,
        null,
        report(2, DEFAULT, [], [], [], [{ kind: 'inspection_failed', message: 'inspection_unavailable on app: Indexes could not be read: permission denied.' }]),
    ),

    'invalid-document': gateCase('A document that fails validation', { ...doc(), connections: 'none' }, null, null, report(2, DEFAULT, [], [], [], [{ kind: 'invalid_document', message: 'The document fails laranex-schema 2.0 validation.' }])),

    'unsupported-version': gateCase(
        'A laranex-schema 1.0 document is not read; requested comparisons are echoed but not checked',
        { ...doc(), version: '1.0' },
        null,
        [R(['app', 'tenant_a'], ['app', 'tenant_b'])],
        report(2, DEFAULT, [R(['app', 'tenant_a'], ['app', 'tenant_b'])], [], [], [{ kind: 'invalid_document', message: 'The document is laranex-schema 1.0; the gate reads 2.x.' }]),
    ),

    'not-a-document': gateCase('Input that is not a laranex-schema document', { format: 'laranex-schema-gate', version: '1.0' }, null, null, report(2, DEFAULT, [], [], [], [{ kind: 'invalid_document', message: 'The input is not a laranex-schema document.' }])),

    'newer-minor': gateCase(
        'A newer 2.x minor is validated only leniently: validation_incomplete, with the findings still listed',
        { ...doc({ comparisons: [AB] }), version: '2.3', addedIn23: true },
        null,
        null,
        report(2, DEFAULT, [], [AB_ID], [email(), status()], [{ kind: 'validation_incomplete', message: 'The document is laranex-schema 2.3; only 2.0 is validated strictly, so what 2.3 adds was not checked.' }]),
    ),

    'requested-missing': gateCase(
        'Requested comparisons that are not stored, or name an unknown connection, are errors; only the requested ones are checked',
        doc({ comparisons: [AB] }),
        null,
        [R(['app', 'tenant_b'], ['app', 'tenant_a']), R(['app', 'tenant_a'], ['app', 'tenant_b']), R(['app', 'tenant_a'], ['replica', null])],
        report(2, DEFAULT, [R(['app', 'tenant_a'], ['app', 'tenant_b']), R(['app', 'tenant_a'], ['replica', null]), R(['app', 'tenant_b'], ['app', 'tenant_a'])], [AB_ID], [email(), status()], [
            { kind: 'comparison_not_found', message: 'Requested comparison app:tenant_b → app:tenant_a is not in the document.' },
            { kind: 'comparison_not_found', message: 'Requested comparison app:tenant_a → replica names connection replica, which the document does not have.' },
        ]),
    ),

    'requested-wildcard': gateCase(
        'A * target expands to every schema the inspection read except the baseline\'s; stored comparisons not requested (here an incomplete one) are not checked',
        doc({ comparisons: [AB, [S('tenant_b'), S('tenant_a'), 0]] }),
        null,
        [R(['app', 'tenant_a'], ['app', '*'])],
        report(1, DEFAULT, [R(['app', 'tenant_a'], ['app', '*'])], [AB_ID], [email(), status()], []),
    ),

    'requested-wildcard-empty': gateCase(
        'A * target that matches no schema is an error',
        doc({ tables: [users('tenant_a')], schemas: ['tenant_a'] }),
        null,
        [R(['app', 'tenant_a'], ['app', '*'])],
        report(2, DEFAULT, [R(['app', 'tenant_a'], ['app', '*'])], [], [], [{ kind: 'comparison_not_found', message: 'Requested comparison app:tenant_a → app:* matches no schema.' }]),
    ),

    'threshold-likely-below-certainty': gateCase('With certainty "certain", a likely warning does not qualify', likelyOnly(), { severity: 'warning', certainty: 'certain' }, null, report(0, DEFAULT, [], [AB_ID], [status()], [])),

    'threshold-likely-at-certainty': gateCase('With certainty "likely", a likely warning qualifies', likelyOnly(), { severity: 'warning', certainty: 'likely' }, null, report(1, { severity: 'warning', certainty: 'likely' }, [], [AB_ID], [status()], [])),

    'threshold-below-severity': gateCase('A warning is below severity "error", whatever the certainty threshold', likelyOnly(), { severity: 'error', certainty: 'likely' }, null, report(0, { severity: 'error', certainty: 'likely' }, [], [AB_ID], [status()], [])),

    precedence: gateCase(
        'Errors win over qualifying findings: exit 2',
        doc({ comparisons: [AB], tables: [users('tenant_a'), users('tenant_b', { nullable: true, status: true }), versionTable(null)], migrations: [track(null, 'app:public.alembic_version', null)] }),
        null,
        null,
        report(2, DEFAULT, [], [AB_ID], [email(), status()], [{ kind: 'migration_unknown', message: 'Migration track app (alembic) has an unknown status: the version table could not be read.' }]),
    ),
};
