import { compareScopes, comparisonDiagnostics } from '../../src/contract/comparison';
import { byList, migrationTrackId } from '../../src/contract/ids';
import { migrationHistory, migrationState } from '../../src/contract/migration';
import type { Column, Connection, Coverage, MigrationCoverage, MigrationRevision, MigrationTrack, Provenance, SchemaDocument, Table } from '../../src/contract/types';
import { both, column, connection, constraint, diagnostic, document, foreignKey, index, model, part, primaryIndex, relationship, table } from './builders';

// Synthetic fixtures for comparisons, migration tracks and inferred associations. Comparisons, migration states and
// inferred associations are computed by the shared algorithms; the conformance cases check those by hand.

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

const id = (name: string, options: Partial<Column> = {}) => column(name, 'bigint', options);

// One tenant schema of a PostgreSQL connection. The two tenants differ in every kind of object; their sequence
// defaults name their own schema, which is never drift.
function tenant(schema: 'tenant_a' | 'tenant_b'): Table[] {
    const a = schema === 'tenant_a';
    const T = (name: string) => `app:${schema}.${name}`;
    const users = T('users');
    const orders = T('orders');
    const items = T('line_items');
    const seq = (name: string) => id('id', { autoIncrement: true, default: { kind: 'sequence', value: `nextval('${schema}.${name}_id_seq'::regclass)` } });
    const tables: Table[] = [
        table(
            users,
            'users',
            [
                seq('users'),
                column('email', 'character varying(255)', { typeName: 'varchar' }),
                column('name', 'text'),
                column('status', 'character varying(20)', { typeName: 'varchar', default: { kind: 'literal', value: a ? "'active'::character varying" : "'pending'::character varying" } }),
                a ? column('legacy_code', 'text', { nullable: true }) : column('phone', 'text', { nullable: true, comment: 'E.164' }),
            ],
            {
                schema,
                comment: a ? 'Tenant users' : 'Users',
                indexes: [
                    primaryIndex(users, 'users_pkey', ['id'], { method: 'btree' }),
                    index(users, 'users_email_key', [part('email')], { method: 'btree', unique: true, backs: { kind: 'unique_constraint', constraint: `${users}:constraint:users_email_key` } }),
                    index(users, 'users_name_idx', [part('name')], { method: 'btree', unique: !a }),
                ],
                constraints: [
                    constraint(users, 'unique', 'users_email_key', ['email']),
                    constraint(users, 'check', 'users_status_check', ['status'], "((status)::text = ANY ((ARRAY['active'::character varying, 'pending'::character varying])::text[]))"),
                ],
            },
        ),
        table(
            orders,
            'orders',
            [
                seq('orders'),
                id('user_id'),
                column('total', a ? 'numeric(10,2)' : 'numeric(12,2)', { typeName: 'numeric' }),
                column('placed_at', 'timestamp with time zone', { typeName: 'timestamptz', timezone: true, nullable: a }),
            ],
            {
                schema,
                indexes: [
                    primaryIndex(orders, 'orders_pkey', ['id'], { method: 'btree' }),
                    index(orders, a ? 'orders_user_id_idx' : 'orders_user_idx', [part('user_id')], { method: 'btree' }),
                    ...(a ? [index(orders, 'orders_placed_at_idx', [part('placed_at', { order: 'desc' })], { method: 'btree' })] : [index(orders, 'orders_total_idx', [part('total')], { method: 'btree' })]),
                ],
                foreignKeys: [foreignKey(orders, 'orders_user_id_fkey', ['user_id'], users, ['id'], { onDelete: a ? 'CASCADE' : 'RESTRICT' })],
                constraints: [constraint(orders, 'check', 'orders_total_check', ['total'], a ? '((total >= (0)::numeric))' : '((total > (0)::numeric))')],
            },
        ),
        table(
            items,
            'line_items',
            [id('order_id'), column('line_no', 'integer'), ...(a ? [] : [column('variant', 'integer')]), column('qty', 'integer'), ...(a ? [id('product_id')] : [id('coupon_id', { nullable: true })])],
            {
                schema,
                primaryKey: a ? ['order_id', 'line_no'] : ['order_id', 'line_no', 'variant'],
                indexes: [primaryIndex(items, 'line_items_pkey', a ? ['order_id', 'line_no'] : ['order_id', 'line_no', 'variant'], { method: 'btree' })],
                foreignKeys: [
                    foreignKey(items, 'line_items_order_id_fkey', ['order_id'], orders, ['id'], { onDelete: 'CASCADE' }),
                    a ? foreignKey(items, 'line_items_product_id_fkey', ['product_id'], T('products'), ['id']) : foreignKey(items, 'line_items_coupon_id_fkey', ['coupon_id'], T('coupons'), ['id']),
                ],
                constraints: a ? [constraint(items, 'check', 'line_items_qty_check', ['qty'], '((qty > 0))')] : [],
            },
        ),
        // A primary key only tenant_a has, and one only tenant_b has.
        table(T('audit_events'), 'audit_events', [id('id'), column('payload', 'jsonb')], { schema, primaryKey: a ? ['id'] : [], indexes: a ? [primaryIndex(T('audit_events'), 'audit_events_pkey', ['id'])] : [] }),
        table(T('settings'), 'settings', [column('key', 'text'), column('value', 'text')], {
            schema,
            primaryKey: a ? [] : ['key'],
            indexes: a ? [] : [primaryIndex(T('settings'), 'settings_pkey', ['key'])],
        }),
        table(T('alembic_version'), 'alembic_version', [column('version_num', 'character varying(32)', { typeName: 'varchar' })], {
            schema,
            primaryKey: ['version_num'],
            indexes: [primaryIndex(T('alembic_version'), 'alembic_version_pkc', ['version_num'])],
        }),
    ];
    tables.push(a ? table(T('products'), 'products', [id('id'), column('name', 'text')]) : table(T('coupons'), 'coupons', [id('id'), column('code', 'text')]));
    tables.push(a ? table(T('invoices'), 'invoices', [id('id'), id('order_id')], { schema }) : table(T('refunds'), 'refunds', [id('id'), id('order_id')], { schema }));
    return tables.map((t) => ({ ...t, schema }));
}

const ALEMBIC: MigrationRevision[] = [
    { id: '1a2b3c4d5e6f', parents: [], branchLabels: [] },
    { id: '2b3c4d5e6f7a', parents: ['1a2b3c4d5e6f'], branchLabels: [] },
    { id: '3c4d5e6f7a8b', parents: ['2b3c4d5e6f7a'], branchLabels: [] },
];

function track(provider: string, connectionId: string, schema: string | null, versionTable: string | null, revisions: MigrationRevision[] | null, current: string[] | null, coverage: MigrationCoverage[] = []): MigrationTrack {
    const history = revisions === null ? null : migrationHistory(revisions);
    const rows = [...coverage].sort((a, b) => byList([a.name, a.table ?? ''], [b.name, b.table ?? '']));
    return { id: migrationTrackId(provider, connectionId, schema), provider, connection: connectionId, schema, versionTable, history, current, ...migrationState(history, current), coverage: rows };
}

function tenantConnection(features: Coverage['features'] = FULL): Connection {
    return connection('app', 'postgresql', [...tenant('tenant_a'), ...tenant('tenant_b')], { defaultSchema: 'public', coverage: { database: cov(['tenant_a', 'tenant_b'], features), declared: null } });
}

// Two tenant schemas of one PostgreSQL connection: tables of the same name in both, a comparison with missing,
// extra and changed objects of every type, and one migration track per tenant.
function comparisonTenantSchemas(): SchemaDocument {
    const app = tenantConnection();
    const base = { source: 'database' as const, connections: [app] };
    const comparison = compareScopes(base, { connection: app.id, schema: 'tenant_a' }, { connection: app.id, schema: 'tenant_b' });
    return document('database', { name: 'python-schema-viewer', orm: null }, {
        connections: [app],
        comparisons: [comparison],
        migrations: [
            track('alembic', app.id, 'tenant_a', 'app:tenant_a.alembic_version', ALEMBIC, ['3c4d5e6f7a8b']),
            track('alembic', app.id, 'tenant_b', 'app:tenant_b.alembic_version', ALEMBIC, ['2b3c4d5e6f7a']),
        ],
    });
}

// The same tenants, with check constraints unavailable on the connection and the listing cut to five differences:
// the comparison is incomplete for both reasons, and a gate must not pass it.
function comparisonIncomplete(): SchemaDocument {
    const app = tenantConnection({ ...FULL, checkConstraints: 'unavailable' });
    const base = { source: 'database' as const, connections: [app] };
    const comparison = compareScopes(base, { connection: app.id, schema: 'tenant_b' }, { connection: app.id, schema: 'tenant_a' }, { limit: 5 });
    return document('database', { name: 'python-schema-viewer', orm: null }, {
        connections: [app],
        comparisons: [comparison],
        diagnostics: [
            diagnostic('inspection_unavailable', 'inspection', { type: 'connection', id: app.id, label: 'app' }, 'Check constraints could not be read: the inspection role lacks access to pg_constraint.'),
            ...comparisonDiagnostics(base, comparison),
        ],
    });
}

// A PostgreSQL primary and a MySQL replica of one schema. Types compare through normalization (likely): synonyms
// and display widths are equal, timestamptz against datetime and text against longtext are not. Compared with the
// override column/changed/type = error.
function comparisonMultiConnection(): SchemaDocument {
    const P = (name: string) => `primary:public.${name}`;
    const M = (name: string) => `replica:${name}`;
    const primary = connection(
        'primary',
        'postgresql',
        [
            table(P('customers'), 'customers', [
                id('id', { autoIncrement: true, default: { kind: 'identity', value: 'GENERATED BY DEFAULT AS IDENTITY' } }),
                column('email', 'character varying(255)', { typeName: 'varchar' }),
                column('active', 'boolean', { default: { kind: 'literal', value: 'true' } }),
                column('score', 'double precision', { typeName: 'double precision' }),
                column('created_at', 'timestamp with time zone', { typeName: 'timestamptz', timezone: true }),
                column('bio', 'text', { nullable: true }),
            ], { schema: 'public', indexes: [primaryIndex(P('customers'), 'customers_pkey', ['id'], { method: 'btree' })] }),
            table(P('orders'), 'orders', [id('id'), id('customer_id')], {
                schema: 'public',
                indexes: [primaryIndex(P('orders'), 'orders_pkey', ['id'], { method: 'btree' }), index(P('orders'), 'orders_customer_id_idx', [part('customer_id')], { method: 'btree' })],
                foreignKeys: [foreignKey(P('orders'), 'orders_customer_id_fkey', ['customer_id'], P('customers'), ['id'], { onDelete: 'RESTRICT' })],
            }),
        ],
        { defaultSchema: 'public', coverage: { database: cov(['public']), declared: null } },
    );
    const replica = connection(
        'replica',
        'mysql',
        [
            table(M('customers'), 'customers', [
                column('id', 'bigint unsigned', { typeName: 'bigint', autoIncrement: true }),
                column('email', 'varchar(255)'),
                column('active', 'tinyint(1)', { typeName: 'tinyint', default: { kind: 'literal', value: '1' } }),
                column('score', 'double'),
                column('created_at', 'datetime'),
                column('bio', 'longtext', { nullable: true }),
            ], { indexes: [primaryIndex(M('customers'), 'PRIMARY', ['id'], { method: 'btree' })] }),
            table(M('orders'), 'orders', [column('id', 'bigint unsigned', { typeName: 'bigint' }), column('customer_id', 'bigint unsigned', { typeName: 'bigint' })], {
                indexes: [primaryIndex(M('orders'), 'PRIMARY', ['id'], { method: 'btree' }), index(M('orders'), 'orders_customer_id_foreign', [part('customer_id')], { method: 'btree' })],
                foreignKeys: [foreignKey(M('orders'), 'orders_customer_id_foreign', ['customer_id'], M('customers'), ['id'], { onDelete: 'RESTRICT' })],
            }),
        ],
        { defaultSchema: 'shop', coverage: { database: cov(['shop']), declared: null } },
    );
    const base = { source: 'database' as const, connections: [primary, replica] };
    const comparison = compareScopes(base, { connection: primary.id, schema: null }, { connection: replica.id, schema: null }, { overrides: [{ objectType: 'column', change: 'changed', field: 'type', severity: 'error' }] });
    return document('database', { name: 'laranex-schema-viewer', orm: null }, { connections: [primary, replica], comparisons: [comparison] });
}

// Alembic tracks in every status, one per tenant schema of one PostgreSQL connection, with autogenerate and
// migration coverage on the first.
// Tenant schemas named like the tables and columns they hold: the schema `billing` has a table, a column and an
// index named `archive` or `billing`, compared with the schema `archive`. Keys name those objects, never the schema.
function comparisonSchemaNamedTables(): SchemaDocument {
    const T = (schema: string, name: string) => `ledger:${schema}.${name}`;
    const tables: Table[] = [
        table(T('billing', 'billing'), 'billing', [id('id'), column('archive', 'text', { nullable: true })], {
            schema: 'billing',
            indexes: [primaryIndex(T('billing', 'billing'), 'billing_pkey', ['id'], { method: 'btree' }), index(T('billing', 'billing'), 'archive', [part('archive')], { method: 'btree' })],
        }),
        table(T('archive', 'archive'), 'archive', [id('id')], { schema: 'archive', indexes: [primaryIndex(T('archive', 'archive'), 'archive_pkey', ['id'], { method: 'btree' })] }),
        table(T('archive', 'billing'), 'billing', [id('id')], { schema: 'archive', indexes: [primaryIndex(T('archive', 'billing'), 'billing_pkey', ['id'], { method: 'btree' })] }),
    ];
    const ledger = connection('ledger', 'postgresql', tables, { defaultSchema: 'public', coverage: { database: cov(['archive', 'billing']), declared: null } });
    const comparison = compareScopes({ source: 'database', connections: [ledger] }, { connection: ledger.id, schema: 'billing' }, { connection: ledger.id, schema: 'archive' });
    return document('database', { name: 'python-schema-viewer', orm: null }, { connections: [ledger], comparisons: [comparison] });
}

function migrationsAlembic(): SchemaDocument {
    const schemas = ['tenant_behind', 'tenant_branches', 'tenant_current', 'tenant_diverged', 'tenant_locked', 'tenant_new', 'tenant_partial', 'tenant_partial_new', 'tenant_scriptless', 'tenant_unknown'];
    const T = (schema: string, name: string) => `app:${schema}.${name}`;
    const versionTable = (schema: string) => table(T(schema, 'alembic_version'), 'alembic_version', [column('version_num', 'character varying(32)', { typeName: 'varchar' })], { schema, primaryKey: ['version_num'] });
    const users = (schema: string) => table(T(schema, 'users'), 'users', [id('id'), column('email', 'text')], { schema });
    const tables = schemas.flatMap((s) => (s === 'tenant_new' || s === 'tenant_partial_new' ? [users(s)] : [users(s), versionTable(s)]));
    tables.push(
        table(T('tenant_current', 'audit_log'), 'audit_log', [id('id'), column('event', 'text')], { schema: 'tenant_current' }),
        table(T('tenant_current', 'legacy_import'), 'legacy_import', [column('row', 'text')], { schema: 'tenant_current' }),
    );
    const app = connection('app', 'postgresql', tables, { defaultSchema: 'public', coverage: { database: cov(schemas), declared: null } });
    // A merged history: 1a → 2b → 3c, and 2b → 4d, merged by 5e.
    const merged: MigrationRevision[] = [
        ...ALEMBIC,
        { id: '4d5e6f7a8b9c', parents: ['2b3c4d5e6f7a'], branchLabels: ['reporting'] },
        { id: '5e6f7a8b9c0d', parents: ['3c4d5e6f7a8b', '4d5e6f7a8b9c'], branchLabels: [] },
    ];
    // Two unmerged branches from 1a.
    const branches: MigrationRevision[] = [ALEMBIC[0], { id: '6f7a8b9c0d1e', parents: ['1a2b3c4d5e6f'], branchLabels: ['billing'] }, { id: '7a8b9c0d1e2f', parents: ['1a2b3c4d5e6f'], branchLabels: ['search'] }];
    // The oldest scripts were squashed away: 1a is named as a parent but missing.
    const partial = ALEMBIC.slice(1);
    const coverage: MigrationCoverage[] = [
        { table: null, name: 'archived_orders', declared: false, autogenerate: 'unknown', migrationManaged: 'yes', certainty: 'likely', evidence: [{ kind: 'create_table', detail: '2b3c4d5e6f7a' }, { kind: 'drop_table', detail: '3c4d5e6f7a8b' }] },
        { table: T('tenant_current', 'alembic_version'), name: 'alembic_version', declared: false, autogenerate: 'excluded', migrationManaged: 'no', certainty: 'certain', evidence: [{ kind: 'version_table', detail: 'alembic_version' }] },
        { table: T('tenant_current', 'audit_log'), name: 'audit_log', declared: false, autogenerate: 'excluded', migrationManaged: 'yes', certainty: 'certain', evidence: [{ kind: 'create_table', detail: '4d5e6f7a8b9c' }, { kind: 'include_filter', detail: 'include_object skips audit_log' }] },
        { table: T('tenant_current', 'legacy_import'), name: 'legacy_import', declared: false, autogenerate: 'unknown', migrationManaged: 'unknown', certainty: 'likely', evidence: [] },
        { table: T('tenant_current', 'users'), name: 'users', declared: true, autogenerate: 'included', migrationManaged: 'yes', certainty: 'certain', evidence: [{ kind: 'create_table', detail: '1a2b3c4d5e6f' }, { kind: 'model', detail: 'app.models.User' }] },
    ];
    const vt = (s: string) => T(s, 'alembic_version');
    const tracks = [
        track('alembic', app.id, 'tenant_current', vt('tenant_current'), merged, ['5e6f7a8b9c0d'], coverage),
        track('alembic', app.id, 'tenant_behind', vt('tenant_behind'), merged, ['2b3c4d5e6f7a']),
        track('alembic', app.id, 'tenant_branches', vt('tenant_branches'), branches, ['6f7a8b9c0d1e']),
        track('alembic', app.id, 'tenant_diverged', vt('tenant_diverged'), merged, ['3c4d5e6f7a8b', '5e6f7a8b9c0d']),
        track('alembic', app.id, 'tenant_new', null, merged, []),
        track('alembic', app.id, 'tenant_unknown', vt('tenant_unknown'), merged, ['9f0e1d2c3b4a']),
        track('alembic', app.id, 'tenant_scriptless', vt('tenant_scriptless'), null, ['3c4d5e6f7a8b']),
        track('alembic', app.id, 'tenant_locked', vt('tenant_locked'), merged, null),
        track('alembic', app.id, 'tenant_partial', vt('tenant_partial'), partial, ['2b3c4d5e6f7a']),
        track('alembic', app.id, 'tenant_partial_new', null, partial, []),
    ];
    const of = (schema: string) => tracks.find((t) => t.schema === schema) as MigrationTrack;
    return document('database', { name: 'python-schema-viewer', orm: null }, {
        connections: [app],
        migrations: tracks,
        diagnostics: [
            diagnostic('migration_multiple_heads', 'lint', { type: 'migration', id: of('tenant_branches').id, label: 'alembic · tenant_branches' }, 'The migration history has two heads, 6f7a8b9c0d1e (billing) and 7a8b9c0d1e2f (search); merge them.'),
            diagnostic('migration_unknown_revision', 'reconciliation', { type: 'migration', id: of('tenant_unknown').id, label: 'alembic · tenant_unknown' }, 'The database is at 9f0e1d2c3b4a, which no migration script defines.', { severity: 'error' }),
            diagnostic('migration_history_unavailable', 'extraction', { type: 'migration', id: of('tenant_scriptless').id, label: 'alembic · tenant_scriptless' }, 'The migration scripts could not be read: script_location does not exist.', { severity: 'error' }),
            diagnostic('migration_version_table_unreadable', 'inspection', { type: 'migration', id: of('tenant_locked').id, label: 'alembic · tenant_locked' }, 'tenant_locked.alembic_version could not be read: permission denied.', { severity: 'error' }),
        ],
    });
}

// ORM models over foreign keys that no relationship declares: many-to-one, one-to-one through a unique constraint or
// a unique index, a composite foreign key, an association table, a self-reference, two foreign keys between the same
// tables, a table two models map, a foreign key only the ORM declares, and what is never inferred (a declared
// relationship's foreign key, an unmapped table).
function inferredAssociations(): SchemaDocument {
    const T = (name: string) => `app:public.${name}`;
    const M = (name: string) => `model:app.models.${name}`;
    const fk = (from: string, name: string, columns: string[], to: string, foreignColumns = ['id'], provenance: Provenance = both) => foreignKey(T(from), name, columns, T(to), foreignColumns, { provenance });
    const t = (name: string, columns: string[], options: Partial<Table> = {}) => table(T(name), name, columns.map((c) => id(c)), { schema: 'public', ...options });
    const tables: Table[] = [
        t('users', ['id', 'team_id', 'manager_id'], { foreignKeys: [fk('users', 'users_team_id_fkey', ['team_id'], 'teams', ['id'], ['declared']), fk('users', 'users_manager_id_fkey', ['manager_id'], 'users')] }),
        t('teams', ['id']),
        t('profiles', ['id', 'user_id'], { foreignKeys: [fk('profiles', 'profiles_user_id_fkey', ['user_id'], 'users')], constraints: [constraint(T('profiles'), 'unique', 'profiles_user_id_key', ['user_id'])] }),
        t('passports', ['id', 'user_id'], { foreignKeys: [fk('passports', 'passports_user_id_fkey', ['user_id'], 'users')], indexes: [index(T('passports'), 'passports_user_id_idx', [part('user_id')], { unique: true })] }),
        t('posts', ['id', 'author_id'], { foreignKeys: [fk('posts', 'posts_author_id_fkey', ['author_id'], 'users')] }),
        t('tags', ['id']),
        t('post_tags', ['post_id', 'tag_id'], { primaryKey: ['post_id', 'tag_id'], foreignKeys: [fk('post_tags', 'post_tags_post_id_fkey', ['post_id'], 'posts'), fk('post_tags', 'post_tags_tag_id_fkey', ['tag_id'], 'tags')] }),
        t('friendships', ['user_id', 'friend_id'], { primaryKey: ['user_id', 'friend_id'], foreignKeys: [fk('friendships', 'friendships_user_id_fkey', ['user_id'], 'users'), fk('friendships', 'friendships_friend_id_fkey', ['friend_id'], 'users')] }),
        t('messages', ['id', 'sender_id', 'recipient_id'], { foreignKeys: [fk('messages', 'messages_sender_id_fkey', ['sender_id'], 'users'), fk('messages', 'messages_recipient_id_fkey', ['recipient_id'], 'users')] }),
        table(T('orders'), 'orders', [id('id'), column('region', 'text'), column('number', 'integer')], { schema: 'public', constraints: [constraint(T('orders'), 'unique', 'orders_region_number_key', ['region', 'number'])] }),
        table(T('order_lines'), 'order_lines', [id('id'), column('order_region', 'text'), column('order_number', 'integer')], {
            schema: 'public',
            foreignKeys: [fk('order_lines', 'order_lines_order_fkey', ['order_region', 'order_number'], 'orders', ['region', 'number'])],
        }),
        t('accounts', ['id']),
        t('invoices', ['id', 'account_id'], { foreignKeys: [fk('invoices', 'invoices_account_id_fkey', ['account_id'], 'accounts')] }),
        t('import_rows', ['id', 'user_id'], { foreignKeys: [fk('import_rows', 'import_rows_user_id_fkey', ['user_id'], 'users')] }),
    ];
    // Combined: both sources observed everything except the foreign key only the ORM declares.
    const observed = (p: Provenance) => (p.length === 1 && p[0] === 'database' ? both : p);
    const combined = tables.map((x) => ({
        ...x,
        provenance: both,
        columns: x.columns.map((c) => ({ ...c, provenance: both })),
        indexes: x.indexes.map((i) => ({ ...i, provenance: both })),
        foreignKeys: x.foreignKeys.map((f) => ({ ...f, provenance: observed(f.provenance) })),
        constraints: x.constraints.map((c) => ({ ...c, provenance: both })),
    }));
    const features = { ...FULL, models: 'complete', relationships: 'complete' } as const;
    const app = connection('app', 'postgresql', combined, { defaultSchema: 'public', coverage: { database: cov(['public'], { ...features, models: 'not_applicable', relationships: 'not_applicable' }), declared: cov(null, features) } });
    const mapped = ['User:users', 'Team:teams', 'Profile:profiles', 'Passport:passports', 'Post:posts', 'Tag:tags', 'Message:messages', 'Order:orders', 'OrderLine:order_lines', 'Account:accounts', 'AdminAccount:accounts', 'Invoice:invoices'];
    return document('combined', { name: 'python-schema-viewer', orm: 'sqlalchemy' }, {
        connections: [app],
        models: mapped.map((m) => {
            const [name, tableName] = m.split(':');
            return model(M(name), `app.models.${name}`, [T(tableName)]);
        }),
        relationships: [
            relationship('relationship:app.models.Post.author', 'author', {
                model: M('Post'),
                table: T('posts'),
                relatedModel: M('User'),
                relatedTable: T('users'),
                type: 'MANYTOONE',
                cardinality: 'many-to-one',
                keys: { from: { table: T('posts'), columns: ['author_id'] }, to: { table: T('users'), columns: ['id'] } },
            }),
        ],
        diagnostics: [
            diagnostic('declared_only', 'reconciliation', { type: 'foreignKey', id: `${T('users')}:fk:users_team_id_fkey`, label: 'users.team_id' }, 'The model declares a foreign key on users.team_id; the database does not enforce one.'),
            diagnostic('table_without_model', 'reconciliation', { type: 'table', id: T('import_rows'), label: 'public.import_rows' }, 'No model maps public.import_rows.', { severity: 'info' }),
            diagnostic('table_without_model', 'reconciliation', { type: 'table', id: T('friendships'), label: 'public.friendships' }, 'No model maps public.friendships.', { severity: 'info' }),
            diagnostic('table_without_model', 'reconciliation', { type: 'table', id: T('post_tags'), label: 'public.post_tags' }, 'No model maps public.post_tags.', { severity: 'info' }),
        ],
    });
}

export const INTELLIGENCE: Record<string, () => SchemaDocument> = {
    'comparison-tenant-schemas': comparisonTenantSchemas,
    'comparison-multi-connection': comparisonMultiConnection,
    'comparison-incomplete': comparisonIncomplete,
    'comparison-schema-named-tables': comparisonSchemaNamedTables,
    'migrations-alembic': migrationsAlembic,
    'inferred-associations': inferredAssociations,
};
