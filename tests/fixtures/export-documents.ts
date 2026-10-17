import type { Coverage, SchemaDocument } from '../../src/contract/types';
import { column, connection, constraint, coverage, document, foreignKey, index, part, primaryIndex, table } from './builders';

// Synthetic documents for the exporters' tests, beside the contract's valid fixtures. Every name is invented.

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

// The input of Laranex Laravel Schema Viewer's own exporter examples (parity/examples/laravel-schema-mysql.*), in the
// 2.0 contract: the table ids keep Laravel's table order, the expression index has its expression text, and the
// partial index has no reported predicate, as Laravel reads them.
function laravelParity(): SchemaDocument {
    const users = 't1:users';
    const profiles = 't2:profiles';
    const roleUser = 't3:role_user';
    const jobs = 't4:jobs';
    const big = (name: string, options = {}) => column(name, 'bigint unsigned', { typeName: 'bigint', ...options });
    return document('database', { name: 'laravel-schema-viewer', orm: null }, {
        note: 'Project note.',
        connections: [
            connection(
                'mysql',
                'mysql',
                [
                    table(
                        users,
                        'users',
                        [big('id', { autoIncrement: true }), column('email', 'varchar(255)', { note: 'Login name' }), column('status', 'varchar(20)', { default: { kind: 'literal', value: "'active'" } })],
                        {
                            comment: 'People who sign in',
                            note: 'Accounts table.',
                            indexes: [
                                primaryIndex(users, 'primary', ['id']),
                                index(users, 'users_email_unique', [part('email')], { unique: true }),
                                index(users, 'users_lower_email_index', [part({ expression: 'lower(email)' })], { method: 'btree' }),
                                index(users, 'users_active_partial', [part('status')], { partial: true }),
                            ],
                        },
                    ),
                    table(profiles, 'profiles', [big('id', { autoIncrement: true }), big('user_id')], {
                        indexes: [primaryIndex(profiles, 'primary', ['id']), index(profiles, 'profiles_user_id_unique', [part('user_id')], { unique: true })],
                        foreignKeys: [foreignKey(profiles, 'profiles_user_id_foreign', ['user_id'], users, ['id'], { onUpdate: 'NO ACTION', onDelete: 'CASCADE' })],
                    }),
                    table(roleUser, 'role_user', [big('user_id'), big('role_id'), column('meta data', 'json', { nullable: true, comment: 'Has a | pipe' })], {
                        primaryKey: ['user_id', 'role_id'],
                        indexes: [primaryIndex(roleUser, 'primary', ['user_id', 'role_id']), index(roleUser, 'role_user_role_id_index', [part('role_id')])],
                        foreignKeys: [foreignKey(roleUser, 'role_user_user_id_foreign', ['user_id'], users, ['id'], { onUpdate: 'CASCADE', onDelete: 'CASCADE' })],
                    }),
                    table(jobs, 'jobs', [column('id', 'integer', { autoIncrement: true })], { owner: { kind: 'framework', package: null }, indexes: [primaryIndex(jobs, 'primary', ['id'])] }),
                ],
                { coverage: { database: coverage(FULL), declared: null } },
            ),
        ],
    });
}

// Names and text that every format must escape or report, and constructs a format cannot state.
function exportEdgeCases(): SchemaDocument {
    const parents = 'edge:parents';
    const children = 'edge:children';
    const odd = 'edge:odd';
    return document('database', { name: 'contract-fixtures', orm: null }, {
        note: "A note with 'quotes', a back\\slash\nand a line break.",
        connections: [
            connection(
                'edge cases',
                'postgresql',
                [
                    table(parents, 'parents', [column('id', 'integer', { autoIncrement: true }), column('code_a', 'char(2)'), column('code_b', 'char(2)'), column('ratio', 'numeric(5,2)', { typeName: 'numeric', nullable: true })], {
                        schema: 'public',
                        indexes: [primaryIndex(parents, 'parents_pkey', ['id'], { method: 'btree' })],
                        constraints: [constraint(parents, 'unique', 'parents_codes_key', ['code_a', 'code_b']), constraint(parents, 'check', 'parents_ratio_check', ['ratio'], '(ratio >= 0)'), constraint(parents, 'check', 'parents_opaque_check', [])],
                    }),
                    table(
                        children,
                        'children',
                        [column('id', 'integer', { autoIncrement: true }), column('parent_a', 'char(2)', { nullable: true }), column('parent_b', 'char(2)', { nullable: true }), column('parent_id', 'integer'), column('sibling_id', 'integer', { nullable: true })],
                        {
                            schema: 'public',
                            indexes: [primaryIndex(children, 'children_pkey', ['id'], { method: 'btree' }), index(children, 'children_parent_id_key', [part('parent_id')], { method: 'btree', unique: true })],
                            foreignKeys: [
                                foreignKey(children, 'children_parent_codes_fkey', ['parent_a', 'parent_b'], parents, ['code_a', 'code_b'], { onDelete: 'SET NULL', onUpdate: 'RESTRICT' }),
                                foreignKey(children, 'children_parent_id_fkey', ['parent_id'], parents, ['id'], { onDelete: 'CASCADE', deferrable: true, initially: 'DEFERRED' }),
                                foreignKey(children, 'children_parent_id_fkey2', ['parent_id'], parents, ['id'], { onDelete: 'CASCADE' }),
                                foreignKey(children, 'children_sibling_fkey', ['sibling_id'], children, ['id']),
                            ],
                        },
                    ),
                    table(
                        odd,
                        'order "items" <b>',
                        [
                            column('id', 'bigint', { autoIncrement: true, default: { kind: 'identity', value: 'GENERATED BY DEFAULT AS IDENTITY' } }),
                            column('na|me', 'character varying(80)', { typeName: 'varchar', comment: 'Pipe | and <script>alert(1)</script>\nsecond line', note: "It's a `note` with \\ backslash" }),
                            column('back`tick', 'text', { nullable: true, default: { kind: 'expression', value: "concat('a', `b`)" } }),
                            column('2fa_secret', 'text', { nullable: true, collation: 'C' }),
                            column('state', 'item_state', { typeName: 'enum', enum: { name: 'item_state', values: ['new', 'it"s done'] }, default: { kind: 'literal', value: "'new'::item_state" } }),
                            column('total', 'numeric(12,2)', { typeName: 'numeric', generated: { kind: 'stored', expression: 'price * quantity' }, nullable: true }),
                            column('price', 'numeric(10,2)', { typeName: 'numeric' }),
                            column('quantity', 'integer'),
                            column('title', 'text'),
                        ],
                        {
                            schema: 'my schema',
                            comment: 'Table | with <html> & `code`',
                            indexes: [
                                primaryIndex(odd, 'odd_pkey', ['id'], { method: 'btree' }),
                                index(odd, 'odd_title_prefix_idx', [part('title', { length: 10, order: 'desc', nulls: 'last', collation: 'C', opclass: 'text_pattern_ops' })], { method: 'btree' }),
                                index(odd, 'odd_title_hash_idx', [part('title')], { method: 'hash' }),
                                index(odd, 'odd_title_gin_idx', [part('title')], { method: 'gin' }),
                                index(odd, 'odd_live_title_idx', [part('title')], { method: 'btree', unique: true, partial: true, predicate: '(quantity > 0)', included: ['price'] }),
                                index(odd, 'odd_opaque_idx', [], { method: 'btree', expression: true }),
                                index(odd, 'odd_mixed_idx', [part('quantity'), part({ expression: 'lower(title)' })], { method: 'btree', dialectOptions: { postgresql: { options: { fillfactor: 70 } } } }),
                            ],
                        },
                    ),
                ],
                { defaultSchema: 'public', coverage: { database: coverage({ ...FULL, indexPredicates: 'partial' }, ['my schema', 'public']), declared: null } },
            ),
        ],
    });
}

export const EXPORT_DOCUMENTS: Record<string, () => SchemaDocument> = {
    'export-laravel-parity': laravelParity,
    'export-edge-cases': exportEdgeCases,
};
