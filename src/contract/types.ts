// laranex-schema 2.0: one framework-neutral document for Laravel, Python and Node.js schema viewers.
//
// The structure and camelCase naming follow Laravel Schema Viewer's serialized document; Python and Node.js metadata is
// kept through neutral fields and optional extensions. Every entity has an opaque id and refers to others by id.
// Physical foreign keys and ORM-declared relationships are separate entities; links relate them without merging them.
// See docs/contract.md for the rules each field follows.

export const FORMAT = 'laranex-schema';
export const VERSION = '2.0';
export const MAJOR = 2;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

// ORM- or framework-specific facts, keyed by a namespace such as "eloquent", "laravel", "sqlalchemy" or "prisma".
// Viewers render them generically; nothing neutral may live only here.
export type Extensions = Record<string, JsonObject>;

// declared: ORM metadata only. database: database introspection only. combined: database introspection enriched with
// ORM metadata, where the database is authoritative for every structure it inspected.
export type SourceMode = 'declared' | 'database' | 'combined';

// Which sources observed an entity. An entity only one source reports carries just that source.
export type Provenance = ('database' | 'declared')[];

// A field the database and the ORM declarations disagree on, in combined mode. The entity's own field holds the
// database value; declared holds what the ORM says.
export type Drift = { field: string; database: JsonValue; declared: JsonValue };

export type FeatureCoverage = 'complete' | 'partial' | 'unavailable' | 'not_applicable';

export const FEATURES = [
    'tables',
    'columns',
    'columnTypes',
    'defaults',
    'comments',
    'primaryKeys',
    'foreignKeys',
    'referentialActions',
    'indexes',
    'indexExpressions',
    'indexPredicates',
    'includedColumns',
    'uniqueConstraints',
    'checkConstraints',
    'models',
    'relationships',
] as const;
export type Feature = (typeof FEATURES)[number];

// What one source covered for a connection. complete is true only when every feature is complete or not applicable and
// every schema in scope was read; a partial or failed inspection is never reported as complete.
export type Coverage = {
    complete: boolean;
    // The schemas read, or null when the source has no notion of schemas (SQLite, most ORM metadata).
    schemas: string[] | null;
    features: Partial<Record<Feature, FeatureCoverage>>;
};

// Canonical dialect names. driver is open (other databases may appear), but these spellings are the only ones for the
// databases they name: producers map their framework's names (Laravel's pgsql) to them.
export const DRIVERS = ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlsrv', 'oracle'] as const;
export const DRIVER_ALIASES: Record<string, (typeof DRIVERS)[number]> = { pgsql: 'postgresql', postgres: 'postgresql', mssql: 'sqlsrv', sqlserver: 'sqlsrv' };

export type Connection = {
    id: string;
    name: string;
    // The database dialect, lower case: postgresql, mysql, mariadb, sqlite, sqlsrv, oracle, … or null when not known.
    driver: string | null;
    // The schema unqualified names resolve to, when known.
    defaultSchema: string | null;
    coverage: { database: Coverage | null; declared: Coverage | null };
    tables: Table[];
    extensions?: Extensions;
};

export type DefaultValue = {
    // literal: a constant; expression: SQL evaluated by the database; sequence: a named sequence; identity: an identity
    // or serial default; raw: database text that was not classified.
    kind: 'literal' | 'expression' | 'sequence' | 'identity' | 'raw';
    // Always SQL text, so a literal keeps its type: 'draft', 0, true, NULL.
    value: string;
};

// The allowed values of an enum column, in declaration order, and the named type when the database has one.
export type EnumType = { name: string | null; values: string[] };

export type OrmDefault = {
    // scalar: a constant the ORM inserts; callable: application code the ORM calls (named, never called during
    // extraction); sequence: an ORM-managed sequence; expression: SQL the ORM sends.
    kind: 'scalar' | 'callable' | 'sequence' | 'expression';
    value: string;
};

export type Column = {
    name: string;
    // The full type as the database or ORM spells it, such as varchar(255) or TIMESTAMP WITH TIME ZONE.
    type: string;
    // The base type name, such as varchar, or null when not known.
    typeName: string | null;
    nullable: boolean;
    // null: decided by the database or ORM.
    autoIncrement: boolean | null;
    timezone: boolean | null;
    // The column's collation when it differs from, or the source states, the table's.
    collation: string | null;
    enum: EnumType | null;
    default: DefaultValue | null;
    ormDefault: OrmDefault | null;
    generated: { kind: 'stored' | 'virtual' | null; expression: string } | null;
    comment: string | null;
    note: string | null;
    provenance: Provenance;
    drift?: Drift[];
    extensions?: Extensions;
};

export type IndexOptions = {
    method?: string | null;
    predicate?: string | null;
    included?: string[];
    // Anything else the dialect states, such as { nullsNotDistinct: true } or { invisible: true }.
    options?: JsonObject;
};

// One key part, in index order: a column or an expression, never both.
export type IndexPart = {
    column: string | null;
    // SQL text, or null for a column part. An expression whose text is not known is not listed; see Index.expression.
    expression: string | null;
    order: 'asc' | 'desc' | null;
    nulls: 'first' | 'last' | null;
    // A prefix length, such as MySQL's name(10).
    length: number | null;
    collation: string | null;
    // An operator class, such as PostgreSQL's text_pattern_ops.
    opclass: string | null;
};

export type Index = {
    id: string;
    name: string | null;
    // Every key part, in order.
    parts: IndexPart[];
    // True when any key part is an expression, even one whose text is not known (parts then lists fewer parts).
    expression: boolean;
    unique: boolean;
    // The constraint this index enforces: the table's primary key (the primary index), or a unique constraint (by id,
    // when the document has it as an entity). null for an index created on its own.
    backs: { kind: 'primary_key' | 'unique_constraint'; constraint: string | null } | null;
    // btree, hash, gin, gist, brin, fulltext, spatial, … or null when not reported.
    method: string | null;
    partial: boolean;
    // The WHERE clause of a partial index, when known.
    predicate: string | null;
    // Columns stored in the index but not part of its key (INCLUDE).
    included: string[];
    // Options declared for specific dialects, such as { postgresql: { predicate: "active" } }.
    dialectOptions?: Record<string, IndexOptions>;
    provenance: Provenance;
    drift?: Drift[];
    extensions?: Extensions;
};

export type ReferentialAction = 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';

export type ForeignKey = {
    id: string;
    name: string | null;
    columns: string[];
    foreignTable: string;
    foreignColumns: string[];
    // null: not declared or not reported.
    onUpdate: ReferentialAction | null;
    onDelete: ReferentialAction | null;
    deferrable: boolean | null;
    initially: 'DEFERRED' | 'IMMEDIATE' | null;
    provenance: Provenance;
    drift?: Drift[];
    extensions?: Extensions;
};

export type Constraint = {
    id: string;
    kind: 'unique' | 'check';
    name: string | null;
    columns: string[];
    expression: string | null;
    provenance: Provenance;
    drift?: Drift[];
    extensions?: Extensions;
};

export type Owner = { kind: 'application' | 'framework' | 'package'; package: string | null };

export type Table = {
    id: string;
    name: string;
    // null: unqualified (resolved through the connection's default schema), not a guess at it.
    schema: string | null;
    comment: string | null;
    note: string | null;
    owner: Owner;
    // Ordered; empty when there is none.
    primaryKey: string[];
    columns: Column[];
    indexes: Index[];
    foreignKeys: ForeignKey[];
    constraints: Constraint[];
    provenance: Provenance;
    drift?: Drift[];
    extensions?: Extensions;
};

export type Source = {
    // Relative to the project root.
    file: string;
    line: number | null;
};

export type Model = {
    id: string;
    // The class as the language names it: App\Models\User, shop.models.Order, User.
    className: string;
    // Table ids; a model can map to several tables (inheritance) or none (unresolved).
    tables: string[];
    primaryKey: string[];
    source: Source | null;
    extensions?: Extensions;
};

export type Endpoint = { table: string; columns: string[] };

export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

export type Pivot = {
    table: string;
    // parentPivotColumns reference the declaring model's parentColumns; relatedPivotColumns the related model's.
    parentColumns: string[];
    parentPivotColumns: string[];
    relatedColumns: string[];
    relatedPivotColumns: string[];
    // Extra pivot columns the relationship exposes.
    columns: string[];
};

export type Polymorphic = {
    typeColumn: string;
    idColumn: string;
    // The type value this side stores or matches, when fixed.
    typeValue: string | null;
};

export type Relationship = {
    id: string;
    name: string;
    model: string;
    // The declaring model's table this relationship starts from.
    table: string;
    // null for a polymorphic relationship with no single target, or an unresolved one (with a diagnostic).
    relatedModel: string | null;
    relatedTable: string | null;
    // The ORM's own word: HasMany, MANYTOONE, @relation, ManyToOne, …
    type: string;
    // From the declaring model's side.
    cardinality: Cardinality;
    collection: boolean;
    readOnly: boolean;
    // Oriented like a foreign key: from holds the referencing columns, to the referenced ones. null when the
    // relationship goes through a pivot or intermediate tables, or its keys could not be resolved.
    keys: { from: Endpoint; to: Endpoint } | null;
    pivot: Pivot | null;
    polymorphic: Polymorphic | null;
    // Intermediate table ids of a through relationship, in order.
    through: string[] | null;
    // Join conditions as the ORM states them, when it does.
    join: { primary: string | null; secondary: string | null } | null;
    // Extra query constraints the ORM applies, as text.
    constraints: string[];
    inverse: string | null;
    note: string | null;
    source: Source | null;
    extensions?: Extensions;
};

export type LinkState = 'both' | 'relationship' | 'foreign_key';

// One edge per pair of column sets: a foreign key, the relationships that use the same columns, or both.
export type Link = {
    id: string;
    from: Endpoint;
    to: Endpoint;
    foreignKey: string | null;
    relationships: string[];
    state: LinkState;
    polymorphic: boolean;
    note: string | null;
};

// A relationship through intermediate tables, drawn as its own edge and never matched to a foreign key.
export type DerivedLink = {
    id: string;
    from: string;
    to: string;
    via: string[];
    relationship: string;
};

export type DiagnosticCategory = 'extraction' | 'inspection' | 'reconciliation' | 'drift' | 'lint';

export const SUBJECT_TYPES = [
    'document',
    'connection',
    'table',
    'column',
    'index',
    'foreignKey',
    'constraint',
    'model',
    'relationship',
    'link',
    'comparison',
    'migration',
    'inferredAssociation',
] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

// Diagnostic kinds the contract names, so producers agree on them. Producers may add their own kinds.
export const DIAGNOSTIC_KINDS = {
    // extraction and inspection: what could not be read.
    unresolvedForeignKey: 'unresolved_foreign_key',
    unresolvedRelationship: 'unresolved_relationship',
    unsupportedMetadata: 'unsupported_metadata',
    inspectionUnavailable: 'inspection_unavailable',
    // reconciliation: what one source has and the other does not.
    modelWithoutTable: 'model_without_table',
    tableWithoutModel: 'table_without_model',
    declaredOnly: 'declared_only',
    databaseOnly: 'database_only',
    // drift: what both sources have but disagree on.
    columnDrift: 'column_drift',
    indexDrift: 'index_drift',
    foreignKeyDrift: 'foreign_key_drift',
    // lint: advice about the schema. Reserved for index analysis.
    missingIndex: 'missing_index',
    duplicateIndex: 'duplicate_index',
    redundantIndex: 'redundant_index',
    relationshipWithoutForeignKey: 'relationship_without_foreign_key',
    foreignKeyWithoutRelationship: 'foreign_key_without_relationship',
    // comparisons, migrations and inferred associations.
    comparisonIncomplete: 'comparison_incomplete',
    migrationHistoryUnavailable: 'migration_history_unavailable',
    migrationVersionTableUnreadable: 'migration_version_table_unreadable',
    migrationMultipleHeads: 'migration_multiple_heads',
    migrationUnknownRevision: 'migration_unknown_revision',
    inferenceAmbiguous: 'inference_ambiguous',
} as const;

export type Diagnostic = {
    // "n" + hash of [kind, subject.type, subject.id, subject.columns, message]; see diagnosticId().
    id: string;
    kind: string;
    category: DiagnosticCategory;
    severity: 'error' | 'warning' | 'info';
    // certain: a confirmed fact read from metadata; likely: a heuristic recommendation inferred from names, conventions
    // or usage patterns. Viewers must show the two apart.
    certainty: 'certain' | 'likely';
    // The entity the diagnostic is about. id is null for the document, and names a missing entity for unresolved_* kinds.
    // A column subject's id is its table's and columns names the columns; other subjects may name columns as context.
    subject: { type: SubjectType; id: string | null; columns: string[] | null; label: string | null };
    message: string;
    extensions?: Extensions;
};

export type Generator = {
    // The producing package, such as laravel-schema-viewer, python-schema-viewer or laranex-schema-viewer (npm).
    name: string;
    // The ORM metadata came from, or null for database-only documents.
    orm: string | null;
};

export type SchemaDocument = {
    format: typeof FORMAT;
    // "major.minor"; readers accept any minor of their major.
    version: string;
    source: SourceMode;
    generator: Generator;
    note: string | null;
    connections: Connection[];
    models: Model[];
    relationships: Relationship[];
    links: Link[];
    derivedLinks: DerivedLink[];
    diagnostics: Diagnostic[];
    comparisons: Comparison[];
    migrations: MigrationTrack[];
    inferredAssociations: InferredAssociation[];
    extensions?: Extensions;
};

export type Severity = 'error' | 'warning' | 'info';
export type Certainty = 'certain' | 'likely';

// A comparison side: one connection's tables, optionally one schema of it. schema null means the tables whose schema is
// null or the connection's default schema.
export type Scope = { connection: string; schema: string | null };

export const OBJECT_TYPES = ['table', 'column', 'primaryKey', 'index', 'foreignKey', 'constraint'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export const CHANGES = ['missing', 'extra', 'changed'] as const;
// missing: in the baseline, not the target. extra: in the target only. changed: in both, with different fields.
export type Change = (typeof CHANGES)[number];

// One side of a difference. table is the table id; id is the index, foreign key or constraint id, null for a table,
// column or primary key.
export type DifferenceRef = { table: string; id: string | null; label: string };

export type FieldDifference = { field: string; baseline: JsonValue; target: JsonValue };

export type Difference = {
    id: string;
    change: Change;
    objectType: ObjectType;
    // The normalized identity both sides share; never contains a schema name, so tenant schemas compare equal.
    key: string[];
    baseline: DifferenceRef | null;
    target: DifferenceRef | null;
    // The differing fields of a changed object; empty for missing and extra.
    fields: FieldDifference[];
    severity: Severity;
    // likely when the difference rests on normalized type or SQL text; otherwise certain.
    certainty: Certainty;
    extensions?: Extensions;
};

export type Comparison = {
    id: string;
    baseline: Scope;
    target: Scope;
    // false when differences were left out (omitted > 0) or either side's coverage could not support the comparison.
    complete: boolean;
    omitted: number;
    // Counts of every difference found, listed or omitted.
    summary: { missing: number; extra: number; changed: number };
    differences: Difference[];
    extensions?: Extensions;
};

export type MigrationRevision = { id: string; parents: string[]; branchLabels: string[] };

export type MigrationHistory = {
    revisions: MigrationRevision[];
    // Revisions no other revision names as a parent.
    heads: string[];
    // Parents named by a revision but not in revisions: a partial history.
    missing: string[];
};

export const MIGRATION_STATUSES = ['up_to_date', 'behind', 'diverged', 'uninitialized', 'unknown'] as const;
export type MigrationStatus = (typeof MIGRATION_STATUSES)[number];

export type CoverageEvidence = { kind: 'create_table' | 'drop_table' | 'include_filter' | 'version_table' | 'model'; detail: string };

// Whether a table is under migration control. autogenerate coverage and migration history are separate facts:
// "excluded" from autogenerate never means "not migrated".
export type MigrationCoverage = {
    table: string | null;
    name: string;
    declared: boolean;
    autogenerate: 'included' | 'excluded' | 'unknown';
    migrationManaged: 'yes' | 'no' | 'unknown';
    certainty: Certainty;
    evidence: CoverageEvidence[];
};

export type MigrationTrack = {
    id: string;
    // The migration tool: alembic, …
    provider: string;
    connection: string;
    schema: string | null;
    // The version table's id; null when the database has none.
    versionTable: string | null;
    // null when the migration scripts could not be read.
    history: MigrationHistory | null;
    // The revisions the database records; null when the version table could not be read, [] when it records none.
    current: string[] | null;
    status: MigrationStatus;
    // Revisions not yet applied; null when that cannot be determined.
    pending: string[] | null;
    // Current revisions the history does not have.
    unknownRevisions: string[];
    coverage: MigrationCoverage[];
    extensions?: Extensions;
};

export type InferenceEvidence = {
    kind: 'foreign_key' | 'primary_key' | 'unique_constraint' | 'unique_index' | 'model_mapping';
    // The foreign key, constraint or index id; the table id for primary_key; the model id for model_mapping.
    id: string;
    // A fact read from database metadata, or from ORM metadata in a declared document.
    confirmed: boolean;
};

// An association the foreign keys imply between two models that declare no relationship over them. It is never a
// relationship, never adds a link, and is shown as "inferred, no ORM attribute declared".
export type InferredAssociation = {
    id: string;
    kind: 'foreign_key' | 'association_table';
    model: string;
    relatedModel: string;
    table: string;
    relatedTable: string;
    // The association table, for kind association_table.
    via: string | null;
    cardinality: 'many-to-one' | 'one-to-one' | 'many-to-many';
    foreignKeys: string[];
    links: string[];
    confidence: 'high' | 'medium' | 'low';
    evidence: InferenceEvidence[];
    // multiple_foreign_keys, self_reference, multiple_models, … (open list), sorted.
    ambiguities: string[];
    extensions?: Extensions;
};
