import { compareScopes, type CoverageGap, type ExpandedComparison, type RequestedComparison, type RequestError } from '../../src/contract/comparison';
import { comparisonId } from '../../src/contract/ids';
import type { Comparison, Connection, Coverage, Diagnostic, SchemaDocument, Scope, SourceMode } from '../../src/contract/types';
import { column, connection, diagnostic, document, table } from './builders';

// Conformance cases for what producers do around a comparison, each with hand-written expected outputs:
// - contract/conformance/requests/<name>.json: { description, input: { document, requests }, expected: { pairs, errors } }
//   (expandComparisonRequests);
// - contract/conformance/coverage-gaps/<name>.json: { description, input: { document, scope }, expected: { gaps, covered } }
//   (coverageGaps, scopeCovered);
// - contract/conformance/overrides/<name>.json: { description, input: { overrides }, expected: { errors } }
//   (validateSeverityOverrides);
// - contract/conformance/comparison-diagnostics/<name>.json: { description, input: { document, comparison },
//   expected: { diagnostics } } (comparisonDiagnostics);
// - contract/conformance/store/<name>.json: { description, input: { document, comparisons }, expected: { document } }
//   (storeComparisons).

type Doc = { source: SourceMode; connections: Connection[] };
export type RequestCase = { description: string; input: { document: Doc; requests: RequestedComparison[] }; expected: { pairs: ExpandedComparison[]; errors: RequestError[] } };
export type CoverageCase = { description: string; input: { document: Doc; scope: Scope }; expected: { gaps: CoverageGap[]; covered: boolean } };
export type OverrideCase = { description: string; input: { overrides: unknown }; expected: { errors: string[] } };
export type ComparisonDiagnosticCase = { description: string; input: { document: Doc; comparison: Comparison }; expected: { diagnostics: Diagnostic[] } };
export type StoreCase = { description: string; input: { document: SchemaDocument; comparisons: Comparison[] }; expected: { document: SchemaDocument } };

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
const db = (name: string, driver: string, defaultSchema: string | null, coverage: Coverage | null, tables = [] as Connection['tables']): Connection =>
    connection(name, driver, tables, { defaultSchema, coverage: { database: coverage, declared: null } });

// ----------------------------------------------------------------------------------------------------------------
// Requested comparisons.

const R = (baseline: [string, string | null], target: [string, string | null]): RequestedComparison => ({ baseline: { connection: baseline[0], schema: baseline[1] }, target: { connection: target[0], schema: target[1] } });
const S = (name: string, schema: string | null): Scope => ({ connection: `connection:${name}`, schema });
const P = (baseline: Scope, target: Scope, request: RequestedComparison): ExpandedComparison => ({ baseline, target, request });
const E = (kind: RequestError['kind'], request: RequestedComparison, message: string): RequestError => ({ kind, request, message });

// app reads public and three tenants (listed out of order, one twice); replica one schema, its default; legacy has no
// database coverage; flat's coverage lists no schemas.
const servers: Doc = {
    source: 'database',
    connections: [
        db('app', 'postgresql', 'public', cov(['tenant_c', 'tenant_a', 'public', 'tenant_b', 'tenant_a'])),
        db('replica', 'mysql', 'shop', cov(['shop'])),
        db('legacy', 'sqlite', null, null),
        db('flat', 'sqlite', null, cov(null)),
    ],
};

const request = (description: string, requests: RequestedComparison[], pairs: ExpandedComparison[], errors: RequestError[] = [], doc: Doc = servers): RequestCase => ({ description, input: { document: doc, requests }, expected: { pairs, errors } });

const publicToAll = R(['app', 'public'], ['app', '*']);
const defaultToAll = R(['app', null], ['app', '*']);

export const REQUEST_CASES: Record<string, RequestCase> = {
    'wildcard-tenants': request(
        'A * target expands to the schemas the target connection read, sorted and each once, leaving out the baseline\'s own schema',
        [publicToAll],
        [P(S('app', 'public'), S('app', 'tenant_a'), publicToAll), P(S('app', 'public'), S('app', 'tenant_b'), publicToAll), P(S('app', 'public'), S('app', 'tenant_c'), publicToAll)],
    ),
    'wildcard-default-schema': request(
        'With a null baseline schema on the same connection, the connection\'s default schema is the baseline\'s own scope and is left out; the pairs keep the null baseline schema',
        [defaultToAll],
        [P(S('app', null), S('app', 'tenant_a'), defaultToAll), P(S('app', null), S('app', 'tenant_b'), defaultToAll), P(S('app', null), S('app', 'tenant_c'), defaultToAll)],
    ),
    'wildcard-other-connection': request(
        'A * target on another connection leaves nothing out, not even a schema named like the baseline\'s',
        [R(['replica', 'public'], ['app', '*'])],
        ['public', 'tenant_a', 'tenant_b', 'tenant_c'].map((s) => P(S('replica', 'public'), S('app', s), R(['replica', 'public'], ['app', '*']))),
    ),
    'wildcard-baseline-is-a-name': request(
        'Only a target schema expands: "*" in a baseline is an ordinary schema name',
        [R(['app', '*'], ['app', 'tenant_a'])],
        [P(S('app', '*'), S('app', 'tenant_a'), R(['app', '*'], ['app', 'tenant_a']))],
    ),
    'wildcard-declared-coverage': request(
        'In a declared document a * target expands over the declared coverage\'s schemas',
        [R(['orm', 'main'], ['orm', '*'])],
        [P(S('orm', 'main'), S('orm', 'reporting'), R(['orm', 'main'], ['orm', '*']))],
        [],
        { source: 'declared', connections: [connection('orm', null, [], { defaultSchema: 'main', coverage: { database: null, declared: cov(['reporting', 'main']) } })] },
    ),
    'wildcard-no-schemas': request(
        'A * target cannot be expanded when the target connection has no coverage or its coverage lists no schemas',
        [R(['app', null], ['legacy', '*']), R(['app', null], ['flat', '*'])],
        [],
        [
            E('no_schemas', R(['app', null], ['flat', '*']), 'Requested comparison app → flat:* cannot be expanded: the inspection of connection flat lists no schemas.'),
            E('no_schemas', R(['app', null], ['legacy', '*']), 'Requested comparison app → legacy:* cannot be expanded: the inspection of connection legacy lists no schemas.'),
        ],
    ),
    'wildcard-no-match': request(
        'A * target that leaves no schema once the baseline\'s own scope is out matches nothing, whether the baseline names the schema or reaches it as the default',
        [R(['replica', 'shop'], ['replica', '*']), R(['replica', null], ['replica', '*'])],
        [],
        [
            E('no_match', R(['replica', null], ['replica', '*']), 'Requested comparison replica → replica:* matches no schema.'),
            E('no_match', R(['replica', 'shop'], ['replica', '*']), 'Requested comparison replica:shop → replica:* matches no schema.'),
        ],
    ),
    'unknown-connection': request(
        'Each connection name the document does not have is an error, once per request; the request is not expanded',
        [R(['app', null], ['nowhere', '*']), R(['ghost', 'x'], ['ghost', 'y']), R(['ghost', null], ['phantom', null])],
        [],
        [
            E('unknown_connection', R(['app', null], ['nowhere', '*']), 'Requested comparison app → nowhere:* names connection nowhere, which the document does not have.'),
            E('unknown_connection', R(['ghost', null], ['phantom', null]), 'Requested comparison ghost → phantom names connection ghost, which the document does not have.'),
            E('unknown_connection', R(['ghost', null], ['phantom', null]), 'Requested comparison ghost → phantom names connection phantom, which the document does not have.'),
            E('unknown_connection', R(['ghost', 'x'], ['ghost', 'y']), 'Requested comparison ghost:x → ghost:y names connection ghost, which the document does not have.'),
        ],
    ),
    'explicit-over-wildcard': request(
        'A pair named explicitly takes precedence over the same pair from a * expansion: it is listed once, with the explicit request, and is no error',
        [publicToAll, R(['app', 'public'], ['app', 'tenant_b'])],
        [P(S('app', 'public'), S('app', 'tenant_a'), publicToAll), P(S('app', 'public'), S('app', 'tenant_b'), R(['app', 'public'], ['app', 'tenant_b'])), P(S('app', 'public'), S('app', 'tenant_c'), publicToAll)],
    ),
    duplicates: request(
        'A request listed more than once is one duplicate error and is expanded once, however often it repeats',
        [R(['app', 'public'], ['app', 'tenant_a']), publicToAll, R(['app', 'public'], ['app', 'tenant_a']), publicToAll, R(['app', 'public'], ['app', 'tenant_a'])],
        [P(S('app', 'public'), S('app', 'tenant_a'), R(['app', 'public'], ['app', 'tenant_a'])), P(S('app', 'public'), S('app', 'tenant_b'), publicToAll), P(S('app', 'public'), S('app', 'tenant_c'), publicToAll)],
        [
            E('duplicate', publicToAll, 'Requested comparison app:public → app:* is listed more than once.'),
            E('duplicate', R(['app', 'public'], ['app', 'tenant_a']), 'Requested comparison app:public → app:tenant_a is listed more than once.'),
        ],
    ),
    'explicit-pairs': request(
        'An explicit request resolves names to ids without consulting coverage or the stored comparisons: a schema the inspection did not read, and null schemas, pass through',
        [R(['replica', null], ['app', 'tenant_z']), R(['app', null], ['replica', null])],
        [P(S('app', null), S('replica', null), R(['app', null], ['replica', null])), P(S('replica', null), S('app', 'tenant_z'), R(['replica', null], ['app', 'tenant_z']))],
    ),
    ordering: request(
        'Pairs are sorted by baseline connection id, baseline schema, target connection id and target schema (null first); errors follow the requests sorted by connection names and schemas',
        [R(['replica', 'shop'], ['app', 'tenant_b']), R(['replica', null], ['nowhere', null]), R(['app', 'tenant_a'], ['replica', null]), R(['app', null], ['replica', 'shop']), R(['app', null], ['flat', '*'])],
        [
            P(S('app', null), S('replica', 'shop'), R(['app', null], ['replica', 'shop'])),
            P(S('app', 'tenant_a'), S('replica', null), R(['app', 'tenant_a'], ['replica', null])),
            P(S('replica', 'shop'), S('app', 'tenant_b'), R(['replica', 'shop'], ['app', 'tenant_b'])),
        ],
        [
            E('no_schemas', R(['app', null], ['flat', '*']), 'Requested comparison app → flat:* cannot be expanded: the inspection of connection flat lists no schemas.'),
            E('unknown_connection', R(['replica', null], ['nowhere', null]), 'Requested comparison replica → nowhere names connection nowhere, which the document does not have.'),
        ],
    ),
    'no-requests': request('No requests expand to nothing', [], []),
};

// ----------------------------------------------------------------------------------------------------------------
// Coverage gaps.

const coverage = (description: string, doc: Doc, scope: Scope, gaps: CoverageGap[]): CoverageCase => ({ description, input: { document: doc, scope }, expected: { gaps, covered: gaps.length === 0 } });
const one = (defaultSchema: string | null, c: Coverage | null, source: SourceMode = 'database'): Doc => ({ source, connections: [db('app', 'postgresql', defaultSchema, c)] });
const F = (feature: Extract<CoverageGap, { kind: 'feature' }>['feature'], state: Extract<CoverageGap, { kind: 'feature' }>['state']): CoverageGap => ({ kind: 'feature', feature, state });
const { comments: _comments, ...withoutComments } = FULL;

export const COVERAGE_CASES: Record<string, CoverageCase> = {
    complete: coverage('Every compared feature complete and the schema read: no gaps', one('public', cov(['public', 'tenant_a'])), S('app', 'tenant_a'), []),
    'feature-states': coverage(
        'Compared features that are partial, unavailable or left out (unknown) are gaps, in the compared-feature order; features a comparison does not read are never gaps',
        one(null, cov(null, { ...withoutComments, defaults: 'unavailable', columnTypes: 'partial', includedColumns: 'unavailable', models: 'unavailable' })),
        S('app', null),
        [F('columnTypes', 'partial'), F('defaults', 'unavailable'), F('comments', 'unknown')],
    ),
    'not-applicable': coverage(
        'not_applicable is never a gap',
        one(null, cov(null, Object.fromEntries(Object.keys(FULL).map((f) => [f, 'not_applicable'])) as Coverage['features'])),
        S('app', null),
        [],
    ),
    'schema-not-read': coverage('A scope whose schema the coverage did not read', one('public', cov(['public', 'tenant_a'])), S('app', 'tenant_c'), [{ kind: 'schema_not_read', schema: 'tenant_c' }]),
    'default-schema-not-read': coverage('A null scope schema stands for the default schema, which must have been read', one('public', cov(['tenant_a'])), S('app', null), [{ kind: 'schema_not_read', schema: 'public' }]),
    'default-schema-unknown': coverage('A null scope schema on a connection without a default schema is never a schema gap', one(null, cov(['tenant_a'])), S('app', null), []),
    'schemas-unknown': coverage('Coverage that lists no schemas never gives a schema gap', one('public', cov(null)), S('app', 'tenant_x'), []),
    'coverage-unknown': coverage('No coverage at all is the one gap coverage_unknown', one('public', null), S('app', 'public'), [{ kind: 'coverage_unknown' }]),
    'features-then-schema': coverage(
        'Feature gaps come first, then the schema',
        one('public', cov(['public'], { ...FULL, indexes: 'partial', checkConstraints: 'unavailable' })),
        S('app', 'tenant_a'),
        [F('indexes', 'partial'), F('checkConstraints', 'unavailable'), { kind: 'schema_not_read', schema: 'tenant_a' }],
    ),
    'declared-document': coverage(
        'A declared document reads the declared coverage',
        { source: 'declared', connections: [connection('app', null, [], { coverage: { database: null, declared: cov(null, { ...FULL, foreignKeys: 'partial' }) } })] },
        S('app', null),
        [F('foreignKeys', 'partial')],
    ),
    'combined-document': coverage(
        'A combined document reads the database coverage, whatever the declared coverage says',
        { source: 'combined', connections: [connection('app', 'postgresql', [], { coverage: { database: cov(null), declared: cov(null, { ...FULL, defaults: 'unavailable' }) } })] },
        S('app', null),
        [],
    ),
};

// ----------------------------------------------------------------------------------------------------------------
// Severity overrides.

const overrides = (description: string, input: unknown, errors: string[]): OverrideCase => ({ description, input: { overrides: input }, expected: { errors } });
const EVERY_FIELD: Record<string, string[]> = {
    table: ['comment'],
    column: ['collation', 'comment', 'default', 'enum', 'generated', 'nullable', 'type'],
    primaryKey: ['columns'],
    index: ['included', 'method', 'name', 'parts', 'predicate', 'unique'],
    foreignKey: ['columns', 'deferrable', 'foreignColumns', 'foreignTable', 'initially', 'name', 'onDelete', 'onUpdate'],
    constraint: ['columns', 'expression', 'name'],
};

export const OVERRIDE_CASES: Record<string, OverrideCase> = {
    empty: overrides('No overrides are valid', [], []),
    'every-field': overrides(
        'Every object type and change without a field, and every field a changed difference of each type can list, is valid; field null is the same as no field',
        [
            ...Object.keys(EVERY_FIELD).flatMap((objectType) => ['missing', 'extra'].map((change) => ({ objectType, change, severity: 'info' }))),
            ...Object.keys(EVERY_FIELD).map((objectType) => ({ objectType, change: 'changed', field: null, severity: 'error' })),
            ...Object.entries(EVERY_FIELD).flatMap(([objectType, fields]) => fields.map((field) => ({ objectType, change: 'changed', field, severity: 'warning' }))),
        ],
        [],
    ),
    'unknown-field': overrides(
        'A field no difference of the object type lists',
        [{ objectType: 'column', change: 'changed', field: 'size', severity: 'error' }],
        ['overrides[0].field must be one of collation, comment, default, enum, generated, nullable, type for objectType column'],
    ),
    'field-of-another-type': overrides(
        'A field of another object type',
        [
            { objectType: 'table', change: 'changed', field: 'type', severity: 'error' },
            { objectType: 'index', change: 'changed', field: 'expression', severity: 'info' },
            { objectType: 'primaryKey', change: 'changed', field: 'name', severity: 'info' },
        ],
        ['overrides[0].field must be one of comment for objectType table', 'overrides[1].field must be one of included, method, name, parts, predicate, unique for objectType index', 'overrides[2].field must be one of columns for objectType primaryKey'],
    ),
    'field-on-missing-or-extra': overrides(
        'Missing and extra differences list no fields, so an override naming one can never apply',
        [
            { objectType: 'column', change: 'missing', field: 'type', severity: 'warning' },
            { objectType: 'index', change: 'extra', field: 'nope', severity: 'warning' },
        ],
        ['overrides[0].field applies only to changed differences, not missing', 'overrides[1].field applies only to changed differences, not extra'],
    ),
    'unknown-values': overrides(
        'Unknown object types, changes and severities, each reported; a field is not judged against an unknown object type or change',
        [
            { objectType: 'view', change: 'changed', field: 'definition', severity: 'error' },
            { objectType: 'column', change: 'renamed', field: 'type', severity: 'fatal' },
            { objectType: 'primary_key', change: 'missing', severity: 'error' },
        ],
        [
            'overrides[0].objectType must be one of table, column, primaryKey, index, foreignKey, constraint',
            'overrides[1].change must be one of missing, extra, changed',
            'overrides[1].severity must be one of error, warning, info',
            'overrides[2].objectType must be one of table, column, primaryKey, index, foreignKey, constraint',
        ],
    ),
    malformed: overrides(
        'Entries that are not objects, unknown keys (sorted), a missing severity, and a field that is not a string',
        [null, 'column', [], { objectType: 'table', change: 'missing', severity: 'error', object_type: 'table', extra: true }, { objectType: 'table', change: 'extra' }, { objectType: 'table', change: 'changed', field: 3, severity: 'info' }],
        [
            'overrides[0] must be an object',
            'overrides[1] must be an object',
            'overrides[2] must be an object',
            'overrides[3] has unknown keys: extra, object_type',
            'overrides[4].severity must be one of error, warning, info',
            'overrides[5].field must be a string or null',
        ],
    ),
    'not-an-array': overrides('Overrides that are not an array', { objectType: 'table', change: 'missing', severity: 'error' }, ['overrides must be an array']),
    repeated: overrides(
        'Two overrides for one (objectType, change, field) are ambiguous, whatever their severities; a field null repeats one without a field',
        [
            { objectType: 'column', change: 'changed', field: 'type', severity: 'error' },
            { objectType: 'table', change: 'missing', severity: 'warning' },
            { objectType: 'column', change: 'changed', field: 'type', severity: 'info' },
            { objectType: 'table', change: 'missing', field: null, severity: 'warning' },
            { objectType: 'column', change: 'changed', severity: 'info' },
        ],
        ['overrides[2] repeats overrides[0]', 'overrides[3] repeats overrides[1]'],
    ),
};

// ----------------------------------------------------------------------------------------------------------------
// comparison_incomplete diagnostics.

const users = (connectionName: string, schema: string | null, extra: string[] = []) => table(`${connectionName}:${schema ?? 'default'}.users`, 'users', ['id', ...extra].map((c) => column(c, 'bigint')), { schema });
const others = (connectionName: string, names: string[]) => names.map((n) => table(`${connectionName}:${n}`, n, [column('id', 'bigint')]));
const incomplete = (comparison: Comparison, label: string, message: string): Diagnostic => diagnostic('comparison_incomplete', 'inspection', { type: 'comparison', id: comparison.id, label }, message);
const diagnostics = (description: string, doc: Doc, comparison: Comparison, expected: (c: Comparison) => Diagnostic[]): ComparisonDiagnosticCase => ({ description, input: { document: doc, comparison }, expected: { diagnostics: expected(comparison) } });

const pairDoc = (a: Coverage | null, b: Coverage | null): Doc => ({
    source: 'database',
    connections: [db('primary', 'postgresql', 'public', a, [users('primary', 'public'), ...others('primary', ['audit', 'events', 'jobs'])]), db('replica', 'postgresql', 'public', b, [users('replica', 'public', ['email'])])],
});
const fullPair = pairDoc(cov(['public']), cov(['public']));
const tenantDoc: Doc = { source: 'database', connections: [db('app', 'postgresql', 'public', cov(['tenant_a']), [users('app', 'tenant_a'), users('app', 'tenant_b')])] };

export const COMPARISON_DIAGNOSTIC_CASES: Record<string, ComparisonDiagnosticCase> = {
    complete: diagnostics('A complete comparison has no diagnostic', fullPair, compareScopes(fullPair, S('primary', null), S('replica', null)), () => []),
    omitted: diagnostics(
        'Differences left out by a limit: the limit is the number listed',
        fullPair,
        compareScopes(fullPair, S('primary', null), S('replica', null), { limit: 2 }),
        (c) => [incomplete(c, 'primary=replica', 'Comparison primary=replica is incomplete: 2 of 4 differences are left out by the limit of 2')],
    ),
    'limit-zero': diagnostics(
        'A limit of 0 lists nothing',
        fullPair,
        compareScopes(fullPair, S('primary', 'public'), S('replica', 'public'), { limit: 0 }),
        (c) => [incomplete(c, 'primary:public=replica:public', 'Comparison primary:public=replica:public is incomplete: 4 of 4 differences are left out by the limit of 0')],
    ),
    coverage: diagnostics(
        'A side not completely covered: its gaps, in order, in parentheses',
        pairDoc(cov(['public']), cov(['public'], { ...FULL, indexes: 'partial', checkConstraints: 'unavailable' })),
        compareScopes(pairDoc(cov(['public']), cov(['public'], { ...FULL, indexes: 'partial', checkConstraints: 'unavailable' })), S('primary', null), S('replica', null)),
        (c) => [incomplete(c, 'primary=replica', 'Comparison primary=replica is incomplete: the target replica is not completely covered (indexes partial, checkConstraints unavailable)')],
    ),
    'both-sides-and-omitted': diagnostics(
        'Omitted differences first, then the baseline, then the target',
        pairDoc(null, cov(['tenant_a'], { ...FULL, defaults: 'partial' })),
        compareScopes(pairDoc(null, cov(['tenant_a'], { ...FULL, defaults: 'partial' })), S('primary', null), S('replica', null), { limit: 1 }),
        (c) => [
            incomplete(
                c,
                'primary=replica',
                'Comparison primary=replica is incomplete: 3 of 4 differences are left out by the limit of 1; the baseline primary is not completely covered (coverage unknown); the target replica is not completely covered (defaults partial, schema public not read)',
            ),
        ],
    ),
    'tenant-schema-label': diagnostics(
        'Scopes are spelled by connection name and schema, joined by "="',
        tenantDoc,
        compareScopes(tenantDoc, S('app', 'tenant_a'), S('app', 'tenant_b')),
        (c) => [incomplete(c, 'app:tenant_a=app:tenant_b', 'Comparison app:tenant_a=app:tenant_b is incomplete: the target app:tenant_b is not completely covered (schema tenant_b not read)')],
    ),
};

// ----------------------------------------------------------------------------------------------------------------
// Storing comparisons.

const storeConnections = (b: Coverage) => [db('primary', 'postgresql', 'public', cov(['public']), [users('primary', 'public')]), db('replica', 'postgresql', 'public', b, [users('replica', 'public', ['email'])])];
const generator = { name: 'laranex-schema-viewer', orm: null };
const AB: [Scope, Scope] = [S('primary', null), S('replica', null)];
const BA: [Scope, Scope] = [S('replica', null), S('primary', null)];
const partial = cov(['public'], { ...FULL, indexes: 'partial' });
const compare = (b: Coverage, [x, y]: [Scope, Scope], limit: number | null = null) => compareScopes({ source: 'database', connections: storeConnections(b) }, x, y, { limit });
const unrelated = diagnostic('unsupported_metadata', 'inspection', { type: 'connection', id: 'connection:primary', label: 'primary' }, 'Index predicates were read from the index SQL.', { severity: 'info' });

function storeCase(description: string, b: Coverage, stored: Comparison[], storedDiagnostics: Diagnostic[], comparisons: Comparison[], expectedComparisons: Comparison[], expectedDiagnostics: Diagnostic[]): StoreCase {
    const connections = storeConnections(b);
    return {
        description,
        input: { document: document('database', generator, { connections, comparisons: stored, diagnostics: storedDiagnostics }), comparisons },
        expected: { document: document('database', generator, { connections, comparisons: expectedComparisons, diagnostics: expectedDiagnostics }) },
    };
}

// With replica's indexes partial, every comparison of it is incomplete.
const abPartial = compare(partial, AB);
const baPartial = compare(partial, BA);
const abLimited = compare(partial, AB, 0);
const abDiagnostic = incomplete(abPartial, 'primary=replica', 'Comparison primary=replica is incomplete: the target replica is not completely covered (indexes partial)');
const baDiagnostic = incomplete(baPartial, 'replica=primary', 'Comparison replica=primary is incomplete: the baseline replica is not completely covered (indexes partial)');
const abLimitedDiagnostic = incomplete(abLimited, 'primary=replica', 'Comparison primary=replica is incomplete: 1 of 1 differences are left out by the limit of 0; the target replica is not completely covered (indexes partial)');
const staleNote = diagnostic('comparison_incomplete', 'inspection', { type: 'comparison', id: comparisonId(...AB), label: 'primary → replica' }, 'Written by an older producer.');
const otherKind = diagnostic('comparison_reviewed', 'lint', { type: 'comparison', id: comparisonId(...AB), label: null }, 'Reviewed.', { severity: 'info' });

export const STORE_CASES: Record<string, StoreCase> = {
    'add-to-empty': storeCase(
        'Comparisons are stored sorted by id, each incomplete one with its diagnostic, among the diagnostics already there in canonical order',
        partial,
        [],
        [unrelated],
        [baPartial, abPartial],
        [abPartial, baPartial],
        [unrelated, abDiagnostic, baDiagnostic],
    ),
    replace: storeCase(
        'A stored comparison with the same id is replaced, and every diagnostic about it (any kind) dropped; other comparisons and their diagnostics are kept',
        partial,
        [abPartial, baPartial],
        [staleNote, otherKind, baDiagnostic, unrelated],
        [abLimited],
        [abLimited, baPartial],
        [unrelated, abLimitedDiagnostic, baDiagnostic],
    ),
    'complete-drops-diagnostic': storeCase(
        'A comparison that is now complete replaces an incomplete one and leaves no comparison_incomplete diagnostic',
        cov(['public']),
        [compare(partial, AB)],
        [abDiagnostic],
        [compare(cov(['public']), AB)],
        [compare(cov(['public']), AB)],
        [],
    ),
    idempotent: storeCase(
        'Storing the comparisons a document already holds gives the same document',
        partial,
        [abPartial, baPartial],
        [unrelated, abDiagnostic, baDiagnostic],
        [abPartial, baPartial],
        [abPartial, baPartial],
        [unrelated, abDiagnostic, baDiagnostic],
    ),
};
