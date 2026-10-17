import { derivedLinkId, linkId } from '../../src/contract/graph';
import type { Connection, DerivedLink, Link, Relationship } from '../../src/contract/types';
import { column, connection, foreignKey, relationship, table } from './builders';

// Graph conformance cases, written to contract/conformance/graph/<name>.json as { description, input, expected }.
// The expected links are written out by hand, not produced by the builder, so they check it. Link ids follow the
// contract's id rule; tests check that rule against an independent SHA-256.

export type GraphCase = { description: string; input: { connections: Connection[]; relationships: Relationship[] }; expected: { links: Link[]; derivedLinks: DerivedLink[] } };

const T = (name: string) => `t:${name}`;
const ids = (...names: string[]) => names.map((n) => column(n, 'integer'));
const conn = (...tables: ReturnType<typeof table>[]) => [connection('c', 'pgsql', tables, { coverage: { database: null, declared: null } })];
const rel = (id: string, options: Partial<Relationship> & Pick<Relationship, 'table' | 'cardinality'>) => relationship(id, id, { model: 'm', type: 'test', ...options });
const ep = (t: string, ...columns: string[]) => ({ table: T(t), columns });
const link = (from: { table: string; columns: string[] }, to: { table: string; columns: string[] }, rest: Partial<Link>, pairs: [string, string][]): Link => ({
    id: linkId(from.table, to.table, pairs),
    from,
    to,
    foreignKey: null,
    relationships: [],
    state: 'relationship',
    polymorphic: false,
    note: null,
    ...rest,
});

const users = table(T('users'), 'users', ids('id', 'team_id'));
const teams = table(T('teams'), 'teams', ids('id'));
const userTeamFk = foreignKey(T('users'), 'users_team_fk', ['team_id'], T('teams'), ['id']);

export const GRAPH_CASES: Record<string, GraphCase> = {
    'foreign-key-only': {
        description: 'A foreign key with no relationship is a foreign_key link',
        input: { connections: conn({ ...users, foreignKeys: [userTeamFk] }, teams), relationships: [] },
        expected: { links: [link(ep('users', 'team_id'), ep('teams', 'id'), { foreignKey: userTeamFk.id, state: 'foreign_key' }, [['team_id', 'id']])], derivedLinks: [] },
    },
    'relationship-only': {
        description: 'A relationship with no foreign key is a relationship link; no constraint is implied',
        input: {
            connections: conn(users, teams),
            relationships: [rel('r:team', { table: T('users'), relatedTable: T('teams'), cardinality: 'many-to-one', keys: { from: ep('users', 'team_id'), to: ep('teams', 'id') } })],
        },
        expected: { links: [link(ep('users', 'team_id'), ep('teams', 'id'), { relationships: ['r:team'] }, [['team_id', 'id']])], derivedLinks: [] },
    },
    'foreign-key-and-relationships': {
        description: 'A foreign key and both sides of a relationship on its columns are one link in state both',
        input: {
            connections: conn({ ...users, foreignKeys: [userTeamFk] }, teams),
            relationships: [
                rel('r:users', { table: T('teams'), relatedTable: T('users'), cardinality: 'one-to-many', keys: { from: ep('users', 'team_id'), to: ep('teams', 'id') } }),
                rel('r:team', { table: T('users'), relatedTable: T('teams'), cardinality: 'many-to-one', keys: { from: ep('users', 'team_id'), to: ep('teams', 'id') } }),
            ],
        },
        expected: { links: [link(ep('users', 'team_id'), ep('teams', 'id'), { foreignKey: userTeamFk.id, relationships: ['r:team', 'r:users'], state: 'both' }, [['team_id', 'id']])], derivedLinks: [] },
    },
    'composite-unordered-pairs': {
        description: 'Composite keys match as unordered column pairs; the link keeps the foreign key column order',
        input: {
            connections: conn(
                { ...table(T('lines'), 'lines', ids('sku', 'region')), foreignKeys: [foreignKey(T('lines'), 'lines_product_fk', ['sku', 'region'], T('products'), ['sku', 'region'])] },
                table(T('products'), 'products', ids('sku', 'region'), { primaryKey: ['sku', 'region'] }),
            ),
            relationships: [rel('r:product', { table: T('lines'), relatedTable: T('products'), cardinality: 'many-to-one', keys: { from: ep('lines', 'region', 'sku'), to: ep('products', 'region', 'sku') } })],
        },
        expected: {
            links: [
                link(ep('lines', 'sku', 'region'), ep('products', 'sku', 'region'), { foreignKey: 't:lines:fk:lines_product_fk', relationships: ['r:product'], state: 'both' }, [
                    ['region', 'region'],
                    ['sku', 'sku'],
                ]),
            ],
            derivedLinks: [],
        },
    },
    'multiple-between-tables': {
        description: 'Two foreign keys between the same tables are two links',
        input: {
            connections: conn(
                {
                    ...table(T('posts'), 'posts', ids('id', 'author_id', 'editor_id')),
                    foreignKeys: [foreignKey(T('posts'), 'posts_author_fk', ['author_id'], T('users'), ['id']), foreignKey(T('posts'), 'posts_editor_fk', ['editor_id'], T('users'), ['id'])],
                },
                table(T('users'), 'users', ids('id')),
            ),
            relationships: [],
        },
        expected: {
            links: [
                link(ep('posts', 'author_id'), ep('users', 'id'), { foreignKey: 't:posts:fk:posts_author_fk', state: 'foreign_key' }, [['author_id', 'id']]),
                link(ep('posts', 'editor_id'), ep('users', 'id'), { foreignKey: 't:posts:fk:posts_editor_fk', state: 'foreign_key' }, [['editor_id', 'id']]),
            ].sort((a, b) => (a.id < b.id ? -1 : 1)),
            derivedLinks: [],
        },
    },
    'self-reference': {
        description: 'A table referencing itself',
        input: {
            connections: conn({ ...table(T('nodes'), 'nodes', ids('id', 'parent_id')), foreignKeys: [foreignKey(T('nodes'), 'nodes_parent_fk', ['parent_id'], T('nodes'), ['id'])] }),
            relationships: [rel('r:parent', { table: T('nodes'), relatedTable: T('nodes'), cardinality: 'many-to-one', keys: { from: ep('nodes', 'parent_id'), to: ep('nodes', 'id') } })],
        },
        expected: { links: [link(ep('nodes', 'parent_id'), ep('nodes', 'id'), { foreignKey: 't:nodes:fk:nodes_parent_fk', relationships: ['r:parent'], state: 'both' }, [['parent_id', 'id']])], derivedLinks: [] },
    },
    'pivot': {
        description: 'A many-to-many relationship is two links from the pivot table, each joining a pivot foreign key',
        input: {
            connections: conn(
                table(T('users'), 'users', ids('id')),
                table(T('roles'), 'roles', ids('id')),
                {
                    ...table(T('role_user'), 'role_user', ids('user_id', 'role_id'), { primaryKey: ['user_id', 'role_id'] }),
                    foreignKeys: [foreignKey(T('role_user'), 'role_user_user_fk', ['user_id'], T('users'), ['id'])],
                },
            ),
            relationships: [
                rel('r:roles', {
                    table: T('users'),
                    relatedTable: T('roles'),
                    cardinality: 'many-to-many',
                    pivot: { table: T('role_user'), parentColumns: ['id'], parentPivotColumns: ['user_id'], relatedColumns: ['id'], relatedPivotColumns: ['role_id'], columns: [] },
                }),
            ],
        },
        expected: {
            links: [
                link(ep('role_user', 'user_id'), ep('users', 'id'), { foreignKey: 't:role_user:fk:role_user_user_fk', relationships: ['r:roles'], state: 'both' }, [['user_id', 'id']]),
                link(ep('role_user', 'role_id'), ep('roles', 'id'), { relationships: ['r:roles'] }, [['role_id', 'id']]),
            ].sort((a, b) => (a.id < b.id ? -1 : 1)),
            derivedLinks: [],
        },
    },
    'polymorphic': {
        description: 'A polymorphic relationship with keys is a polymorphic link; one with no single target has none',
        input: {
            connections: conn(table(T('posts'), 'posts', ids('id')), table(T('comments'), 'comments', [...ids('id', 'commentable_id'), column('commentable_type', 'text')])),
            relationships: [
                rel('r:comments', {
                    table: T('posts'),
                    relatedTable: T('comments'),
                    cardinality: 'one-to-many',
                    keys: { from: ep('comments', 'commentable_id'), to: ep('posts', 'id') },
                    polymorphic: { typeColumn: 'commentable_type', idColumn: 'commentable_id', typeValue: 'Post' },
                }),
                rel('r:commentable', { table: T('comments'), cardinality: 'many-to-one', polymorphic: { typeColumn: 'commentable_type', idColumn: 'commentable_id', typeValue: null } }),
            ],
        },
        expected: { links: [link(ep('comments', 'commentable_id'), ep('posts', 'id'), { relationships: ['r:comments'], polymorphic: true }, [['commentable_id', 'id']])], derivedLinks: [] },
    },
    'through': {
        description: 'A through relationship is a derived link and never matched to a foreign key',
        input: {
            connections: conn(table(T('countries'), 'countries', ids('id')), table(T('users'), 'users', ids('id', 'country_id')), table(T('posts'), 'posts', ids('id', 'user_id'))),
            relationships: [rel('r:posts', { table: T('countries'), relatedTable: T('posts'), cardinality: 'one-to-many', through: [T('users')] })],
        },
        expected: { links: [], derivedLinks: [{ id: derivedLinkId('r:posts'), from: T('countries'), to: T('posts'), via: [T('users')], relationship: 'r:posts' }] },
    },
    'unresolved-endpoint': {
        description: 'A foreign key or relationship to a table or column outside the document has no link',
        input: {
            connections: conn({ ...users, foreignKeys: [foreignKey(T('users'), 'users_org_fk', ['team_id'], T('orgs'), ['id']), foreignKey(T('users'), 'users_team_code_fk', ['team_id'], T('teams'), ['code'])] }, teams),
            relationships: [rel('r:org', { table: T('users'), cardinality: 'many-to-one', keys: { from: ep('users', 'team_id'), to: ep('orgs', 'id') } })],
        },
        expected: { links: [], derivedLinks: [] },
    },
    'duplicate-foreign-keys': {
        description: 'Two constraints on the same columns are one link, standing for the smallest id',
        input: {
            connections: conn({ ...users, foreignKeys: [foreignKey(T('users'), 'z_fk', ['team_id'], T('teams'), ['id']), foreignKey(T('users'), 'a_fk', ['team_id'], T('teams'), ['id'])] }, teams),
            relationships: [],
        },
        expected: { links: [link(ep('users', 'team_id'), ep('teams', 'id'), { foreignKey: 't:users:fk:a_fk', state: 'foreign_key' }, [['team_id', 'id']])], derivedLinks: [] },
    },
    'link-note': {
        description: "A link's note is the note of its first relationship, by id, that has one",
        input: {
            connections: conn(users, teams),
            relationships: [
                rel('r:b', { table: T('users'), relatedTable: T('teams'), cardinality: 'many-to-one', keys: { from: ep('users', 'team_id'), to: ep('teams', 'id') }, note: 'second' }),
                rel('r:a', { table: T('teams'), relatedTable: T('users'), cardinality: 'one-to-many', keys: { from: ep('users', 'team_id'), to: ep('teams', 'id') }, note: 'first' }),
            ],
        },
        expected: { links: [link(ep('users', 'team_id'), ep('teams', 'id'), { relationships: ['r:a', 'r:b'], note: 'first' }, [['team_id', 'id']])], derivedLinks: [] },
    },
};
