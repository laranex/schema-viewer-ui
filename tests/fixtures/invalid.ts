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
        description: 'A 1.x document: this reader supports 2.x only, and nothing converts 1.0',
        strict: false,
        errors: ['Unsupported laranex-schema version "1.0"'],
        document: from('database-sqlite-indexes', (d) => (d.version = '1.0')),
    },
    'missing-field': {
        description: 'A required field left out',
        strict: false,
        errors: ['$.connections[0].tables[0].columns[0]: missing provenance'],
        document: from('database-sqlite-indexes', (d) => delete t(d, 'notes').columns[0].provenance),
    },
    'unknown-property-strict': {
        description: 'A property 2.0 does not define, rejected only in strict mode',
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
    'primary-index-other-columns': {
        description: 'An index backing the primary key on other columns than the key',
        strict: false,
        errors: ['An index backing the primary key is unique and has exactly its columns'],
        document: from('database-postgresql-indexes', (d) => (ix(d, 'accounts', 'accounts_pkey').parts[0].column = 'email')),
    },
    'driver-alias': {
        description: "A framework's driver name instead of the canonical dialect",
        strict: false,
        errors: ['Driver pgsql is spelled postgresql'],
        document: from('database-postgresql-indexes', (d) => (d.connections[0].driver = 'pgsql')),
    },
    'strict-other-minor': {
        description: 'Strict validation is for exactly 2.0; a later minor is only read leniently',
        strict: true,
        errors: ['strict validation is for version 2.0'],
        document: from('database-sqlite-indexes', (d) => (d.version = '2.1')),
    },
    'diagnostic-wrong-id': {
        description: 'A diagnostic whose id does not follow the id rule',
        strict: false,
        errors: ['Diagnostic id is not'],
        document: from('combined-drift', (d) => (d.diagnostics[0].id = 'n0000000000000000')),
    },
    'column-subject-without-columns': {
        description: 'A column diagnostic that does not name its columns',
        strict: false,
        errors: ['A column subject names its columns'],
        document: from('combined-drift', (d) => (d.diagnostics.find((x: Mutable) => x.subject.type === 'column').subject.columns = null)),
    },
    'primary-index-not-unique': {
        description: 'A primary index that is not unique',
        strict: false,
        errors: ['An index backing the primary key is unique and has exactly its columns'],
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
    'foreign-key-across-connections': {
        description: 'A foreign key to a table in another connection: constraints never cross connections, only relationships do',
        strict: false,
        errors: ['Foreign key crosses connections'],
        document: from('combined-multi-connection', (d) => {
            const sessions = d.connections.find((c: Mutable) => c.name === 'cache').tables[0];
            sessions.foreignKeys.push({ id: 'cache:sessions:fk:sessions_user_id_foreign', name: 'sessions_user_id_foreign', columns: ['user_id'], foreignTable: 'app:public.users', foreignColumns: ['id'], onUpdate: null, onDelete: null, deferrable: null, initially: null, provenance: ['database'] });
        }),
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
    'comparison-wrong-id': {
        description: 'A comparison whose id does not follow the id rule',
        strict: false,
        errors: ['Comparison id is not'],
        document: from('comparison-tenant-schemas', (d) => (d.comparisons[0].id = 'c0000000000000000')),
    },
    'comparison-same-scope': {
        description: 'A comparison of a scope with itself',
        strict: false,
        errors: ['A comparison compares two different scopes'],
        document: from('comparison-tenant-schemas', (d) => (d.comparisons[0].target.schema = 'tenant_a')),
    },
    'comparison-unknown-connection': {
        description: 'A comparison naming a connection the document does not have',
        strict: false,
        errors: ['Unknown comparison connection'],
        document: from('comparison-tenant-schemas', (d) => (d.comparisons[0].target.connection = 'connection:nowhere')),
    },
    'difference-wrong-id': {
        description: 'A difference whose id does not follow the id rule',
        strict: false,
        errors: ['Difference id is not'],
        document: from('comparison-tenant-schemas', (d) => (d.comparisons[0].differences[0].id = 'x0000000000000000')),
    },
    'differences-unsorted': {
        description: 'Differences out of order',
        strict: false,
        errors: ['Differences are sorted by object type, key and change'],
        document: from('comparison-tenant-schemas', (d) => d.comparisons[0].differences.reverse()),
    },
    'difference-missing-with-target': {
        description: 'A missing difference that also has a target side',
        strict: false,
        errors: ['A missing difference has only a baseline'],
        document: from('comparison-tenant-schemas', (d) => {
            const x = d.comparisons[0].differences.find((y: Mutable) => y.change === 'missing');
            x.target = x.baseline;
        }),
    },
    'difference-changed-without-fields': {
        description: 'A changed difference that lists no field',
        strict: false,
        errors: ['Only a changed difference lists fields'],
        document: from('comparison-tenant-schemas', (d) => (d.comparisons[0].differences.find((y: Mutable) => y.change === 'changed').fields = [])),
    },
    'difference-key-names-schema': {
        description: 'A difference key that contains a compared tenant schema name',
        strict: false,
        errors: ['A difference key never contains a compared schema name'],
        document: from('comparison-tenant-schemas', (d) => (d.comparisons[0].differences[0].key = ['tenant_a'])),
    },
    'difference-side-outside-scope': {
        description: "A difference side naming a table of the other scope",
        strict: false,
        errors: ['A difference side names a table of its own scope'],
        document: from('comparison-tenant-schemas', (d) => {
            const x = d.comparisons[0].differences.find((y: Mutable) => y.change === 'changed' && y.objectType === 'column');
            x.baseline.table = x.target.table;
        }),
    },
    'difference-side-wrong-entity': {
        description: "An index difference whose side names an id that is not one of its table's indexes",
        strict: false,
        errors: ["A difference side's id is its index's, of its table"],
        document: from('comparison-tenant-schemas', (d) => (d.comparisons[0].differences.find((y: Mutable) => y.objectType === 'index').baseline = { table: 'app:tenant_a.orders', id: 'app:tenant_a.orders:fk:orders_user_id_fkey', label: 'orders' })),
    },
    'comparison-omitted-but-complete': {
        description: 'A comparison marked complete although it left differences out',
        strict: false,
        errors: ['A comparison with omitted differences is incomplete'],
        document: from('comparison-incomplete', (d) => (d.comparisons[0].complete = true)),
    },
    'comparison-summary-mismatch': {
        description: 'A summary that does not count the differences',
        strict: false,
        errors: ['Comparison summary does not count its differences and omitted ones'],
        document: from('comparison-tenant-schemas', (d) => (d.comparisons[0].summary.changed += 1)),
    },
    'migration-wrong-id': {
        description: 'A migration track whose id does not follow the id rule',
        strict: false,
        errors: ['Migration track id is not'],
        document: from('migrations-alembic', (d) => (d.migrations[0].id = 'm0000000000000000')),
    },
    'migration-wrong-heads': {
        description: 'History heads that are not the revisions without children',
        strict: false,
        errors: ['History heads are the revisions no revision names as a parent'],
        document: from('migrations-alembic', (d) => (d.migrations.find((m: Mutable) => m.schema === 'tenant_branches').history.heads = ['6f7a8b9c0d1e'])),
    },
    'migration-wrong-missing': {
        description: 'A partial history that does not list its missing parent',
        strict: false,
        errors: ['History missing lists the parents not in revisions'],
        document: from('migrations-alembic', (d) => (d.migrations.find((m: Mutable) => m.schema === 'tenant_partial').history.missing = [])),
    },
    'migration-wrong-status': {
        description: 'A track behind its head reported up to date',
        strict: false,
        errors: ['Migration status, pending and unknownRevisions do not follow the status rules (expected behind)'],
        document: from('migrations-alembic', (d) => {
            const m = d.migrations.find((x: Mutable) => x.schema === 'tenant_behind');
            m.status = 'up_to_date';
            m.pending = [];
        }),
    },
    'migration-unlisted-unknown-revision': {
        description: 'A revision the history lacks, not listed in unknownRevisions',
        strict: false,
        errors: ['Migration status, pending and unknownRevisions do not follow the status rules (expected unknown)'],
        document: from('migrations-alembic', (d) => (d.migrations.find((x: Mutable) => x.schema === 'tenant_unknown').unknownRevisions = [])),
    },
    'migration-revisions-without-version-table': {
        description: 'Revisions recorded although the database has no version table',
        strict: false,
        errors: ['Without a version table no revision is recorded'],
        document: from('migrations-alembic', (d) => (d.migrations.find((x: Mutable) => x.schema === 'tenant_current').versionTable = null)),
    },
    'migration-version-table-outside-scope': {
        description: "A version table in another tenant's schema",
        strict: false,
        errors: ["The version table is a table of the track's scope"],
        document: from('migrations-alembic', (d) => (d.migrations.find((x: Mutable) => x.schema === 'tenant_current').versionTable = 'app:tenant_behind.alembic_version')),
    },
    'migration-unknown-coverage-certain': {
        description: 'A coverage row with an unknown answer reported as certain',
        strict: false,
        errors: ['A coverage row with an unknown answer is likely, not certain'],
        document: from('migrations-alembic', (d) => (d.migrations.find((x: Mutable) => x.schema === 'tenant_current').coverage.find((r: Mutable) => r.name === 'legacy_import').certainty = 'certain')),
    },
    'migration-coverage-wrong-table': {
        description: "A coverage row whose table has another name",
        strict: false,
        errors: ["A coverage row's table is a table of the track's scope with its name"],
        document: from('migrations-alembic', (d) => (d.migrations.find((x: Mutable) => x.schema === 'tenant_current').coverage.find((r: Mutable) => r.name === 'users').table = 'app:tenant_current.audit_log')),
    },
    'inferred-wrong-id': {
        description: 'An inferred association whose id does not follow the id rule',
        strict: false,
        errors: ['Inferred association id is not'],
        document: from('inferred-associations', (d) => (d.inferredAssociations[0].id = 'i0000000000000000')),
    },
    'inferred-covered-foreign-key': {
        description: "An inference over a foreign key a declared relationship covers",
        strict: false,
        errors: ['A declared relationship covers the inferred association'],
        document: from('inferred-associations', (d) => {
            const a = d.inferredAssociations.find((x: Mutable) => x.kind === 'foreign_key' && x.foreignKeys[0].includes('profiles'));
            const fk = 'app:public.posts:fk:posts_author_id_fkey';
            Object.assign(a, { foreignKeys: [fk], table: 'app:public.posts', model: 'model:app.models.Post', evidence: [{ kind: 'foreign_key', id: fk, confirmed: true }] });
        }),
    },
    'inferred-kind-mismatch': {
        description: 'A foreign-key inference with an association table',
        strict: false,
        errors: ['An association-table inference has via, two foreign keys and many-to-many'],
        document: from('inferred-associations', (d) => (d.inferredAssociations.find((x: Mutable) => x.kind === 'foreign_key').via = 'app:public.post_tags')),
    },
    'inferred-model-not-mapping-table': {
        description: "An inferred association whose model does not map its table",
        strict: false,
        errors: ["An inferred association's models map its tables"],
        document: from('inferred-associations', (d) => (d.inferredAssociations[0].model = 'model:app.models.Tag')),
    },
    'inferred-unknown-foreign-key': {
        description: 'An inferred association over a foreign key the document does not have',
        strict: false,
        errors: ["An inferred association's foreign key exists and has a link"],
        document: from('inferred-associations', (d) => (d.inferredAssociations.find((x: Mutable) => x.kind === 'foreign_key').foreignKeys = ['app:public.users:fk:nope'])),
    },
    'inferred-wrong-links': {
        description: "An inferred association listing a link that is not its foreign key's",
        strict: false,
        errors: ['An inferred association lists the links of its foreign keys'],
        document: from('inferred-associations', (d) => (d.inferredAssociations.find((x: Mutable) => x.kind === 'foreign_key').links = [d.links.find((l: Mutable) => l.state === 'both').id])),
    },
};
