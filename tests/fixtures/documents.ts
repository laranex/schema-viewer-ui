import type { Coverage, SchemaDocument } from '../../src/contract/types';
import {
    both,
    column,
    connection,
    constraint,
    coverage,
    declared,
    diagnostic,
    document,
    foreignKey,
    index,
    model,
    part,
    primaryIndex,
    relationship,
    table,
} from './builders';

// The synthetic valid fixtures, written to contract/fixtures/valid/<name>.json in canonical form.

const d = (provenance = declared) => ({ provenance });

// Declared ORM metadata, as the Python package reads it from SQLAlchemy: no database, dialect-specific index options,
// ORM-side defaults, composite keys, schema-qualified tables and an unresolved reference.
function declaredSqlalchemy(): SchemaDocument {
    const customers = 'table:default.customers';
    const orders = 'table:default.sales.orders';
    const lines = 'table:default.sales.order_lines';
    const products = 'table:default.products';
    const tags = 'table:default.tags';
    const customerTags = 'table:default.customer_tags';
    const legacy = foreignKey(orders, 'fk_orders_legacy', ['legacy_ref'], customers, ['legacy_code'], d());
    const M = (name: string) => `model:shop.models.${name}`;
    const R = (owner: string, name: string) => `relationship:shop.models.${owner}.${name}`;
    return document('declared', { name: 'python-schema-viewer', orm: 'sqlalchemy' }, {
        connections: [
            connection('default', null, [
                table(
                    customers,
                    'customers',
                    [
                        column('id', 'INTEGER', { ...d(), autoIncrement: null }),
                        column('email', 'VARCHAR(255)', { ...d(), comment: 'Login address' }),
                        column('active', 'BOOLEAN', { ...d(), default: { kind: 'literal', value: 'true' }, ormDefault: { kind: 'scalar', value: 'True' } }),
                        column('status', 'customer_status', { ...d(), typeName: 'enum', enum: { name: 'customer_status', values: ['active', 'closed'] } }),
                        column('created_at', 'DATETIME', { ...d(), timezone: true, ormDefault: { kind: 'callable', value: 'datetime.now' } }),
                    ],
                    {
                        ...d(),
                        comment: 'Buyers',
                        indexes: [
                            index(customers, 'uq_customers_active_email', [part('email')], { ...d(), unique: true, dialectOptions: { postgresql: { predicate: 'active = true' } } }),
                            index(customers, 'ix_customers_lower_email', [part({ expression: 'lower(email)' })], { ...d(), dialectOptions: { postgresql: { method: 'btree', included: ['id'] } } }),
                        ],
                        constraints: [constraint(customers, 'check', 'ck_customers_email_length', [], 'length(email) > 3', d())],
                    },
                ),
                table(
                    orders,
                    'orders',
                    [
                        column('id', 'INTEGER', { ...d(), autoIncrement: null }),
                        column('customer_id', 'INTEGER', d()),
                        column('referrer_email', 'VARCHAR(255)', { ...d(), nullable: true }),
                        column('legacy_ref', 'VARCHAR(20)', { ...d(), nullable: true }),
                    ],
                    {
                        ...d(),
                        schema: 'sales',
                        indexes: [index(orders, 'ix_orders_customer_id', [part('customer_id')], d())],
                        foreignKeys: [foreignKey(orders, 'fk_orders_customer', ['customer_id'], customers, ['id'], { ...d(), onDelete: 'RESTRICT', onUpdate: 'CASCADE' }), legacy],
                    },
                ),
                table(
                    lines,
                    'order_lines',
                    [
                        column('order_id', 'INTEGER', { ...d(), extensions: { sqlalchemy: { autoincrement: 'ignore_fk' } } }),
                        column('line_no', 'INTEGER', d()),
                        column('product_sku', 'VARCHAR(32)', d()),
                        column('product_region', 'CHAR(2)', d()),
                        column('quantity', 'INTEGER', { ...d(), ormDefault: { kind: 'scalar', value: '1' } }),
                    ],
                    {
                        ...d(),
                        schema: 'sales',
                        primaryKey: ['order_id', 'line_no'],
                        foreignKeys: [
                            foreignKey(lines, 'fk_order_lines_order', ['order_id'], orders, ['id'], { ...d(), onDelete: 'CASCADE', deferrable: true, initially: 'DEFERRED' }),
                            foreignKey(lines, 'fk_order_lines_product', ['product_sku', 'product_region'], products, ['sku', 'region'], d()),
                        ],
                    },
                ),
                table(products, 'products', [column('sku', 'VARCHAR(32)', d()), column('region', 'CHAR(2)', d()), column('price', 'NUMERIC(10, 2)', d())], {
                    ...d(),
                    primaryKey: ['sku', 'region'],
                }),
                table(tags, 'tags', [column('id', 'INTEGER', { ...d(), autoIncrement: null }), column('label', 'VARCHAR(40)', d())], {
                    ...d(),
                    constraints: [constraint(tags, 'unique', 'uq_tags_label', ['label'], null, d())],
                }),
                table(customerTags, 'customer_tags', [column('customer_id', 'INTEGER', d()), column('tag_id', 'INTEGER', d())], {
                    ...d(),
                    primaryKey: ['customer_id', 'tag_id'],
                    foreignKeys: [
                        foreignKey(customerTags, 'fk_customer_tags_customer', ['customer_id'], customers, ['id'], { ...d(), onDelete: 'CASCADE' }),
                        foreignKey(customerTags, 'fk_customer_tags_tag', ['tag_id'], tags, ['id'], { ...d(), onDelete: 'CASCADE' }),
                    ],
                }),
            ], {
                coverage: {
                    database: null,
                    declared: coverage({
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
                        models: 'complete',
                        relationships: 'complete',
                    }),
                },
            }),
        ],
        models: [
            model(M('Customer'), 'shop.models.Customer', [customers], { source: { file: 'shop/models.py', line: 12 } }),
            model(M('Order'), 'shop.models.Order', [orders], { source: { file: 'shop/models.py', line: 41 } }),
            model(M('OrderLine'), 'shop.models.OrderLine', [lines], { primaryKey: ['order_id', 'line_no'], source: { file: 'shop/models.py', line: 63 } }),
            model(M('Product'), 'shop.models.Product', [products], { primaryKey: ['sku', 'region'] }),
            model(M('Tag'), 'shop.models.Tag', [tags]),
        ],
        relationships: [
            relationship(R('Order', 'customer'), 'customer', {
                model: M('Order'),
                table: orders,
                relatedModel: M('Customer'),
                relatedTable: customers,
                type: 'MANYTOONE',
                cardinality: 'many-to-one',
                keys: { from: { table: orders, columns: ['customer_id'] }, to: { table: customers, columns: ['id'] } },
                join: { primary: 'customers.id = sales.orders.customer_id', secondary: null },
                inverse: R('Customer', 'orders'),
            }),
            relationship(R('Customer', 'orders'), 'orders', {
                model: M('Customer'),
                table: customers,
                relatedModel: M('Order'),
                relatedTable: orders,
                type: 'ONETOMANY',
                cardinality: 'one-to-many',
                keys: { from: { table: orders, columns: ['customer_id'] }, to: { table: customers, columns: ['id'] } },
                join: { primary: 'customers.id = sales.orders.customer_id', secondary: null },
                inverse: R('Order', 'customer'),
            }),
            relationship(R('Order', 'referrer'), 'referrer', {
                model: M('Order'),
                table: orders,
                relatedModel: M('Customer'),
                relatedTable: customers,
                type: 'MANYTOONE',
                cardinality: 'many-to-one',
                readOnly: true,
                keys: { from: { table: orders, columns: ['referrer_email'] }, to: { table: customers, columns: ['email'] } },
                join: { primary: 'customers.email = sales.orders.referrer_email', secondary: null },
            }),
            relationship(R('Order', 'lines'), 'lines', {
                model: M('Order'),
                table: orders,
                relatedModel: M('OrderLine'),
                relatedTable: lines,
                type: 'ONETOMANY',
                cardinality: 'one-to-many',
                keys: { from: { table: lines, columns: ['order_id'] }, to: { table: orders, columns: ['id'] } },
            }),
            relationship(R('OrderLine', 'product'), 'product', {
                model: M('OrderLine'),
                table: lines,
                relatedModel: M('Product'),
                relatedTable: products,
                type: 'MANYTOONE',
                cardinality: 'many-to-one',
                // The same pairs as the foreign key, in another order: still one link.
                keys: { from: { table: lines, columns: ['product_region', 'product_sku'] }, to: { table: products, columns: ['region', 'sku'] } },
            }),
            relationship(R('Customer', 'tags'), 'tags', {
                model: M('Customer'),
                table: customers,
                relatedModel: M('Tag'),
                relatedTable: tags,
                type: 'MANYTOMANY',
                cardinality: 'many-to-many',
                pivot: { table: customerTags, parentColumns: ['id'], parentPivotColumns: ['customer_id'], relatedColumns: ['id'], relatedPivotColumns: ['tag_id'], columns: [] },
                join: { primary: 'customers.id = customer_tags.customer_id', secondary: 'tags.id = customer_tags.tag_id' },
            }),
        ],
        diagnostics: [
            diagnostic('unresolved_foreign_key', 'extraction', { type: 'foreignKey', id: legacy.id, columns: ['legacy_ref'], label: 'sales.orders.legacy_ref' }, 'sales.orders.legacy_ref references customers.legacy_code, which is not declared'),
        ],
    });
}

// Database introspection enriched with Eloquent metadata, as Laravel produces it: every Eloquent relation kind,
// framework and package tables, notes, and lint findings that are certain or likely.
function combinedEloquent(): SchemaDocument {
    const T = (name: string) => `mysql:${name}`;
    const M = (name: string) => `App\\Models\\${name}`;
    const R = (owner: string, name: string) => `App\\Models\\${owner}::${name}`;
    const id = column('id', 'bigint unsigned', { typeName: 'bigint', autoIncrement: true });
    const fk = (t: string, name: string, columns: string[], target: string, options = {}) => foreignKey(T(t), name, columns, T(target), ['id'], { onDelete: 'NO ACTION', onUpdate: 'NO ACTION', ...options });
    const pk = (t: string) => primaryIndex(T(t), 'PRIMARY', ['id'], { method: 'btree' });
    const key = (t: string, columns: string[], options = {}) => index(T(t), `${t}_${columns.join('_')}_index`, columns.map((c) => part(c)), { method: 'btree', ...options });
    const ref = (name: string) => column(name, 'bigint unsigned', { typeName: 'bigint' });
    const rel = (owner: string, name: string, table: string, type: string, cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many', options = {}) =>
        relationship(R(owner, name), name, { model: M(owner), table: T(table), type, cardinality, source: { file: `app/Models/${owner}.php`, line: 20 }, ...options });
    const keys = (from: string, column: string, to: string, toColumn = 'id') => ({ from: { table: T(from), columns: [column] }, to: { table: T(to), columns: [toColumn] } });
    const timestamps = [column('created_at', 'timestamp', { nullable: true }), column('updated_at', 'timestamp', { nullable: true })];

    return document('combined', { name: 'laravel-schema-viewer', orm: 'eloquent' }, {
        note: 'Synthetic blog used by the contract fixtures.',
        connections: [
            connection(
                'mysql',
                'mysql',
                [
                    table(T('categories'), 'categories', [id, ref('parent_id'), column('name', 'varchar(255)', { typeName: 'varchar' })], {
                        indexes: [pk('categories'), key('categories', ['parent_id'])],
                        foreignKeys: [fk('categories', 'categories_parent_id_foreign', ['parent_id'], 'categories', { onDelete: 'SET NULL' })],
                    }),
                    table(T('comments'), 'comments', [id, ref('user_id'), column('commentable_type', 'varchar(255)', { typeName: 'varchar' }), ref('commentable_id'), column('body', 'text'), ...timestamps], {
                        indexes: [pk('comments'), key('comments', ['commentable_type', 'commentable_id'])],
                        foreignKeys: [fk('comments', 'comments_user_id_foreign', ['user_id'], 'users', { onDelete: 'CASCADE' })],
                    }),
                    table(T('countries'), 'countries', [id, column('code', 'char(2)', { typeName: 'char' })], { indexes: [pk('countries'), key('countries', ['code'], { name: 'countries_code_unique', id: `${T('countries')}:index:countries_code_unique`, unique: true })] }),
                    table(T('jobs'), 'jobs', [id, column('queue', 'varchar(255)', { typeName: 'varchar' }), column('payload', 'longtext')], {
                        owner: { kind: 'framework', package: null },
                        indexes: [pk('jobs'), key('jobs', ['queue'])],
                    }),
                    table(T('oauth_clients'), 'oauth_clients', [id, ref('user_id'), column('name', 'varchar(255)', { typeName: 'varchar' })], {
                        owner: { kind: 'package', package: 'laravel/passport' },
                        indexes: [pk('oauth_clients'), key('oauth_clients', ['user_id'])],
                    }),
                    table(
                        T('posts'),
                        'posts',
                        [
                            id,
                            ref('user_id'),
                            column('editor_id', 'bigint unsigned', { typeName: 'bigint', nullable: true }),
                            column('category_id', 'bigint unsigned', { typeName: 'bigint', nullable: true }),
                            column('title', 'varchar(255)', { typeName: 'varchar', note: 'Shown in feeds; keep it short.' }),
                            column('status', "enum('draft','published')", { typeName: 'enum', enum: { name: null, values: ['draft', 'published'] }, default: { kind: 'literal', value: "'draft'" } }),
                            column('published_at', 'timestamp', { nullable: true, default: { kind: 'expression', value: 'CURRENT_TIMESTAMP' } }),
                            ...timestamps,
                        ],
                        {
                            note: 'Articles, drafts included.',
                            indexes: [pk('posts'), key('posts', ['user_id']), key('posts', ['category_id']), key('posts', ['status', 'published_at'])],
                            foreignKeys: [fk('posts', 'posts_user_id_foreign', ['user_id'], 'users', { onDelete: 'CASCADE' }), fk('posts', 'posts_category_id_foreign', ['category_id'], 'categories', { onDelete: 'SET NULL' })],
                        },
                    ),
                    table(T('role_user'), 'role_user', [ref('user_id'), ref('role_id'), column('assigned_at', 'timestamp', { nullable: true })], {
                        primaryKey: ['user_id', 'role_id'],
                        indexes: [primaryIndex(T('role_user'), 'PRIMARY', ['user_id', 'role_id'], { method: 'btree' }), key('role_user', ['role_id'])],
                        foreignKeys: [fk('role_user', 'role_user_user_id_foreign', ['user_id'], 'users', { onDelete: 'CASCADE' }), fk('role_user', 'role_user_role_id_foreign', ['role_id'], 'roles', { onDelete: 'CASCADE' })],
                    }),
                    table(T('roles'), 'roles', [id, column('name', 'varchar(255)', { typeName: 'varchar' })], { indexes: [pk('roles')] }),
                    table(T('taggables'), 'taggables', [ref('tag_id'), column('taggable_type', 'varchar(255)', { typeName: 'varchar' }), ref('taggable_id')], {
                        primaryKey: [],
                        indexes: [key('taggables', ['tag_id']), key('taggables', ['taggable_type', 'taggable_id'])],
                        foreignKeys: [fk('taggables', 'taggables_tag_id_foreign', ['tag_id'], 'tags', { onDelete: 'CASCADE' })],
                    }),
                    table(T('tags'), 'tags', [id, column('name', 'varchar(255)', { typeName: 'varchar' })], { indexes: [pk('tags')] }),
                    table(T('users'), 'users', [id, ref('country_id'), column('email', 'varchar(255)', { typeName: 'varchar' }), column('remember_token', 'varchar(100)', { typeName: 'varchar', nullable: true }), ...timestamps], {
                        indexes: [pk('users'), key('users', ['email'], { name: 'users_email_unique', id: `${T('users')}:index:users_email_unique`, unique: true }), key('users', ['country_id'])],
                        foreignKeys: [fk('users', 'users_country_id_foreign', ['country_id'], 'countries')],
                    }),
                ],
                {
                    defaultSchema: 'blog',
                    coverage: {
                        database: coverage(
                            {
                                tables: 'complete',
                                columns: 'complete',
                                columnTypes: 'complete',
                                defaults: 'complete',
                                comments: 'complete',
                                primaryKeys: 'complete',
                                foreignKeys: 'complete',
                                referentialActions: 'complete',
                                indexes: 'complete',
                                indexExpressions: 'partial',
                                indexPredicates: 'not_applicable',
                                includedColumns: 'not_applicable',
                                uniqueConstraints: 'complete',
                                checkConstraints: 'unavailable',
                                models: 'not_applicable',
                                relationships: 'not_applicable',
                            },
                            ['blog'],
                        ),
                        declared: coverage({ tables: 'not_applicable', models: 'complete', relationships: 'partial' }),
                    },
                },
            ),
        ],
        models: ['Category', 'Comment', 'Country', 'Post', 'Role', 'Tag', 'User'].map((name) =>
            model(M(name), M(name), [T(name === 'Category' ? 'categories' : name === 'Country' ? 'countries' : `${name.toLowerCase()}s`)], {
                source: { file: `app/Models/${name}.php`, line: 9 },
                extensions: { eloquent: { keyType: 'int', incrementing: true, timestamps: name !== 'Tag', ...(name === 'User' ? { hidden: ['remember_token'], casts: { email_verified_at: 'datetime' } } : {}) } },
            }),
        ),
        relationships: [
            rel('Category', 'children', 'categories', 'HasMany', 'one-to-many', { relatedModel: M('Category'), relatedTable: T('categories'), keys: keys('categories', 'parent_id', 'categories'), inverse: R('Category', 'parent') }),
            rel('Category', 'parent', 'categories', 'BelongsTo', 'many-to-one', { relatedModel: M('Category'), relatedTable: T('categories'), keys: keys('categories', 'parent_id', 'categories'), inverse: R('Category', 'children') }),
            rel('Comment', 'author', 'comments', 'BelongsTo', 'many-to-one', { relatedModel: M('User'), relatedTable: T('users'), keys: keys('comments', 'user_id', 'users'), note: "Shown as the comment's byline." }),
            rel('Comment', 'commentable', 'comments', 'MorphTo', 'many-to-one', { polymorphic: { typeColumn: 'commentable_type', idColumn: 'commentable_id', typeValue: null }, inverse: R('Post', 'comments') }),
            rel('Country', 'posts', 'countries', 'HasManyThrough', 'one-to-many', { relatedModel: M('Post'), relatedTable: T('posts'), through: [T('users')] }),
            rel('Post', 'category', 'posts', 'BelongsTo', 'many-to-one', { relatedModel: M('Category'), relatedTable: T('categories'), keys: keys('posts', 'category_id', 'categories') }),
            rel('Post', 'comments', 'posts', 'MorphMany', 'one-to-many', {
                relatedModel: M('Comment'),
                relatedTable: T('comments'),
                keys: keys('comments', 'commentable_id', 'posts'),
                polymorphic: { typeColumn: 'commentable_type', idColumn: 'commentable_id', typeValue: M('Post') },
                inverse: R('Comment', 'commentable'),
            }),
            rel('Post', 'editor', 'posts', 'BelongsTo', 'many-to-one', { relatedModel: M('User'), relatedTable: T('users'), keys: keys('posts', 'editor_id', 'users') }),
            rel('Post', 'tags', 'posts', 'MorphToMany', 'many-to-many', {
                relatedModel: M('Tag'),
                relatedTable: T('tags'),
                pivot: { table: T('taggables'), parentColumns: ['id'], parentPivotColumns: ['taggable_id'], relatedColumns: ['id'], relatedPivotColumns: ['tag_id'], columns: [] },
                polymorphic: { typeColumn: 'taggable_type', idColumn: 'taggable_id', typeValue: M('Post') },
            }),
            rel('Post', 'user', 'posts', 'BelongsTo', 'many-to-one', { relatedModel: M('User'), relatedTable: T('users'), keys: keys('posts', 'user_id', 'users'), inverse: R('User', 'posts') }),
            rel('Role', 'users', 'roles', 'BelongsToMany', 'many-to-many', {
                relatedModel: M('User'),
                relatedTable: T('users'),
                pivot: { table: T('role_user'), parentColumns: ['id'], parentPivotColumns: ['role_id'], relatedColumns: ['id'], relatedPivotColumns: ['user_id'], columns: ['assigned_at'] },
                inverse: R('User', 'roles'),
            }),
            rel('User', 'latestPost', 'users', 'HasOne', 'one-to-one', { relatedModel: M('Post'), relatedTable: T('posts'), keys: keys('posts', 'user_id', 'users'), constraints: ['latestOfMany()'] }),
            rel('User', 'posts', 'users', 'HasMany', 'one-to-many', { relatedModel: M('Post'), relatedTable: T('posts'), keys: keys('posts', 'user_id', 'users'), inverse: R('Post', 'user') }),
            rel('User', 'roles', 'users', 'BelongsToMany', 'many-to-many', {
                relatedModel: M('Role'),
                relatedTable: T('roles'),
                pivot: { table: T('role_user'), parentColumns: ['id'], parentPivotColumns: ['user_id'], relatedColumns: ['id'], relatedPivotColumns: ['role_id'], columns: ['assigned_at'] },
                inverse: R('Role', 'users'),
                extensions: { eloquent: { using: 'App\\Models\\RoleUser', accessor: 'assignment' } },
            }),
        ],
        diagnostics: [
            diagnostic('relationship_without_foreign_key', 'lint', { type: 'relationship', id: R('Post', 'editor'), columns: ['editor_id'], label: 'posts.editor_id' }, 'Post::editor joins posts.editor_id to users.id, but no foreign key enforces it.', {
                extensions: { laravel: { ignore: { connection: 'mysql', table: 'posts', kind: 'relation_without_foreign_key', columns: 'editor_id' } } },
            }),
            diagnostic('missing_index', 'lint', { type: 'column', id: T('posts'), columns: ['editor_id'], label: 'posts.editor_id' }, 'posts.editor_id is joined on but no index starts with it.', { certainty: 'likely', severity: 'info' }),
            diagnostic('unresolved_relationship', 'extraction', { type: 'relationship', id: R('Post', 'broken'), label: 'Post::broken' }, 'Class "App\\Models\\Missing" not found.'),
            diagnostic('unsupported_metadata', 'inspection', { type: 'connection', id: 'connection:mysql', label: 'mysql' }, 'MySQL reports functional index key parts without their expressions.', { severity: 'info' }),
        ],
    });
}

// PostgreSQL introspection only, across two schemas: identity, enum, expression, partial, covering, GIN and
// operator-class indexes, and indexes that back constraints.
function databasePostgresql(): SchemaDocument {
    const accounts = 'pg:public.accounts';
    const invoices = 'pg:billing.invoices';
    const pg = (name: string, parts: ReturnType<typeof part>[], options = {}) => index(accounts, name, parts, { method: 'btree', ...options });
    return document('database', { name: 'contract-fixtures', orm: null }, {
        connections: [
            connection(
                'primary',
                'postgresql',
                [
                    table(
                        accounts,
                        'accounts',
                        [
                            column('id', 'bigint', { autoIncrement: true, default: { kind: 'identity', value: 'GENERATED BY DEFAULT AS IDENTITY' } }),
                            column('email', 'text'),
                            column('external_ref', 'uuid', { nullable: true }),
                            column('status', 'account_status', { typeName: 'enum', enum: { name: 'account_status', values: ['trial', 'active', 'closed'] }, default: { kind: 'literal', value: "'trial'::account_status" } }),
                            column('tags', 'text[]', { typeName: 'text[]' }),
                            column('data', 'jsonb', { default: { kind: 'literal', value: "'{}'::jsonb" } }),
                            column('created_at', 'timestamp with time zone', { typeName: 'timestamptz', timezone: true, default: { kind: 'expression', value: 'now()' } }),
                            column('deleted_at', 'timestamp with time zone', { typeName: 'timestamptz', timezone: true, nullable: true }),
                            column('search', 'tsvector', { nullable: true, generated: { kind: 'stored', expression: "to_tsvector('simple', email)" } }),
                        ],
                        {
                            schema: 'public',
                            comment: 'Customer accounts',
                            indexes: [
                                primaryIndex(accounts, 'accounts_pkey', ['id'], { method: 'btree' }),
                                pg('accounts_email_key', [part('email')], { unique: true, backs: { kind: 'unique_constraint', constraint: `${accounts}:constraint:accounts_email_key` } }),
                                pg('accounts_external_ref_key', [part('external_ref')], { unique: true, dialectOptions: { postgresql: { options: { nullsNotDistinct: true } } } }),
                                pg('accounts_lower_email_idx', [part({ expression: 'lower(email)' })], { unique: true }),
                                pg('accounts_live_email_idx', [part('email')], { unique: true, partial: true, predicate: '(deleted_at IS NULL)' }),
                                pg('accounts_created_at_idx', [part('created_at', { order: 'desc', nulls: 'last' })], { included: ['status'] }),
                                pg('accounts_status_created_idx', [part('status'), part({ expression: "date_trunc('day', created_at)" })]),
                                pg('accounts_email_pattern_idx', [part('email', { collation: 'C', opclass: 'text_pattern_ops' })]),
                                index(accounts, 'accounts_tags_idx', [part('tags')], { method: 'gin' }),
                                index(accounts, 'accounts_data_idx', [part('data', { opclass: 'jsonb_path_ops' })], { method: 'gin' }),
                                index(accounts, 'accounts_search_idx', [part('search')], { method: 'gin' }),
                            ],
                            constraints: [constraint(accounts, 'unique', 'accounts_email_key', ['email'])],
                        },
                    ),
                    table(
                        invoices,
                        'invoices',
                        [column('id', 'bigint', { autoIncrement: true, default: { kind: 'sequence', value: "nextval('billing.invoices_id_seq'::regclass)" } }), column('account_id', 'bigint'), column('number', 'integer'), column('total', 'numeric(12,2)', { typeName: 'numeric' })],
                        {
                            schema: 'billing',
                            indexes: [
                                primaryIndex(invoices, 'invoices_pkey', ['id'], { method: 'btree' }),
                                index(invoices, 'invoices_account_id_number_key', [part('account_id'), part('number')], { method: 'btree', unique: true, backs: { kind: 'unique_constraint', constraint: `${invoices}:constraint:invoices_account_id_number_key` } }),
                            ],
                            foreignKeys: [foreignKey(invoices, 'invoices_account_id_fkey', ['account_id'], accounts, ['id'], { onDelete: 'CASCADE', onUpdate: 'NO ACTION', deferrable: false, initially: 'IMMEDIATE' })],
                            constraints: [constraint(invoices, 'unique', 'invoices_account_id_number_key', ['account_id', 'number']), constraint(invoices, 'check', 'invoices_total_check', ['total'], '(total >= (0)::numeric)')],
                        },
                    ),
                ],
                {
                    defaultSchema: 'public',
                    coverage: {
                        database: coverage(
                            {
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
                            },
                            ['billing', 'public'],
                        ),
                        declared: null,
                    },
                },
            ),
        ],
    });
}

// MySQL introspection only: prefix lengths, descending parts, functional, full-text, spatial and invisible indexes.
function databaseMysql(): SchemaDocument {
    const products = 'mysql:shop.products';
    const my = (name: string, parts: ReturnType<typeof part>[], options = {}) => index(products, name, parts, { method: 'btree', ...options });
    return document('database', { name: 'contract-fixtures', orm: null }, {
        connections: [
            connection(
                'shop',
                'mysql',
                [
                    table(
                        products,
                        'products',
                        [
                            column('id', 'int unsigned', { typeName: 'int', autoIncrement: true }),
                            column('sku', 'varchar(32)', { typeName: 'varchar' }),
                            column('name', 'varchar(255)', { typeName: 'varchar', comment: 'Display name', collation: 'utf8mb4_0900_ai_ci' }),
                            column('description', 'text', { nullable: true }),
                            column('location', 'point', { nullable: true }),
                            column('status', "enum('draft','live')", { typeName: 'enum', enum: { name: null, values: ['draft', 'live'] }, default: { kind: 'literal', value: "'draft'" } }),
                            column('price', 'decimal(10,2)', { typeName: 'decimal', default: { kind: 'literal', value: '0.00' } }),
                            column('created_at', 'datetime', { default: { kind: 'expression', value: 'CURRENT_TIMESTAMP' } }),
                            column('attributes', 'json', { nullable: true }),
                        ],
                        {
                            indexes: [
                                primaryIndex(products, 'PRIMARY', ['id'], { method: 'btree' }),
                                my('products_sku_unique', [part('sku')], { unique: true }),
                                my('products_name_prefix', [part('name', { length: 10 })]),
                                my('products_status_created', [part('status'), part('created_at', { order: 'desc' })]),
                                my('products_color', [part({ expression: "cast(json_unquote(json_extract(`attributes`,_utf8mb4'$.color')) as char(16))" })]),
                                index(products, 'products_description_fulltext', [part('description')], { method: 'fulltext' }),
                                index(products, 'products_location_spatial', [part('location')], { method: 'spatial' }),
                                my('products_price', [part('price')], { dialectOptions: { mysql: { options: { visible: false } } } }),
                            ],
                        },
                    ),
                ],
                {
                    defaultSchema: 'shop',
                    coverage: {
                        database: coverage(
                            {
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
                                indexPredicates: 'not_applicable',
                                includedColumns: 'not_applicable',
                                uniqueConstraints: 'complete',
                                checkConstraints: 'complete',
                                models: 'not_applicable',
                                relationships: 'not_applicable',
                            },
                            ['shop'],
                        ),
                        declared: null,
                    },
                },
            ),
        ],
    });
}

// SQLite introspection only: an automatic index behind a unique constraint, partial, expression and collated indexes,
// and coverage that admits what PRAGMAs do not report.
function databaseSqlite(): SchemaDocument {
    const notes = 'sqlite:main.notes';
    return document('database', { name: 'contract-fixtures', orm: null }, {
        connections: [
            connection(
                'main',
                'sqlite',
                [
                    table(
                        notes,
                        'notes',
                        [
                            column('id', 'INTEGER', { typeName: 'integer', autoIncrement: true }),
                            column('title', 'TEXT', { typeName: 'text', collation: 'NOCASE' }),
                            column('slug', 'TEXT', { typeName: 'text' }),
                            column('archived', 'INTEGER', { typeName: 'integer', default: { kind: 'literal', value: '0' } }),
                        ],
                        {
                            indexes: [
                                index(notes, 'sqlite_autoindex_notes_1', [part('slug')], { unique: true, backs: { kind: 'unique_constraint', constraint: `${notes}:constraint:notes_slug` } }),
                                index(notes, 'notes_active_title', [part('title')], { partial: true, predicate: 'archived = 0' }),
                                index(notes, 'notes_lower_title', [part({ expression: 'lower(title)' })]),
                                index(notes, 'notes_title_nocase', [part('title', { collation: 'NOCASE', order: 'desc' })]),
                            ],
                            constraints: [constraint(notes, 'unique', 'notes_slug', ['slug']), constraint(notes, 'check', 'notes_archived_flag', ['archived'], 'archived IN (0, 1)')],
                        },
                    ),
                ],
                {
                    coverage: {
                        database: coverage({
                            tables: 'complete',
                            columns: 'complete',
                            columnTypes: 'complete',
                            defaults: 'complete',
                            comments: 'not_applicable',
                            primaryKeys: 'complete',
                            foreignKeys: 'complete',
                            referentialActions: 'complete',
                            indexes: 'complete',
                            indexExpressions: 'complete',
                            indexPredicates: 'complete',
                            includedColumns: 'not_applicable',
                            uniqueConstraints: 'complete',
                            checkConstraints: 'partial',
                            models: 'not_applicable',
                            relationships: 'not_applicable',
                        }),
                        declared: null,
                    },
                },
            ),
        ],
        diagnostics: [
            diagnostic('unsupported_metadata', 'inspection', { type: 'connection', id: 'connection:main', label: 'main' }, 'Check constraints were read from the table SQL; unnamed checks get generated names.', { severity: 'info' }),
        ],
    });
}

// Combined mode where the database and the ORM disagree: drift on a column and an index, a declared-only column and
// foreign key, a database-only table and column, a model without a table, and partial inspection.
function combinedDrift(): SchemaDocument {
    const users = 'table:default.users';
    const audit = 'table:default.audit_log';
    const teams = 'table:default.teams';
    const declaredFk = foreignKey(users, 'fk_users_team', ['team_id'], teams, ['id'], { provenance: declared, onDelete: 'SET NULL' });
    const emailIndex = index(users, 'ix_users_email', [part('email')], {
        provenance: both,
        unique: true,
        drift: [{ field: 'unique', database: true, declared: false }],
    });
    return document('combined', { name: 'python-schema-viewer', orm: 'sqlalchemy' }, {
        connections: [
            connection(
                'default',
                'postgresql',
                [
                    table(
                        users,
                        'users',
                        [
                            column('id', 'integer', { provenance: both, autoIncrement: true }),
                            column('email', 'character varying(320)', { typeName: 'varchar', provenance: both, drift: [{ field: 'type', database: 'character varying(320)', declared: 'VARCHAR(255)' }] }),
                            column('team_id', 'integer', { provenance: both, nullable: true }),
                            column('nickname', 'VARCHAR(40)', { typeName: 'varchar', provenance: declared, nullable: true }),
                            column('legacy_flag', 'boolean', { nullable: true }),
                        ],
                        { provenance: both, schema: 'public', indexes: [primaryIndex(users, 'users_pkey', ['id'], { provenance: both }), emailIndex], foreignKeys: [declaredFk] },
                    ),
                    table(teams, 'teams', [column('id', 'integer', { provenance: both, autoIncrement: true })], { provenance: both, schema: 'public', indexes: [primaryIndex(teams, 'teams_pkey', ['id'], { provenance: both })] }),
                    table(audit, 'audit_log', [column('id', 'bigint', { autoIncrement: true }), column('payload', 'jsonb')], { schema: 'public', indexes: [primaryIndex(audit, 'audit_log_pkey', ['id'])] }),
                ],
                {
                    defaultSchema: 'public',
                    coverage: {
                        database: coverage(
                            {
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
                                checkConstraints: 'unavailable',
                                models: 'not_applicable',
                                relationships: 'not_applicable',
                            },
                            ['public'],
                        ),
                        declared: coverage({ tables: 'complete', columns: 'complete', foreignKeys: 'complete', indexes: 'complete', models: 'complete', relationships: 'complete' }),
                    },
                },
            ),
        ],
        models: [
            model('model:app.models.User', 'app.models.User', [users]),
            model('model:app.models.Team', 'app.models.Team', [teams]),
            model('model:app.models.Ghost', 'app.models.Ghost', [], { primaryKey: [] }),
        ],
        relationships: [
            relationship('relationship:app.models.User.team', 'team', {
                model: 'model:app.models.User',
                table: users,
                relatedModel: 'model:app.models.Team',
                relatedTable: teams,
                type: 'MANYTOONE',
                cardinality: 'many-to-one',
                keys: { from: { table: users, columns: ['team_id'] }, to: { table: teams, columns: ['id'] } },
            }),
        ],
        diagnostics: [
            diagnostic('column_drift', 'drift', { type: 'column', id: users, columns: ['email'], label: 'users.email' }, 'The database stores users.email as character varying(320); the model declares VARCHAR(255).'),
            diagnostic('index_drift', 'drift', { type: 'index', id: emailIndex.id, label: 'ix_users_email' }, 'ix_users_email is unique in the database but not in the model.'),
            diagnostic('declared_only', 'reconciliation', { type: 'column', id: users, columns: ['nickname'], label: 'users.nickname' }, 'The model declares users.nickname; the database has no such column.'),
            diagnostic('declared_only', 'reconciliation', { type: 'foreignKey', id: declaredFk.id, label: 'fk_users_team' }, 'The model declares a foreign key on users.team_id; the database does not enforce one.'),
            diagnostic('database_only', 'reconciliation', { type: 'column', id: users, columns: ['legacy_flag'], label: 'users.legacy_flag' }, 'The database has users.legacy_flag; the model does not declare it.', { severity: 'info' }),
            diagnostic('table_without_model', 'reconciliation', { type: 'table', id: audit, label: 'audit_log' }, 'No model maps public.audit_log.', { severity: 'info' }),
            diagnostic('model_without_table', 'reconciliation', { type: 'model', id: 'model:app.models.Ghost', label: 'Ghost' }, 'app.models.Ghost declares table ghosts, which the database does not have.'),
            diagnostic('inspection_unavailable', 'inspection', { type: 'connection', id: 'connection:default', label: 'default' }, 'Check constraints could not be read: the inspection role lacks access to pg_constraint.', { severity: 'warning' }),
        ],
    });
}

// Three connections with different drivers, as Laravel Schema Viewer reads them: PostgreSQL for the application,
// MySQL for analytics and SQLite for a session cache. users exists in two connections; foreign keys stay inside their
// connection, while ORM relationships cross connections with no constraint. Only the app connection has drift.
function combinedMultiConnection(): SchemaDocument {
    const appUsers = 'app:public.users';
    const teams = 'app:public.teams';
    const visitors = 'analytics:users';
    const events = 'analytics:events';
    const sessions = 'cache:sessions';
    const M = (name: string) => `App\\Models\\${name}`;
    const R = (owner: string, name: string) => `App\\Models\\${owner}::${name}`;
    const big = (name: string, options = {}) => column(name, 'bigint', { typeName: 'bigint', ...options });
    const ep = (table: string, column: string) => ({ table, columns: [column] });
    const rel = (owner: string, name: string, table: string, type: string, cardinality: 'one-to-many' | 'many-to-one', related: [string, string], from: [string, string], to: [string, string], options = {}) =>
        relationship(R(owner, name), name, {
            model: M(owner),
            table,
            relatedModel: M(related[0]),
            relatedTable: related[1],
            type,
            cardinality,
            keys: { from: ep(...from), to: ep(...to) },
            source: { file: `app/Models/${owner.replace('\\', '/')}.php`, line: 18 },
            ...options,
        });
    const full = (schemas: string[] | null, extra: Coverage['features'] = {}) =>
        coverage(
            {
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
                indexPredicates: 'not_applicable',
                includedColumns: 'not_applicable',
                uniqueConstraints: 'complete',
                checkConstraints: 'not_applicable',
                models: 'not_applicable',
                relationships: 'not_applicable',
                ...extra,
            },
            schemas,
        );
    const declaredCoverage = coverage({ tables: 'not_applicable', models: 'complete', relationships: 'complete' });
    const teamFk = foreignKey(appUsers, 'users_team_id_foreign', ['team_id'], teams, ['id'], { onDelete: 'SET NULL' });
    const visitorFk = foreignKey(events, 'events_user_id_foreign', ['user_id'], visitors, ['id'], { onDelete: 'CASCADE' });

    return document('combined', { name: 'laravel-schema-viewer', orm: 'eloquent' }, {
        note: 'Synthetic application with three database connections.',
        connections: [
            connection(
                'app',
                'postgresql',
                [
                    table(
                        appUsers,
                        'users',
                        [
                            big('id', { autoIncrement: true }),
                            big('team_id', { nullable: true }),
                            column('email', 'character varying(320)', { typeName: 'varchar', provenance: both, drift: [{ field: 'type', database: 'character varying(320)', declared: 'string' }] }),
                        ],
                        { schema: 'public', indexes: [primaryIndex(appUsers, 'users_pkey', ['id'])], foreignKeys: [teamFk] },
                    ),
                    table(teams, 'teams', [big('id', { autoIncrement: true }), column('name', 'character varying(255)', { typeName: 'varchar' })], { schema: 'public', indexes: [primaryIndex(teams, 'teams_pkey', ['id'])] }),
                ],
                { defaultSchema: 'public', coverage: { database: full(['public']), declared: declaredCoverage } },
            ),
            connection(
                'analytics',
                'mysql',
                [
                    table(visitors, 'users', [big('id', { autoIncrement: true }), big('app_user_id', { nullable: true }), column('segment', 'varchar(40)', { typeName: 'varchar' })], {
                        comment: 'Visitors, signed in or not',
                        indexes: [primaryIndex(visitors, 'PRIMARY', ['id'], { method: 'btree' })],
                    }),
                    table(events, 'events', [big('id', { autoIncrement: true }), big('user_id'), column('name', 'varchar(80)', { typeName: 'varchar' })], {
                        indexes: [primaryIndex(events, 'PRIMARY', ['id'], { method: 'btree' }), index(events, 'events_user_id_index', [part('user_id')], { method: 'btree' })],
                        foreignKeys: [visitorFk],
                    }),
                ],
                { defaultSchema: 'analytics', coverage: { database: full(['analytics'], { indexExpressions: 'partial', checkConstraints: 'unavailable' }), declared: declaredCoverage } },
            ),
            connection(
                'cache',
                'sqlite',
                [table(sessions, 'sessions', [column('id', 'varchar'), big('user_id', { nullable: true }), column('payload', 'text')], { primaryKey: ['id'], indexes: [index(sessions, 'sessions_user_id_index', [part('user_id')])] })],
                { coverage: { database: full(null, { comments: 'not_applicable' }), declared: declaredCoverage } },
            ),
        ],
        models: [
            model(M('User'), M('User'), [appUsers], { source: { file: 'app/Models/User.php', line: 9 } }),
            model(M('Team'), M('Team'), [teams], { source: { file: 'app/Models/Team.php', line: 9 } }),
            model(M('Analytics\\Visitor'), M('Analytics\\Visitor'), [visitors], { source: { file: 'app/Models/Analytics/Visitor.php', line: 9 }, extensions: { eloquent: { connection: 'analytics' } } }),
            model(M('Analytics\\Event'), M('Analytics\\Event'), [events], { source: { file: 'app/Models/Analytics/Event.php', line: 9 }, extensions: { eloquent: { connection: 'analytics' } } }),
            model(M('Session'), M('Session'), [sessions], { primaryKey: ['id'], source: { file: 'app/Models/Session.php', line: 9 }, extensions: { eloquent: { connection: 'cache', keyType: 'string' } } }),
        ],
        relationships: [
            rel('User', 'team', appUsers, 'BelongsTo', 'many-to-one', ['Team', teams], [appUsers, 'team_id'], [teams, 'id']),
            rel('User', 'sessions', appUsers, 'HasMany', 'one-to-many', ['Session', sessions], [sessions, 'user_id'], [appUsers, 'id'], { inverse: R('Session', 'user'), note: 'Lives in the cache connection; no foreign key is possible.' }),
            rel('Session', 'user', sessions, 'BelongsTo', 'many-to-one', ['User', appUsers], [sessions, 'user_id'], [appUsers, 'id'], { inverse: R('User', 'sessions') }),
            rel('Analytics\\Visitor', 'account', visitors, 'BelongsTo', 'many-to-one', ['User', appUsers], [visitors, 'app_user_id'], [appUsers, 'id']),
            rel('Analytics\\Event', 'visitor', events, 'BelongsTo', 'many-to-one', ['Analytics\\Visitor', visitors], [events, 'user_id'], [visitors, 'id']),
        ],
        diagnostics: [
            diagnostic('column_drift', 'drift', { type: 'column', id: appUsers, columns: ['email'], label: 'app · public.users.email' }, 'The database stores public.users.email as character varying(320); the model casts it as string.', { severity: 'info' }),
            diagnostic('relationship_without_foreign_key', 'lint', { type: 'relationship', id: R('Session', 'user'), columns: ['user_id'], label: 'cache · sessions.user_id' }, 'Session::user joins cache sessions.user_id to app public.users.id across connections; no foreign key can enforce it.', { severity: 'info' }),
            diagnostic('unsupported_metadata', 'inspection', { type: 'connection', id: 'connection:analytics', label: 'analytics' }, 'MySQL reports functional index key parts without their expressions.', { severity: 'info' }),
        ],
    });
}

// Declared ORM metadata across two SQLAlchemy binds with different dialects: users in both, a foreign key inside the
// reporting bind, and a relationship from it to the default bind with no constraint.
function declaredMultiConnection(): SchemaDocument {
    const users = 'table:default.public.users';
    const reportUsers = 'table:reporting.users';
    const reports = 'table:reporting.reports';
    const M = (name: string) => `model:app.models.${name}`;
    const all = coverage({ tables: 'complete', columns: 'complete', columnTypes: 'complete', primaryKeys: 'complete', foreignKeys: 'complete', models: 'complete', relationships: 'complete' });
    const fk = foreignKey(reports, 'fk_reports_owner', ['owner_id'], reportUsers, ['id'], { ...d(), onDelete: 'CASCADE' });
    return document('declared', { name: 'python-schema-viewer', orm: 'sqlalchemy' }, {
        connections: [
            connection('default', 'postgresql', [table(users, 'users', [column('id', 'INTEGER', d()), column('email', 'VARCHAR(255)', d())], { ...d(), schema: 'public' })], { defaultSchema: 'public', coverage: { database: null, declared: all } }),
            connection(
                'reporting',
                'mysql',
                [
                    table(reportUsers, 'users', [column('id', 'INTEGER', d()), column('display_name', 'VARCHAR(80)', d())], d()),
                    table(reports, 'reports', [column('id', 'INTEGER', d()), column('owner_id', 'INTEGER', d()), column('requested_by', 'INTEGER', { ...d(), nullable: true })], { ...d(), foreignKeys: [fk] }),
                ],
                { coverage: { database: null, declared: all } },
            ),
        ],
        models: [model(M('User'), 'app.models.User', [users]), model(M('ReportUser'), 'app.models.reporting.ReportUser', [reportUsers]), model(M('Report'), 'app.models.reporting.Report', [reports])],
        relationships: [
            relationship('relationship:app.models.Report.owner', 'owner', {
                model: M('Report'),
                table: reports,
                relatedModel: M('ReportUser'),
                relatedTable: reportUsers,
                type: 'MANYTOONE',
                cardinality: 'many-to-one',
                keys: { from: { table: reports, columns: ['owner_id'] }, to: { table: reportUsers, columns: ['id'] } },
            }),
            relationship('relationship:app.models.Report.requester', 'requester', {
                model: M('Report'),
                table: reports,
                relatedModel: M('User'),
                relatedTable: users,
                type: 'MANYTOONE',
                cardinality: 'many-to-one',
                keys: { from: { table: reports, columns: ['requested_by'] }, to: { table: users, columns: ['id'] } },
                note: 'Joined in Python across binds; the databases do not know about it.',
            }),
        ],
    });
}

export const VALID: Record<string, () => SchemaDocument> = {
    'declared-sqlalchemy': declaredSqlalchemy,
    'combined-eloquent': combinedEloquent,
    'database-postgresql-indexes': databasePostgresql,
    'database-mysql-indexes': databaseMysql,
    'database-sqlite-indexes': databaseSqlite,
    'combined-drift': combinedDrift,
    'combined-multi-connection': combinedMultiConnection,
    'declared-multi-connection': declaredMultiConnection,
};
