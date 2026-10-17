import type { SchemaDocument } from '../../src/contract/types';
import { VALID } from './documents';

// The invalid fixtures, written to contract/fixtures/invalid/<name>.json as { description, strict, errors, document }.
// Each breaks one rule of a valid fixture; errors lists messages the validator must report (as substrings).

export type InvalidCase = { description: string; strict: boolean; errors: string[]; document: unknown };

type Mutable = any;

const from = (name: string, change: (doc: Mutable) => void): unknown => {
    const doc = structuredClone(VALID[name]()) as SchemaDocument;
    change(doc);
    return doc;
};

const t = (doc: Mutable, name: string) => doc.connections[0].tables.find((x: Mutable) => x.name === name);
const ix = (doc: Mutable, table: string, name: string) => t(doc, table).indexes.find((x: Mutable) => x.name === name);

export const INVALID: Record<string, InvalidCase> = {
    'wrong-format': {
        description: 'A document of another format',
        strict: false,
        errors: ['Not a laranex-schema document'],
        document: from('database-sqlite-indexes', (d) => (d.format = 'laranex-schema-viewer')),
    },
    'unsupported-major': {
        description: 'A major version this reader does not support',
        strict: false,
        errors: ['Unsupported laranex-schema version "2.0"'],
        document: from('database-sqlite-indexes', (d) => (d.version = '2.0')),
    },
    'missing-field': {
        description: 'A required field left out',
        strict: false,
        errors: ['$.connections[0].tables[0].columns[0]: missing provenance'],
        document: from('database-sqlite-indexes', (d) => delete t(d, 'notes').columns[0].provenance),
    },
    'unknown-property-strict': {
        description: 'A property 1.0 does not define, rejected only in strict mode',
        strict: true,
        errors: ['$.connections[0].tables[0]: unknown property engine'],
        document: from('database-sqlite-indexes', (d) => (t(d, 'notes').engine = 'InnoDB')),
    },
    'provenance-outside-source': {
        description: 'Declared provenance in a database-only document',
        strict: false,
        errors: ['Provenance declared is not possible in a database document'],
        document: from('database-sqlite-indexes', (d) => (t(d, 'notes').columns[1].provenance = ['declared'])),
    },
    'drift-without-both-sources': {
        description: 'Drift on an entity only one source observed',
        strict: false,
        errors: ['Drift needs both database and declared provenance'],
        document: from('combined-drift', (d) => (t(d, 'users').columns.find((c: Mutable) => c.name === 'legacy_flag').drift = [{ field: 'type', database: 'boolean', declared: 'BOOLEAN' }])),
    },
    'coverage-claims-complete': {
        description: 'Coverage marked complete although a feature was unavailable',
        strict: false,
        errors: ['Coverage is marked complete with partial or unavailable features'],
        document: from('combined-drift', (d) => (d.connections[0].coverage.database.complete = true)),
    },
    'coverage-for-wrong-source': {
        description: 'Declared coverage in a database-only document',
        strict: false,
        errors: ['Coverage does not match source database'],
        document: from('database-mysql-indexes', (d) => (d.connections[0].coverage.declared = { complete: true, schemas: null, features: {} })),
    },
    'index-part-column-and-expression': {
        description: 'An index key part that is both a column and an expression',
        strict: false,
        errors: ['An index part is exactly one of a column or an expression'],
        document: from('database-postgresql-indexes', (d) => (ix(d, 'accounts', 'accounts_lower_email_idx').parts[0].column = 'email')),
    },
    'index-columns-out-of-order': {
        description: 'Index columns that do not follow its column parts',
        strict: false,
        errors: ['Index columns must list its column parts in order'],
        document: from('database-postgresql-indexes', (d) => (ix(d, 'invoices', 'invoices_account_id_number_key').columns = ['number', 'account_id'])),
    },
    'primary-index-not-unique': {
        description: 'A primary index that is not unique',
        strict: false,
        errors: ['A primary index is unique and backs the primary key'],
        document: from('database-postgresql-indexes', (d) => (ix(d, 'accounts', 'accounts_pkey').unique = false)),
    },
    'backs-check-constraint': {
        description: 'An index said to back a check constraint',
        strict: false,
        errors: ['An index backing a unique constraint is unique and names a unique constraint of its table'],
        document: from('database-postgresql-indexes', (d) => (ix(d, 'invoices', 'invoices_account_id_number_key').backs.constraint = t(d, 'invoices').constraints.find((c: Mutable) => c.kind === 'check').id)),
    },
    'predicate-without-partial': {
        description: 'A predicate on an index that is not partial',
        strict: false,
        errors: ['Only a partial index has a predicate'],
        document: from('database-sqlite-indexes', (d) => (ix(d, 'notes', 'notes_lower_title').predicate = 'archived = 0')),
    },
    'foreign-key-unknown-target': {
        description: 'A foreign key to a table outside the document, without an unresolved_foreign_key diagnostic',
        strict: false,
        errors: ['Unknown foreign-key target table'],
        document: from('database-postgresql-indexes', (d) => (t(d, 'invoices').foreignKeys[0].foreignTable = 'pg:billing.missing')),
    },
    'foreign-key-column-counts': {
        description: 'A composite foreign key with fewer target columns',
        strict: false,
        errors: ['Foreign-key column counts differ'],
        document: from('declared-sqlalchemy', (d) => (t(d, 'order_lines').foreignKeys.find((f: Mutable) => f.name === 'fk_order_lines_product').foreignColumns = ['sku'])),
    },
    'link-state-mismatch': {
        description: 'A link whose state does not match its foreign key and relationships',
        strict: false,
        errors: ['does not match its foreign key and relationships'],
        document: from('combined-eloquent', (d) => (d.links.find((l: Mutable) => l.state === 'both').state = 'foreign_key')),
    },
    'pivot-unknown-column': {
        description: 'A pivot naming a column its table does not have',
        strict: false,
        errors: ['Invalid relationship pivot'],
        document: from('combined-eloquent', (d) => (d.relationships.find((r: Mutable) => r.pivot).pivot.parentPivotColumns = ['nope'])),
    },
    'related-model-missing': {
        description: 'A relationship without a related model that is neither polymorphic nor unresolved',
        strict: false,
        errors: ['Unknown related model'],
        document: from('combined-drift', (d) => (d.relationships[0].relatedModel = null)),
    },
    'diagnostic-unknown-subject': {
        description: 'A diagnostic about a table that is not in the document',
        strict: false,
        errors: ['Unknown diagnostic subject table'],
        document: from('combined-drift', (d) => (d.diagnostics.find((x: Mutable) => x.kind === 'table_without_model').subject.id = 'table:default.nowhere')),
    },
    'duplicate-ids': {
        description: 'Two tables with one id',
        strict: false,
        errors: ['Duplicate table id'],
        document: from('database-sqlite-indexes', (d) => d.connections[0].tables.push(structuredClone(t(d, 'notes')))),
    },
};
