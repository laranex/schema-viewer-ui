import { buildGraph, linkId } from '../../src/contract/graph';
import { inferredAssociationId } from '../../src/contract/ids';
import type { Connection, InferenceEvidence, InferredAssociation, Link, Model, Provenance, Relationship, SourceMode, Table } from '../../src/contract/types';
import { column, connection, constraint, foreignKey, index, model, part, relationship, table } from './builders';

// Inference conformance cases, written to contract/conformance/inference/<name>.json as
// { description, input: { source, connections, models, relationships, links }, expected: { inferredAssociations } }.
// The input carries its links (from the shared graph builder); the expected inferences are written out by hand.

export type InferenceCase = {
    description: string;
    input: { source: SourceMode; connections: Connection[]; models: Model[]; relationships: Relationship[]; links: Link[] };
    expected: { inferredAssociations: InferredAssociation[] };
};

const T = (name: string) => `t:${name}`;
const M = (name: string) => `m:${name}`;
const t = (name: string, columns: string[], options: Partial<Table> = {}) => table(T(name), name, columns.map((c) => column(c, 'integer')), { primaryKey: columns.includes('id') ? ['id'] : [], ...options });
const fk = (from: string, name: string, columns: string[], to: string, foreignColumns = ['id'], provenance: Provenance = ['database']) => foreignKey(T(from), name, columns, T(to), foreignColumns, { provenance });
const fkId = (from: string, name: string) => `${T(from)}:fk:${name}`;
const m = (name: string, tableName: string) => model(M(name), name, [T(tableName)]);
const L = (from: string, to: string, pairs: [string, string][]) => linkId(T(from), T(to), pairs);
const E = (kind: InferenceEvidence['kind'], id: string, confirmed = true): InferenceEvidence => ({ kind, id, confirmed });

function make(description: string, tables: Table[], models: Model[], expected: InferredAssociation[], options: { relationships?: Relationship[]; source?: SourceMode } = {}): InferenceCase {
    const connections = [connection('c', 'postgresql', tables, { coverage: { database: null, declared: null } })];
    const relationships = options.relationships ?? [];
    return { description, input: { source: options.source ?? 'combined', connections, models, relationships, links: buildGraph({ connections, relationships }).links }, expected: { inferredAssociations: expected } };
}

function a(kind: InferredAssociation['kind'], parts: Omit<InferredAssociation, 'id' | 'kind'>): InferredAssociation {
    return { id: inferredAssociationId(kind, parts.foreignKeys, parts.via), kind, ...parts };
}

const users = t('users', ['id']);
const posts = (extra: Partial<Table> = {}) => t('posts', ['id', 'user_id'], { foreignKeys: [fk('posts', 'posts_user_fk', ['user_id'], 'users')], ...extra });
const manyToOne = a('foreign_key', {
    model: M('Post'),
    relatedModel: M('User'),
    table: T('posts'),
    relatedTable: T('users'),
    via: null,
    cardinality: 'many-to-one',
    foreignKeys: [fkId('posts', 'posts_user_fk')],
    links: [L('posts', 'users', [['user_id', 'id']])],
    confidence: 'high',
    evidence: [E('foreign_key', fkId('posts', 'posts_user_fk')), E('model_mapping', M('Post')), E('model_mapping', M('User'))],
    ambiguities: [],
});

export const INFERENCE_CASES: Record<string, InferenceCase> = {
    'many-to-one': make('An uncovered foreign key between two mapped tables is a many-to-one from the referencing model', [posts(), users], [m('Post', 'posts'), m('User', 'users')], [manyToOne]),
    'covered-by-relationship': make(
        "A foreign key a declared relationship's keys cover, in either column order, is never inferred",
        [posts(), users],
        [m('Post', 'posts'), m('User', 'users')],
        [],
        { relationships: [relationship('r:posts', 'posts', { model: M('User'), table: T('users'), relatedModel: M('Post'), relatedTable: T('posts'), type: 'test', cardinality: 'one-to-many', keys: { from: { table: T('posts'), columns: ['user_id'] }, to: { table: T('users'), columns: ['id'] } } })] },
    ),
    'unmapped-tables': make('No inference involves a table no model maps, on either end', [posts(), users, t('logs', ['id', 'post_id'], { foreignKeys: [fk('logs', 'logs_post_fk', ['post_id'], 'posts')] })], [m('Post', 'posts')], []),
    'one-to-one-unique-constraint': make(
        'Foreign-key columns that are exactly a unique constraint make a one-to-one',
        [posts({ constraints: [constraint(T('posts'), 'unique', 'posts_user_key', ['user_id'])] }), users],
        [m('Post', 'posts'), m('User', 'users')],
        [{ ...manyToOne, cardinality: 'one-to-one' as const, evidence: [E('foreign_key', fkId('posts', 'posts_user_fk')), E('model_mapping', M('Post')), E('model_mapping', M('User')), E('unique_constraint', `${T('posts')}:constraint:posts_user_key`)] }],
    ),
    'one-to-one-unique-index': make(
        'A unique index on exactly the foreign-key columns makes a one-to-one; a partial unique index does not',
        [
            posts({ indexes: [index(T('posts'), 'posts_user_idx', [part('user_id')], { unique: true })] }),
            users,
            t('drafts', ['id', 'user_id'], { foreignKeys: [fk('drafts', 'drafts_user_fk', ['user_id'], 'users')], indexes: [index(T('drafts'), 'drafts_user_idx', [part('user_id')], { unique: true, partial: true, predicate: 'live' })] }),
        ],
        [m('Draft', 'drafts'), m('Post', 'posts'), m('User', 'users')],
        [
            a('foreign_key', {
                model: M('Draft'),
                relatedModel: M('User'),
                table: T('drafts'),
                relatedTable: T('users'),
                via: null,
                cardinality: 'many-to-one',
                foreignKeys: [fkId('drafts', 'drafts_user_fk')],
                links: [L('drafts', 'users', [['user_id', 'id']])],
                confidence: 'high',
                evidence: [E('foreign_key', fkId('drafts', 'drafts_user_fk')), E('model_mapping', M('Draft')), E('model_mapping', M('User'))],
                ambiguities: [],
            }),
            { ...manyToOne, cardinality: 'one-to-one' as const, evidence: [E('foreign_key', fkId('posts', 'posts_user_fk')), E('model_mapping', M('Post')), E('model_mapping', M('User')), E('unique_index', `${T('posts')}:index:posts_user_idx`)] },
        ].sort((x, y) => (x.id < y.id ? -1 : 1)),
    ),
    'composite-foreign-key': make(
        'A composite foreign key is one many-to-one with one link',
        [
            t('lines', ['id', 'o_region', 'o_number'], { foreignKeys: [fk('lines', 'lines_order_fk', ['o_region', 'o_number'], 'orders', ['region', 'number'])] }),
            t('orders', ['id', 'region', 'number'], { constraints: [constraint(T('orders'), 'unique', 'orders_key', ['region', 'number'])] }),
        ],
        [m('Line', 'lines'), m('Order', 'orders')],
        [
            a('foreign_key', {
                model: M('Line'),
                relatedModel: M('Order'),
                table: T('lines'),
                relatedTable: T('orders'),
                via: null,
                cardinality: 'many-to-one',
                foreignKeys: [fkId('lines', 'lines_order_fk')],
                links: [L('lines', 'orders', [['o_number', 'number'], ['o_region', 'region']])],
                confidence: 'high',
                evidence: [E('foreign_key', fkId('lines', 'lines_order_fk')), E('model_mapping', M('Line')), E('model_mapping', M('Order'))],
                ambiguities: [],
            }),
        ],
    ),
    'association-table': make(
        'An unmapped table whose primary key is exactly the columns of two uncovered foreign keys is a many-to-many between the tables they reference',
        [
            t('post_tags', ['post_id', 'tag_id'], { primaryKey: ['post_id', 'tag_id'], foreignKeys: [fk('post_tags', 'pt_post_fk', ['post_id'], 'posts'), fk('post_tags', 'pt_tag_fk', ['tag_id'], 'tags')] }),
            t('posts', ['id']),
            t('tags', ['id']),
        ],
        [m('Post', 'posts'), m('Tag', 'tags')],
        [
            a('association_table', {
                model: M('Post'),
                relatedModel: M('Tag'),
                table: T('posts'),
                relatedTable: T('tags'),
                via: T('post_tags'),
                cardinality: 'many-to-many',
                foreignKeys: [fkId('post_tags', 'pt_post_fk'), fkId('post_tags', 'pt_tag_fk')],
                links: [L('post_tags', 'posts', [['post_id', 'id']]), L('post_tags', 'tags', [['tag_id', 'id']])].sort(),
                confidence: 'high',
                evidence: [E('foreign_key', fkId('post_tags', 'pt_post_fk')), E('foreign_key', fkId('post_tags', 'pt_tag_fk')), E('model_mapping', M('Post')), E('model_mapping', M('Tag')), E('primary_key', T('post_tags'))],
                ambiguities: [],
            }),
        ],
    ),
    'association-table-without-key': make(
        'An unmapped table with two foreign keys but no key on exactly their columns is not an association table, and is not inferred',
        [t('post_tags', ['id', 'post_id', 'tag_id'], { foreignKeys: [fk('post_tags', 'pt_post_fk', ['post_id'], 'posts'), fk('post_tags', 'pt_tag_fk', ['tag_id'], 'tags')] }), t('posts', ['id']), t('tags', ['id'])],
        [m('Post', 'posts'), m('Tag', 'tags')],
        [],
    ),
    'self-reference': make(
        'A foreign key to its own table is a self-reference: an ambiguity that lowers confidence',
        [t('employees', ['id', 'manager_id'], { foreignKeys: [fk('employees', 'emp_manager_fk', ['manager_id'], 'employees')] })],
        [m('Employee', 'employees')],
        [
            a('foreign_key', {
                model: M('Employee'),
                relatedModel: M('Employee'),
                table: T('employees'),
                relatedTable: T('employees'),
                via: null,
                cardinality: 'many-to-one',
                foreignKeys: [fkId('employees', 'emp_manager_fk')],
                links: [L('employees', 'employees', [['manager_id', 'id']])],
                confidence: 'medium',
                evidence: [E('foreign_key', fkId('employees', 'emp_manager_fk')), E('model_mapping', M('Employee'))],
                ambiguities: ['self_reference'],
            }),
        ],
    ),
    'multiple-foreign-keys': make(
        'Two foreign keys from one table to another are each inferred, ambiguous, with medium confidence',
        [t('messages', ['id', 'from_id', 'to_id'], { foreignKeys: [fk('messages', 'msg_from_fk', ['from_id'], 'users'), fk('messages', 'msg_to_fk', ['to_id'], 'users')] }), users],
        [m('Message', 'messages'), m('User', 'users')],
        (['from', 'to'] as const)
            .map((side) =>
                a('foreign_key', {
                    model: M('Message'),
                    relatedModel: M('User'),
                    table: T('messages'),
                    relatedTable: T('users'),
                    via: null,
                    cardinality: 'many-to-one',
                    foreignKeys: [fkId('messages', `msg_${side}_fk`)],
                    links: [L('messages', 'users', [[`${side}_id`, 'id']])],
                    confidence: 'medium',
                    evidence: [E('foreign_key', fkId('messages', `msg_${side}_fk`)), E('model_mapping', M('Message')), E('model_mapping', M('User'))],
                    ambiguities: ['multiple_foreign_keys'],
                }),
            )
            .sort((x, y) => (x.id < y.id ? -1 : 1)),
    ),
    'multiple-models': make(
        'A table several models map is ambiguous: the model with the smallest id is named, every mapping is evidence',
        [posts(), users],
        [m('Post', 'posts'), m('Admin', 'users'), m('User', 'users')],
        [{ ...manyToOne, relatedModel: M('Admin'), confidence: 'medium', evidence: [E('foreign_key', fkId('posts', 'posts_user_fk')), E('model_mapping', M('Admin')), E('model_mapping', M('Post')), E('model_mapping', M('User'))], ambiguities: ['multiple_models'] }],
    ),
    'unconfirmed-foreign-key': make(
        'A foreign key only the ORM declares, in a combined document, is unconfirmed evidence and lowers confidence; in a declared document it is confirmed',
        [t('posts', ['id', 'user_id'], { foreignKeys: [fk('posts', 'posts_user_fk', ['user_id'], 'users', ['id'], ['declared'])] }), users],
        [m('Post', 'posts'), m('User', 'users')],
        [{ ...manyToOne, confidence: 'medium', evidence: [E('foreign_key', fkId('posts', 'posts_user_fk'), false), E('model_mapping', M('Post')), E('model_mapping', M('User'))] }],
    ),
};
