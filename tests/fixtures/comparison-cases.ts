import type { SeverityOverride } from '../../src/contract/comparison';
import { comparisonId, differenceId } from '../../src/contract/ids';
import type { Certainty, Change, Column, Comparison, Connection, Coverage, DifferenceRef, FieldDifference, ObjectType, Scope, Severity, SourceMode, Table } from '../../src/contract/types';
import { column, connection, constraint, foreignKey, index, part, primaryIndex, table } from './builders';

// Comparison conformance cases, written to contract/conformance/comparison/<name>.json as
// { description, input: { document, baseline, target, overrides, limit }, expected }. The expected comparisons are
// written out by hand, not produced by compareScopes, so they check it.

export type ComparisonCase = {
    description: string;
    input: { document: { source: SourceMode; connections: Connection[] }; baseline: Scope; target: Scope; overrides: SeverityOverride[]; limit: number | null };
    expected: Comparison;
};

const FULL: Coverage = {
    complete: true,
    schemas: null,
    features: {
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
    },
};

const conn = (name: string, driver: string, tables: Table[], coverage: Coverage = FULL, defaultSchema: string | null = null): Connection =>
    connection(name, driver, tables, { defaultSchema, coverage: { database: coverage, declared: null } });
const c = (name: string, type = 'bigint', options: Partial<Column> = {}) => column(name, type, options);
const t = (id: string, name: string, columns: Column[], options: Partial<Table> = {}) => table(id, name, columns, { primaryKey: [], ...options });
const S = (connectionName: string, schema: string | null = null): Scope => ({ connection: `connection:${connectionName}`, schema });
const R = (tableId: string, id: string | null, label: string): DifferenceRef => ({ table: tableId, id, label });
const F = (field: string, baseline: FieldDifference['baseline'], target: FieldDifference['target']): FieldDifference => ({ field, baseline, target });

type Row = [ObjectType, string[], Change, DifferenceRef | null, DifferenceRef | null, FieldDifference[], Severity, Certainty];

function expected(baseline: Scope, target: Scope, rows: Row[], summary?: Comparison['summary'], complete = true, omitted = 0): Comparison {
    const id = comparisonId(baseline, target);
    const count = { missing: 0, extra: 0, changed: 0 };
    rows.forEach((r) => count[r[2]]++);
    return {
        id,
        baseline,
        target,
        complete,
        omitted,
        summary: summary ?? count,
        differences: rows.map(([objectType, key, change, b, tg, fields, severity, certainty]) => ({ id: differenceId(id, objectType, key), change, objectType, key, baseline: b, target: tg, fields, severity, certainty })),
    };
}

function make(description: string, connections: Connection[], baseline: Scope, target: Scope, rows: Row[], options: { overrides?: SeverityOverride[]; limit?: number; source?: SourceMode; summary?: Comparison['summary']; complete?: boolean; omitted?: number } = {}): ComparisonCase {
    return {
        description,
        input: { document: { source: options.source ?? 'database', connections }, baseline, target, overrides: options.overrides ?? [], limit: options.limit ?? null },
        expected: expected(baseline, target, rows, options.summary, options.complete ?? true, options.omitted ?? 0),
    };
}

// Two tenant schemas of one PostgreSQL connection, identical but for names that carry the schema.
function tenantTables(schema: string): Table[] {
    const users = `app:${schema}.users`;
    return [
        t(users, 'users', [c('id', 'bigint', { default: { kind: 'sequence', value: `nextval('${schema}.users_id_seq'::regclass)` } }), c('email', 'text')], {
            schema,
            primaryKey: ['id'],
            indexes: [primaryIndex(users, 'users_pkey', ['id']), index(users, 'users_email_idx', [part({ expression: `${schema}.normalize_email(email)` })])],
            constraints: [constraint(users, 'check', 'users_email_check', ['email'], `(${schema}.valid_email(email))`)],
        }),
    ];
}

const tenants = conn('app', 'postgresql', [...tenantTables('tenant_a'), ...tenantTables('tenant_b')], { ...FULL, schemas: ['tenant_a', 'tenant_b'] }, 'public');

const pair = (a: Table[], b: Table[], driverB = 'postgresql') => [conn('a', 'postgresql', a), conn('b', driverB, b)];

export const COMPARISON_CASES: Record<string, ComparisonCase> = {
    'tenant-schemas-equal': make(
        'Tenant schemas whose only differences are their own schema names in sequences, index expressions and checks are equal; keys never name the schema',
        [tenants],
        S('app', 'tenant_a'),
        S('app', 'tenant_b'),
        [],
    ),
    'tables-missing-extra': make(
        'Tables match by name; a table only in the baseline is missing, one only in the target extra, and their contents are not listed',
        pair([t('a:users', 'users', [c('id')]), t('a:posts', 'posts', [c('id'), c('title', 'text')])], [t('b:users', 'users', [c('id')]), t('b:comments', 'comments', [c('id')])]),
        S('a'),
        S('b'),
        [
            ['table', ['comments'], 'extra', null, R('b:comments', null, 'comments'), [], 'error', 'certain'],
            ['table', ['posts'], 'missing', R('a:posts', null, 'posts'), null, [], 'error', 'certain'],
        ],
    ),
    'column-fields-same-driver': make(
        'Columns match by name; on one driver types compare as written (certain), defaults as normalized SQL (likely), and fields are sorted',
        pair(
            [t('a:users', 'users', [c('email', 'varchar(255)', { nullable: true }), c('note', 'text', { comment: 'old' }), c('status', 'text', { default: { kind: 'literal', value: "'a'::text" } })], { comment: 'People' })],
            [t('b:users', 'users', [c('email', 'VARCHAR(320)'), c('note', 'text', { comment: 'new' }), c('phone', 'text'), c('status', 'text', { default: { kind: 'literal', value: "'b'::text" } })], { comment: 'People' })],
        ),
        S('a'),
        S('b'),
        [
            ['column', ['users', 'email'], 'changed', R('a:users', null, 'users.email'), R('b:users', null, 'users.email'), [F('nullable', true, false), F('type', 'varchar(255)', 'VARCHAR(320)')], 'warning', 'certain'],
            ['column', ['users', 'note'], 'changed', R('a:users', null, 'users.note'), R('b:users', null, 'users.note'), [F('comment', 'old', 'new')], 'info', 'certain'],
            ['column', ['users', 'phone'], 'extra', null, R('b:users', null, 'users.phone'), [], 'error', 'certain'],
            ['column', ['users', 'status'], 'changed', R('a:users', null, 'users.status'), R('b:users', null, 'users.status'), [F('default', { kind: 'literal', value: "'a'::text" }, { kind: 'literal', value: "'b'::text" })], 'warning', 'likely'],
        ],
    ),
    'cross-driver-types': make(
        'Across drivers types compare after normalization (synonyms, display widths, tinyint(1) as boolean) and every type difference is likely; auto-increment defaults are equal',
        pair(
            [
                t('a:events', 'events', [
                    c('id', 'bigint', { default: { kind: 'identity', value: 'GENERATED BY DEFAULT AS IDENTITY' } }),
                    c('name', 'character varying(255)'),
                    c('count', 'integer'),
                    c('done', 'boolean'),
                    c('amount', 'numeric(10,2)'),
                    c('at', 'timestamp with time zone', { timezone: true }),
                    c('body', 'text'),
                ]),
            ],
            [t('b:events', 'events', [c('id', 'bigint unsigned', { autoIncrement: true }), c('name', 'varchar(255)'), c('count', 'int(11)'), c('done', 'tinyint(1)'), c('amount', 'decimal(10,2)'), c('at', 'datetime'), c('body', 'longtext')])],
            'mysql',
        ),
        S('a'),
        S('b'),
        [
            ['column', ['events', 'at'], 'changed', R('a:events', null, 'events.at'), R('b:events', null, 'events.at'), [F('type', 'timestamp with time zone', 'datetime')], 'warning', 'likely'],
            ['column', ['events', 'body'], 'changed', R('a:events', null, 'events.body'), R('b:events', null, 'events.body'), [F('type', 'text', 'longtext')], 'warning', 'likely'],
        ],
    ),
    'primary-key': make(
        'A primary key compares by its ordered columns: changed, missing (baseline only) and extra (target only), all errors',
        pair(
            [t('a:t1', 't1', [c('a'), c('b')], { primaryKey: ['a', 'b'] }), t('a:t2', 't2', [c('id')], { primaryKey: ['id'] }), t('a:t3', 't3', [c('id')])],
            [t('b:t1', 't1', [c('a'), c('b')], { primaryKey: ['b', 'a'] }), t('b:t2', 't2', [c('id')]), t('b:t3', 't3', [c('id')], { primaryKey: ['id'] })],
        ),
        S('a'),
        S('b'),
        [
            ['primaryKey', ['t1'], 'changed', R('a:t1', null, 't1 primary key'), R('b:t1', null, 't1 primary key'), [F('columns', ['a', 'b'], ['b', 'a'])], 'error', 'certain'],
            ['primaryKey', ['t2'], 'missing', R('a:t2', null, 't2 primary key'), null, [], 'error', 'certain'],
            ['primaryKey', ['t3'], 'extra', null, R('b:t3', null, 't3 primary key'), [], 'error', 'certain'],
        ],
    ),
    'index-matching': make(
        'Indexes match by name, then by key parts and uniqueness; indexes backing the primary key or a unique constraint entity are compared as those',
        pair(
            [
                t('a:users', 'users', [c('id'), c('email', 'text'), c('name', 'text'), c('code', 'text')], {
                    primaryKey: ['id'],
                    indexes: [
                        primaryIndex('a:users', 'users_pkey', ['id']),
                        index('a:users', 'idx_email', [part('email')]),
                        index('a:users', 'idx_old_name', [part('name', { order: 'desc' })]),
                        index('a:users', 'users_code_key', [part('code')], { unique: true, backs: { kind: 'unique_constraint', constraint: 'a:users:constraint:users_code_key' } }),
                    ],
                    constraints: [constraint('a:users', 'unique', 'users_code_key', ['code'])],
                }),
            ],
            [
                t('b:users', 'users', [c('id'), c('email', 'text'), c('name', 'text'), c('code', 'text')], {
                    primaryKey: ['id'],
                    indexes: [
                        primaryIndex('b:users', 'users_pk', ['id']),
                        index('b:users', 'idx_email', [part('email')], { unique: true }),
                        index('b:users', 'idx_new_name', [part('name', { order: 'desc' })]),
                        index('b:users', 'users_code_unique', [part('code')], { unique: true, backs: { kind: 'unique_constraint', constraint: 'b:users:constraint:users_code_key' } }),
                    ],
                    constraints: [constraint('b:users', 'unique', 'users_code_key', ['code'])],
                }),
            ],
        ),
        S('a'),
        S('b'),
        [
            ['index', ['users', 'name', 'idx_email'], 'changed', R('a:users', 'a:users:index:idx_email', 'users.idx_email'), R('b:users', 'b:users:index:idx_email', 'users.idx_email'), [F('unique', false, true)], 'warning', 'certain'],
            ['index', ['users', 'parts', '(name desc)'], 'changed', R('a:users', 'a:users:index:idx_old_name', 'users.idx_old_name'), R('b:users', 'b:users:index:idx_new_name', 'users.idx_new_name'), [F('name', 'idx_old_name', 'idx_new_name')], 'warning', 'certain'],
        ],
    ),
    'unnamed-duplicates': make(
        'Identities that still coincide (unnamed duplicate indexes) get "#2", "#3", … in the order of their entity ids',
        pair(
            [t('a:t', 't', [c('x')], { indexes: [index('a:t', null, [part('x')], { id: 'a:t:index:1' }), index('a:t', null, [part('x')], { id: 'a:t:index:2' })] })],
            [t('b:t', 't', [c('x')])],
        ),
        S('a'),
        S('b'),
        [
            ['index', ['t', 'parts', '(x)'], 'missing', R('a:t', 'a:t:index:1', 't.(x)'), null, [], 'warning', 'certain'],
            ['index', ['t', 'parts', '(x)', '#2'], 'missing', R('a:t', 'a:t:index:2', 't.(x)'), null, [], 'warning', 'certain'],
        ],
    ),
    'foreign-key-matching': make(
        'Foreign keys match by columns, referenced table name and columns, then by name; key order sorts "name" before "references"',
        pair(
            [
                t('a:orders', 'orders', [c('id'), c('user_id'), c('team_id')], {
                    foreignKeys: [foreignKey('a:orders', 'fk_a', ['user_id'], 'a:users', ['id'], { onDelete: 'CASCADE' }), foreignKey('a:orders', 'fk_team', ['team_id'], 'a:teams', ['id'])],
                }),
                t('a:users', 'users', [c('id')]),
                t('a:teams', 'teams', [c('id')]),
                t('a:groups', 'groups', [c('id')]),
            ],
            [
                t('b:orders', 'orders', [c('id'), c('user_id'), c('team_id')], {
                    foreignKeys: [foreignKey('b:orders', 'fk_b', ['user_id'], 'b:users', ['id']), foreignKey('b:orders', 'fk_team', ['team_id'], 'b:groups', ['id'])],
                }),
                t('b:users', 'users', [c('id')]),
                t('b:teams', 'teams', [c('id')]),
                t('b:groups', 'groups', [c('id')]),
            ],
        ),
        S('a'),
        S('b'),
        [
            ['foreignKey', ['orders', 'name', 'fk_team'], 'changed', R('a:orders', 'a:orders:fk:fk_team', 'orders.fk_team'), R('b:orders', 'b:orders:fk:fk_team', 'orders.fk_team'), [F('foreignTable', 'teams', 'groups')], 'warning', 'certain'],
            ['foreignKey', ['orders', 'references', 'user_id->users(id)'], 'changed', R('a:orders', 'a:orders:fk:fk_a', 'orders.fk_a'), R('b:orders', 'b:orders:fk:fk_b', 'orders.fk_b'), [F('name', 'fk_a', 'fk_b'), F('onDelete', 'CASCADE', null)], 'warning', 'certain'],
        ],
    ),
    'referential-actions-mysql': make(
        'A missing action means NO ACTION, and RESTRICT equals NO ACTION when either side is MySQL or MariaDB',
        pair(
            [t('a:orders', 'orders', [c('user_id')], { foreignKeys: [foreignKey('a:orders', 'fk', ['user_id'], 'a:users', ['id'], { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })] }), t('a:users', 'users', [c('id')])],
            [t('b:orders', 'orders', [c('user_id')], { foreignKeys: [foreignKey('b:orders', 'fk', ['user_id'], 'b:users', ['id'])] }), t('b:users', 'users', [c('id')])],
            'mysql',
        ),
        S('a'),
        S('b'),
        [['foreignKey', ['orders', 'references', 'user_id->users(id)'], 'changed', R('a:orders', 'a:orders:fk:fk', 'orders.fk'), R('b:orders', 'b:orders:fk:fk', 'orders.fk'), [F('onUpdate', 'CASCADE', null)], 'warning', 'certain']],
    ),
    constraints: make(
        'Constraints match by kind and name, then by kind and definition; a changed check expression is likely',
        pair(
            [t('a:t', 't', [c('total'), c('code', 'text')], { constraints: [constraint('a:t', 'check', 'c_total', ['total'], '(total >= 0)'), constraint('a:t', 'unique', 'u_code', ['code']), constraint('a:t', 'check', 'c_old', ['total'], '(total < 100)')] })],
            [t('b:t', 't', [c('total'), c('code', 'text')], { constraints: [constraint('b:t', 'check', 'c_total', ['total'], '(total > 0)'), constraint('b:t', 'unique', 'u_code_new', ['code'])] })],
        ),
        S('a'),
        S('b'),
        [
            ['constraint', ['t', 'check', 'name', 'c_old'], 'missing', R('a:t', 'a:t:constraint:c_old', 't.c_old'), null, [], 'warning', 'certain'],
            ['constraint', ['t', 'check', 'name', 'c_total'], 'changed', R('a:t', 'a:t:constraint:c_total', 't.c_total'), R('b:t', 'b:t:constraint:c_total', 't.c_total'), [F('expression', '(total >= 0)', '(total > 0)')], 'warning', 'likely'],
            ['constraint', ['t', 'unique', 'definition', 'code'], 'changed', R('a:t', 'a:t:constraint:u_code', 't.u_code'), R('b:t', 'b:t:constraint:u_code_new', 't.u_code_new'), [F('name', 'u_code', 'u_code_new')], 'warning', 'certain'],
        ],
    ),
    'severity-overrides': make(
        'Overrides apply per (objectType, change, field), then per (objectType, change); a changed difference takes its most severe field',
        pair([t('a:t', 't', [c('a', 'integer', { comment: 'x' })]), t('a:gone', 'gone', [c('id')])], [t('b:t', 't', [c('a', 'bigint', { comment: 'y' })])]),
        S('a'),
        S('b'),
        [
            ['table', ['gone'], 'missing', R('a:gone', null, 'gone'), null, [], 'warning', 'certain'],
            ['column', ['t', 'a'], 'changed', R('a:t', null, 't.a'), R('b:t', null, 't.a'), [F('comment', 'x', 'y'), F('type', 'integer', 'bigint')], 'error', 'certain'],
        ],
        {
            overrides: [
                { objectType: 'table', change: 'missing', severity: 'warning' },
                { objectType: 'column', change: 'changed', field: 'type', severity: 'error' },
                { objectType: 'column', change: 'changed', severity: 'info' },
            ],
        },
    ),
    'incomplete-limit': make(
        'A limit keeps the first differences in order; the rest are omitted, counted in the summary, and the comparison is incomplete',
        pair([t('a:t1', 't1', [c('id')]), t('a:t2', 't2', [c('id')]), t('a:t3', 't3', [c('id')])], []),
        S('a'),
        S('b'),
        [
            ['table', ['t1'], 'missing', R('a:t1', null, 't1'), null, [], 'error', 'certain'],
            ['table', ['t2'], 'missing', R('a:t2', null, 't2'), null, [], 'error', 'certain'],
        ],
        { limit: 2, summary: { missing: 3, extra: 0, changed: 0 }, complete: false, omitted: 1 },
    ),
    'incomplete-coverage': make(
        'A side whose coverage of a compared feature is not complete makes the comparison incomplete, with nothing omitted',
        [conn('a', 'postgresql', [t('a:t', 't', [c('id')])]), conn('b', 'postgresql', [t('b:t', 't', [c('id'), c('x')])], { complete: false, schemas: null, features: { ...FULL.features, indexes: 'partial' } })],
        S('a'),
        S('b'),
        [['column', ['t', 'x'], 'extra', null, R('b:t', null, 't.x'), [], 'error', 'certain']],
        { complete: false },
    ),
    'combined-declared-only': make(
        'In a combined document only what the database reported is compared: entities only the ORM declares are left out',
        [
            connection('a', 'postgresql', [t('a:t', 't', [c('id', 'bigint', { provenance: ['database', 'declared'] })], { provenance: ['database', 'declared'] })], { coverage: { database: FULL, declared: FULL } }),
            connection('b', 'postgresql', [t('b:t', 't', [c('id', 'bigint', { provenance: ['database', 'declared'] }), c('ghost', 'text', { provenance: ['declared'] })], { provenance: ['database', 'declared'] }), t('b:only', 'only', [c('id', 'bigint', { provenance: ['declared'] })], { provenance: ['declared'] })], {
                coverage: { database: FULL, declared: FULL },
            }),
        ],
        S('a'),
        S('b'),
        [],
        { source: 'combined' },
    ),
};
