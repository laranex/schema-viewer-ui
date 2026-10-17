# The `laranex-schema` contract, version 2.0

One framework-neutral JSON document describes a project's schema for every Laranex schema viewer: the Laravel, Python
and Node.js packages produce it, and the shared viewer, MCP tools and exporters read it. This page is the normative
description; `contract/schema.json` (JSON Schema 2020-12), `src/contract/types.ts` and `validateDocument()` implement
it, and the fixtures in `contract/` are the shared test suite.

## Principles

- **One contract, no adapters.** Producers serialize their ORM's and database's facts into this document. Readers never
  detect or convert framework formats; conversion of a producer's older snapshots belongs to that producer.
- **Facts, not guesses.** Physical database structures (foreign keys, indexes, constraints) and ORM declarations
  (models, relationships) are separate entities. A relationship never implies a foreign key, and naming conventions
  never create a relationship. What could not be read is a diagnostic, not a default.
- **Explicit provenance.** Every physical entity says which sources observed it, and each connection says what each
  source covered. An incomplete inspection is never reported as complete.
- **Opaque, stable ids.** Every entity has an id, unique among entities of its kind (connections, tables, indexes,
  foreign keys, constraints, models, relationships, links, diagnostics, comparisons, differences, migration tracks,
  inferred associations), and refers to others by id. Consumers compare ids; they never parse them.
- **Facts, inferences and comparisons stay apart.** Physical foreign keys, ORM-declared relationships and inferred
  associations are three collections; an inference is never a relationship and never adds a link. Comparisons and
  migration tracks are computed by producers with the shared algorithms below; viewers display them and never
  compute them.
- **The contract is the serialization boundary.** Producers keep ORM and database extraction, a normalized
  in-memory schema model, and canonical serialization separate: extractors fill the model, and only the serializer
  knows this document's field names. Nothing converts between versions or formats.
- **Deterministic bytes.** Equal schemas serialize to equal bytes: no timestamps, canonical key order, specified array
  order.

## Versions

`format` is `"laranex-schema"`; `version` is `"major.minor"`, currently `"2.0"`. 2.0 replaces 1.0; nothing reads or
converts 1.0 documents (see [Changes from 1.0](#changes-from-1-0)).

- A minor version only adds optional fields or new enum-like string values documented as open (diagnostic kinds,
  relationship types, ambiguities, providers). A major version is any other change.
- Producers and tests validate strictly (`validateDocument(doc, { strict: true })`): the version must be exactly
  the one the validator implements (`"2.0"`), and unknown properties are errors.
- Readers accept every minor of their major and ignore properties they do not know (the default, lenient mode), so a
  deployed viewer keeps reading documents from a newer producer. Any other major, 1.x included, is rejected with one
  clear error.

## Document

| Field | Type | Meaning |
|---|---|---|
| `format` | `"laranex-schema"` | |
| `version` | string | `"2.0"` |
| `source` | `declared` \| `database` \| `combined` | See [Source modes](#source-modes) |
| `generator` | `{ name, orm }` | The producing package and the ORM (null for database-only). No versions or times, so upgrading a producer does not change equal schemas' bytes |
| `note` | string \| null | The project's note |
| `connections` | Connection[] | Database connections or ORM namespaces, each with its tables |
| `models` | Model[] | ORM models |
| `relationships` | Relationship[] | ORM-declared relationships |
| `links` | Link[] | Graph edges between column sets; see [Graph](#graph) |
| `derivedLinks` | DerivedLink[] | Through relationships as edges |
| `diagnostics` | Diagnostic[] | What could not be read, what disagrees, and advice |
| `comparisons` | Comparison[] | Schema comparisons between two scopes; see [Comparisons](#comparisons) |
| `migrations` | MigrationTrack[] | Migration history and status per scope; see [Migrations](#migrations) |
| `inferredAssociations` | InferredAssociation[] | Associations foreign keys imply without a declared relationship; see [Inferred associations](#inferred-associations) |
| `extensions` | object, optional | See [Extensions](#extensions) |

Host-specific viewer settings (changes since the last build, prepared downloads, editor links, the connection to open
on) are not part of the document; hosts pass them beside it as `ViewerConfig`.

## Source modes

| `source` | Tables, columns, indexes, foreign keys, constraints | Models and relationships | `provenance` allowed | Connection `coverage` |
|---|---|---|---|---|
| `declared` | From ORM metadata | From ORM metadata | `["declared"]` | `declared` set, `database` null |
| `database` | From database introspection | None | `["database"]` | `database` set, `declared` null |
| `combined` | Database introspection, matched with ORM metadata | From ORM metadata | any | both set |

In `combined` mode the database is authoritative for everything it inspected:

- An entity both sources report has `provenance: ["database", "declared"]`; its fields hold the database's values, and
  each field the ORM disagrees on is listed in `drift` as `{ field, database, declared }`, with a `drift` diagnostic.
- An entity only the ORM declares (a foreign key the database does not enforce, a column it lacks) stays in the
  document with `provenance: ["declared"]` and a `declared_only` reconciliation diagnostic. It is never presented as a
  physical structure: viewers mark it and exporters leave it out of DDL.
- An entity only the database has carries `["database"]`, with a `database_only` or `table_without_model` diagnostic
  where the producer reconciles it.
- Missing database metadata is never filled in from declarations.

### Coverage

Each connection's `coverage` has one entry per source: `{ complete, schemas, features }`.

- `features` maps each feature (`tables`, `columns`, `columnTypes`, `defaults`, `comments`, `primaryKeys`,
  `foreignKeys`, `referentialActions`, `indexes`, `indexExpressions`, `indexPredicates`, `includedColumns`,
  `uniqueConstraints`, `checkConstraints`, `models`, `relationships`) to `complete`, `partial`, `unavailable` or
  `not_applicable`. A feature left out is unknown.
- `complete` is true only when every listed feature is `complete` or `not_applicable` and every schema in scope was
  read. The validator rejects `complete: true` beside a `partial` or `unavailable` feature.
- `schemas` lists the schemas read, or null when the source has no notion of them.
- Why a feature is partial or unavailable is an `inspection` diagnostic.

## Connections and tables

A document is multi-connection: `connections` holds every named database connection (or ORM bind) the producer read,
each with its own driver, default schema, coverage and tables, in any mix of dialects. A single-connection document is
the one-element case; nothing in the contract assumes there is only one.

**Connection** `{ id, name, driver, defaultSchema, coverage, tables, extensions? }`. `name` is unique. `driver` is the
lower-case dialect, or null when the source does not know it. The list is open, but these databases have one
spelling: `postgresql`, `mysql`, `mariadb`, `sqlite`, `sqlsrv`, `oracle`. Producers map framework names to them
(Laravel's `pgsql` is `postgresql`); the validator rejects the known aliases `pgsql`, `postgres`, `mssql` and
`sqlserver`.

- Table ids are unique across the whole document, so producers qualify them by connection (`analytics:users`). Table
  names, and schema-qualified names, may repeat across connections: `users` in two connections are two tables, told
  apart by id and never merged. Readers look tables up by id, never by name.
- A model's `tables` and a relationship's `table`, `relatedTable`, `pivot.table` and `through` may be in any
  connection: an ORM relationship may cross connections.
- A foreign key never crosses connections: its `foreignTable` is in the same connection as the table that declares it,
  because a constraint lives in one database. The validator rejects a foreign key to a table in another connection
  (`Foreign key crosses connections`).

**Table** `{ id, name, schema, comment, note, owner, primaryKey, columns, indexes, foreignKeys, constraints, provenance,
drift?, extensions? }`

- `schema` null means unqualified (resolved through `defaultSchema`), not a guess at the default.
- `owner` is `{ kind: application | framework | package, package }`, for tables a framework or a package owns.
- `primaryKey` lists the key columns in key order; empty when there is none.
- `comment` is the database's (or ORM's) comment; `note` is a project note from the producer's configuration.

**Column** `{ name, type, typeName, nullable, autoIncrement, timezone, collation, enum, default, ormDefault, generated,
comment, note, provenance, drift?, extensions? }`

- `type` is the full type as the source spells it; `typeName` the base name, or null.
- `autoIncrement` null means the database or ORM decides.
- `enum` is `{ name, values }`: the values in declaration order, and the named type when the database has one.
- `default` is the database default; `value` is always SQL text, so a literal keeps its type (`'draft'`, `0`, `true`,
  `NULL`). `kind` is `literal`, `expression`, `sequence`, `identity` or `raw` (unclassified text).
- `ormDefault` is a default the ORM applies in application code: `scalar`, `callable` (named, never called during
  extraction), `sequence` or `expression`.
- `generated` is `{ kind: stored | virtual | null, expression }` for generated columns.

## Indexes

Indexes are first-class entities, never drawn as graph nodes by default.

**Index** `{ id, name, parts, expression, unique, backs, method, partial, predicate, included, dialectOptions?,
provenance, drift?, extensions? }`

- `parts` lists every key part in order. A part is a column or an expression, never both:
  `{ column, expression, order, nulls, length, collation, opclass }`, with `order` `asc`/`desc`, `nulls` `first`/`last`,
  `length` a prefix length (MySQL `name(10)`), and `opclass` an operator class (PostgreSQL `text_pattern_ops`).
- `expression` is true when any key part is an expression, including one whose text the source does not report (the
  part is then left out of `parts`).
- The primary key's index is the one with `backs.kind` `primary_key`: it is unique, has no expression parts, and
  its column parts are exactly the table's `primaryKey`.
- `backs` is the constraint the index enforces: `{ kind: primary_key | unique_constraint, constraint }`, where
  `constraint` is the unique constraint's id when the document has it as an entity. An index created on its own has
  `backs: null`, so a unique index and a unique constraint stay distinguishable.
- `method` is `btree`, `hash`, `gin`, `gist`, `brin`, `fulltext`, `spatial`, … or null.
- `partial` with `predicate` (the WHERE clause, or null when unknown); `included` lists INCLUDE columns.
- `dialectOptions` holds options declared per dialect, mostly by ORM metadata that targets several dialects:
  `{ postgresql: { predicate, method, included, options } }`. Neutral fields hold what applies everywhere.

## Constraints and foreign keys

**Constraint** `{ id, kind: unique | check, name, columns, expression, provenance, drift?, extensions? }`. A unique
constraint lists its columns; a check constraint has its expression and, when known, the columns it reads.

**ForeignKey** `{ id, name, columns, foreignTable, foreignColumns, onUpdate, onDelete, deferrable, initially,
provenance, drift?, extensions? }`

- `columns` and `foreignColumns` are ordered pairs; composite keys list several.
- Referential actions are upper-case SQL (`CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT`, `NO ACTION`), or null when
  not declared or not reported.
- A target table or column outside the document is allowed only with an `unresolved_foreign_key` diagnostic whose
  subject is the foreign key.
- The target table is in the same connection as the foreign key's table; see [Connections and tables](#connections-and-tables).

## Models and relationships

**Model** `{ id, className, tables, primaryKey, source, extensions? }`. A model maps to zero tables (unresolved, with a
diagnostic), one, or several (inheritance). `source` is `{ file, line }` relative to the project root.

**Relationship** `{ id, name, model, table, relatedModel, relatedTable, type, cardinality, collection, readOnly, keys,
pivot, polymorphic, through, join, constraints, inverse, note, source, extensions? }`

- `type` is the ORM's own word (`HasMany`, `MANYTOONE`, `@relation`, `ManyToOne`); `cardinality` is the neutral reading
  from the declaring model's side: `one-to-one`, `one-to-many`, `many-to-one`, `many-to-many`. `collection` is whether
  it holds a collection; `readOnly` whether the ORM writes through it.
- `keys` is oriented like a foreign key, whichever side declares the relationship: `from` holds the referencing
  columns, `to` the referenced ones.
- `pivot` is `{ table, parentColumns, parentPivotColumns, relatedColumns, relatedPivotColumns, columns }` for
  many-to-many: pivot columns reference the declaring side's `parentColumns` and the related side's `relatedColumns`;
  `columns` are extra pivot columns the relationship exposes.
- `polymorphic` is `{ typeColumn, idColumn, typeValue }`. A polymorphic relationship with no single target has
  `relatedModel` and `relatedTable` null.
- `through` lists the intermediate table ids of a through relationship, in order; such a relationship has no `keys`.
- `join` keeps join conditions as the ORM states them, `{ primary, secondary }`; `constraints` keeps extra query
  constraints as text.
- `relatedModel` null without `polymorphic` requires an `unresolved_relationship` diagnostic.

## Graph

`links` and `derivedLinks` are stored in the document. Producers build them with the shared rules below. The TypeScript
`buildGraph()` implements them, and `contract/conformance/graph/` holds the cases every implementation must pass.

1. Every foreign key whose endpoints resolve (the target table and every column are in the document, in the foreign
   key's own connection) is a link from its columns to the referenced columns. A foreign key naming a table in another
   connection, which a valid document never has, has no link.
2. Every relationship's `keys` are a link the same way. Keys equal to a foreign key's, compared as unordered column
   pairs, join that foreign key's link; otherwise the link has no foreign key. A relationship never creates a
   constraint.
3. A pivot relationship is two links, both from the pivot table: `parentPivotColumns → parentColumns` on the
   relationship's `table`, and `relatedPivotColumns → relatedColumns` on its `relatedTable`.
4. A through relationship is a derived link `{ from: table, to: relatedTable, via: through, relationship }`, never
   matched to a foreign key.
5. Nothing without resolvable endpoints has a link. Links come only from foreign keys within a connection and from
   relationships; a relationship whose ends are in two connections is a `relationship` link and never gains a
   foreign key.
6. When several foreign keys have the same column pairs, the smallest id stands for them; a link's endpoints follow
   its foreign key's column order, or the first relationship's when there is none.
7. `state` is `both`, `foreign_key` or `relationship`; `polymorphic` is true when any of its relationships is;
   `relationships` is sorted; `note` is the note of the first relationship, by id, that has one.
8. Ids: a link is `"l"` + the first 16 hex digits of the SHA-256 of the compact JSON
   `["link", fromTable, toTable, pairs]`, where `pairs` are the `[fromColumn, toColumn]` pairs sorted by code point. A
   derived link is `"d"` + the same digest of `["derived", relationshipId]`. Compact JSON has no whitespace, and
   neither slashes nor non-ASCII characters are escaped: Python `json.dumps(v, separators=(",", ":"),
   ensure_ascii=False)`, PHP `json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)`.
9. Links and derived links are sorted by id.

## Diagnostics

**Diagnostic** `{ id, kind, category, severity, certainty, subject, message, extensions? }`

- `id` is `"n"` + the first 16 hex digits of the SHA-256 of `["diagnostic", kind, subject.type, subject.id,
  subject.columns, message]`, so two equal diagnostics cannot both be listed and gate reports can name one.

- `category`: `extraction` (ORM metadata could not be read), `inspection` (database metadata could not be read),
  `reconciliation` (one source has what the other lacks), `drift` (both have it and disagree), `lint` (advice).
- `severity`: `error`, `warning`, `info`. `certainty`: `certain` for a confirmed fact read from metadata, `likely` for
  a heuristic recommendation inferred from names, conventions or usage. Viewers show the two apart.
- `subject`: `{ type, id, columns, label }`, where `type` is `document`, `connection`, `table`, `column`, `index`,
  `foreignKey`, `constraint`, `model`, `relationship`, `link`, `comparison`, `migration` or `inferredAssociation`.
  For `column`, `id` is the table's id and `columns` names at least one column; other subjects may name columns as
  context. `id` is null for `document`, and must exist in the document otherwise, except for `unresolved_*` kinds,
  which name what is missing. A `link` subject may be a link or a derived link.
  `label` is a readable name for when the id does not resolve.
- Named kinds producers share (open list): `unresolved_foreign_key`, `unresolved_relationship`, `unsupported_metadata`,
  `inspection_unavailable`, `model_without_table`, `table_without_model`, `declared_only`, `database_only`,
  `column_drift`, `index_drift`, `foreign_key_drift`, `missing_index`, `duplicate_index`, `redundant_index`,
  `relationship_without_foreign_key`, `foreign_key_without_relationship`, and for the sections below
  `comparison_incomplete` (inspection, subject `comparison`; exactly as [Storing comparisons](#storing-comparisons)
  defines it), `migration_history_unavailable` (extraction),
  `migration_version_table_unreadable` (inspection), `migration_multiple_heads` (lint),
  `migration_unknown_revision` (reconciliation), all with subject `migration`, and `inference_ambiguous` (lint,
  subject `inferredAssociation`).

## Comparisons

A comparison lists how one scope's schema differs from another's: two tenant schemas of one connection, a
connection against another (a primary and a replica, PostgreSQL against MySQL), or a release against production.
Producers compute it with the algorithm below, which `compareScopes()` implements and
`contract/conformance/comparison/` checks. Viewers display stored comparisons and never compute them.

**Scope** `{ connection, schema }`: a connection id, and a schema of it or null. A table is in scope when its schema
equals `schema`, or is null while the connection's `defaultSchema` equals `schema`. With `schema` null, the tables
whose schema is null or the default schema are in scope. A scope must not hold two tables of one name.

**Comparison** `{ id, baseline, target, complete, omitted, summary, differences, extensions? }`

- `id` is `"c"` + the digest of `["comparison", baseline.connection, baseline.schema, target.connection,
  target.schema]`. The two scopes differ.
- `summary` `{ missing, extra, changed }` counts every difference found, listed or not; `omitted` is how many were
  left out of `differences` (a producer's limit, in difference order). The validator checks `summary` sums to
  `differences.length + omitted` and covers the listed ones.
- `complete` is true exactly when `omitted` is 0 and neither side has a [coverage gap](#coverage-gaps). An
  incomplete comparison is never reported as passing; see [Gate reports](#gate-reports).

**Difference** `{ id, change, objectType, key, baseline, target, fields, severity, certainty, extensions? }`

- `change`: `missing` (in the baseline, not the target; `target` null), `extra` (in the target only; `baseline`
  null), `changed` (both sides; `fields` lists the differing fields, sorted by `field`, at least one). Missing and
  extra differences list no fields, and a missing or extra table's contents are not listed.
- `objectType`: `table`, `column`, `primaryKey`, `index`, `foreignKey`, `constraint`.
- `key` is the normalized identity both sides share. It is built from object names and never from a schema name, so
  tenant schemas are never drift. Its first element is the name of each side's table, and a column difference's
  second is a column of each side's table; the validator checks both. A table, column or index may itself be named
  like a compared schema.
- `baseline` and `target` are refs `{ table, id, label }`: the table id in that side's scope; `id` the index,
  foreign-key or constraint id (null for table, column and primary-key differences); `label` the readable name:
  `schema.table` (or `table`), with `.column`, ` primary key`, or `.name` (`.definition` when unnamed).
- `id` is `"x"` + the digest of `["difference", comparisonId, objectType, key]`.
- Differences are sorted by object type in the order above, then `key` element-wise, then change (`missing`,
  `extra`, `changed`).

### Coverage gaps

A side's coverage gaps say why it cannot be compared completely (`coverageGaps(document, scope)`;
`contract/conformance/coverage-gaps/` checks them). The side's coverage is its connection's `database` coverage, or
`declared` coverage in a `declared` document. The gaps, in this order:

1. `{ kind: "coverage_unknown" }` when that coverage is null; it is then the only gap.
2. `{ kind: "feature", feature, state }` for each feature the comparison reads whose state is not `complete` or
   `not_applicable`, in this order: `tables`, `columns`, `columnTypes`, `defaults`, `comments`, `primaryKeys`,
   `foreignKeys`, `referentialActions`, `indexes`, `indexExpressions`, `indexPredicates`, `uniqueConstraints`,
   `checkConstraints` (`COMPARISON_FEATURES`). `state` is `partial`, `unavailable`, or `unknown` for a feature the
   coverage leaves out. `not_applicable` is never a gap, nor is any other feature (`includedColumns`, `models`,
   `relationships`).
3. `{ kind: "schema_not_read", schema }` when the scope's schema (`schema`, else the connection's `defaultSchema`)
   and the coverage's `schemas` are both known and `schemas` does not list it.

A side is covered (`scopeCovered()`) when it has no gaps. Messages spell a gap as `coverage unknown`,
`{feature} {state}` or `schema {schema} not read` (`coverageGapText()`).

### Requested comparisons

Users ask for comparisons by connection **name**, as they configure them:
`{ baseline: { connection, schema }, target: { connection, schema } }`, with `schema` a schema or null for the
unqualified scope. Producers resolve their configured comparisons, and the gate its requested ones, with
`expandComparisonRequests(document, requests)` (`contract/conformance/requests/` checks it), which returns
`{ pairs, errors }` and never throws:

- Requests are taken sorted by baseline connection name, baseline schema, target connection name and target schema
  (null before any string, strings in code point order). A request equal to an earlier one (same names and schemas)
  is not expanded again and gives one `duplicate` error, however often it repeats: `Requested comparison {request} is
  listed more than once.`
- Each connection name the document does not have gives an `unknown_connection` error, once per name: `Requested
  comparison {request} names connection {name}, which the document does not have.` Nothing more is done for that
  request.
- A target schema `"*"` (`WILDCARD`) stands for every schema the target connection's coverage (as for
  [coverage gaps](#coverage-gaps)) lists in `schemas`, each once, in code point order, leaving out the baseline's own
  scope: on the same connection, the schema equal to the baseline's, or, with a null baseline schema, the
  connection's `defaultSchema`. Coverage or its `schemas` null: a `no_schemas` error, `Requested comparison
  {request} cannot be expanded: the inspection of connection {name} lists no schemas.` Nothing left: a `no_match`
  error, `Requested comparison {request} matches no schema.` Only a target expands: `"*"` in a baseline is an
  ordinary schema name. A wildcard never yields a null schema.
- Any other request is one pair: both names resolved to connection ids, schemas as given. Expansion consults neither
  coverage nor the stored comparisons.
- When an explicit request and a `"*"` expansion give the same pair, the pair is listed once with the explicit
  request, and that is no error. No other two different requests can give one pair.
- `pairs` `{ baseline, target, request }`: the scopes (connection ids) and the request that gave them, sorted by
  baseline connection id, baseline schema, target connection id and target schema (null first). `errors`
  `{ kind, request, message }`, in the order of the sorted requests, a request's own errors in the order above.

`{request}` spells each scope as `name` or `name:schema` (the request's own names and schemas, so `name:*` for a
wildcard), baseline and target joined by ` → ` (U+2192 with single spaces). A producer reports every error as a
configuration error and writes no comparison for that request. A request whose two scopes are equal is a
configuration error producers reject when they read their configuration; expansion passes it through.

### The comparison algorithm

In a combined document only entities whose provenance includes `database` take part. SQL text is compared
normalized: lower case; the side's own schema qualifier removed (`tenant_a.f(x)` and `"tenant_a".f(x)` become
`f(x)`); on MariaDB `octet_length(` read as `length(`; casts (`::type`) removed; whitespace, parentheses, backticks and
double quotes removed.

1. **Tables** match by name. Key `[table]`. A matched table's field: `comment`.
2. **Columns** of matched tables match by name. Key `[table, column]`. Fields, each compared as stated:
   - `type`: on two connections with the same non-null driver, the text lower-cased with whitespace collapsed
     (certain); otherwise the normalized type (likely): lower case, whitespace collapsed, `unsigned`/`signed`/
     `zerofill` dropped, the base name mapped through the synonyms below, `timestamp` with `timezone: true` as
     `timestamptz`, `tinyint(1)` as `boolean`, and arguments dropped for integer types and `double(53)`. A type that
     does not parse compares by its collapsed text.
   - `nullable`; `default`: identity and sequence defaults, and no default with `autoIncrement: true`, are one value
     (`auto`), whatever the sequence; other defaults compare as normalized SQL (likely); `collation`, when both are
     known, case-insensitively; `enum` values in order; `generated` kind and normalized expression (likely);
     `comment`.
3. **Primary key**: `[table]`, compared by its ordered columns. Missing when only the baseline has one, extra when
   only the target has one, else field `columns`.
4. **Indexes** match by name, then the rest by signature, `unique ` (when unique) + `(` + the parts joined by `,` +
   `)`, a part being its column or `expr:` + normalized expression, with ` desc` for descending order, and `,?` for
   an expression part the source did not report. Indexes backing the primary key, or a unique constraint present as an
   entity, are compared as those, not as indexes. Keys: `[table, "name", name]` for a name match or an unmatched
   named index, `[table, "parts", signature]` otherwise. Fields: `name` (signature match, both named), `unique`,
   `parts` (the signature without `unique`), `method` (both known, case-insensitive), `predicate` (partial flag or
   normalized predicate; likely), `included` (as sets). A `parts` change involving an expression part is likely.
5. **Foreign keys** match by signature `columns,…->referencedTableName(referencedColumns,…)` (the referenced table by
   name, never id or schema), then the rest by name. Keys: `[table, "references", signature]` for a signature match,
   `[table, "name", name]` for a name match or an unmatched named key, else the signature form. Fields: `name`
   (signature match, both named); `columns`, `foreignTable` (the name), `foreignColumns` (name match); `onDelete`,
   `onUpdate`, where null is `NO ACTION` and, when either side is MySQL or MariaDB, `RESTRICT` is `NO ACTION`;
   `deferrable` and `initially` when both are known. Certain.
6. **Constraints** match by kind and name, then the rest by kind and definition (a unique constraint's columns joined
   by `,`, else the normalized expression). Keys: `[table, kind, "name", name]` or `[table, kind, "definition",
   definition]`. Fields: `columns` (unique, name match), `expression` (check, name match; likely), `name` (definition
   match, both named).
7. Pairs within a pass are made in entity-id order. Keys that still coincide (unnamed duplicates) get `"#2"`, `"#3"`,
   … appended in the order of their entity ids.

Certainty: missing and extra differences are `certain`; a changed one is `likely` when any of its fields was compared
as normalized text as marked above, else `certain`.

Type synonyms: `int`, `int4`, `integer`, `mediumint`, `serial` → `integer`; `bigint`, `int8`, `bigserial` → `bigint`;
`smallint`, `int2`, `smallserial` → `smallint`; `tinyint`; `bool`, `boolean` → `boolean`; `character varying`,
`varchar`, `nvarchar` → `varchar`; `character`, `char`, `bpchar`, `nchar` → `char`; `text`, `clob` → `text`;
`datetime`, `timestamp`, `timestamp without time zone` → `timestamp`; `timestamptz`, `timestamp with time zone` →
`timestamptz`; `time without time zone` → `time`; `time with time zone`, `timetz` → `timetz`; `float`, `float8`,
`double`, `double precision` → `double`; `real`, `float4` → `real`; `numeric`, `decimal` → `numeric`; `blob`,
`bytea`, `varbinary`, `largebinary` → `blob`.

### Severity

Producers assign severity from these defaults and let users override them per `(objectType, change)` or
`(objectType, change, field)`; a field override wins over a general one. A changed difference takes its most severe
field.

| Object | missing / extra | changed |
|---|---|---|
| table | error | info (`comment`) |
| column | error | warning; `comment`: info |
| primaryKey | error | error |
| index, foreignKey, constraint | warning | warning |

An override is `{ objectType, change, field, severity }`, `field` optional (absent or null for a general override).
The fields a changed difference can list, from the algorithm above, are exactly the fields an override may name
(`DIFFERENCE_FIELDS`):

| Object | Fields |
|---|---|
| table | `comment` |
| column | `collation`, `comment`, `default`, `enum`, `generated`, `nullable`, `type` |
| primaryKey | `columns` |
| index | `included`, `method`, `name`, `parts`, `predicate`, `unique` |
| foreignKey | `columns`, `deferrable`, `foreignColumns`, `foreignTable`, `initially`, `name`, `onDelete`, `onUpdate` |
| constraint | `columns`, `expression`, `name` |

`validateSeverityOverrides(overrides)` returns these errors, empty when the overrides are valid
(`contract/conformance/overrides/` checks them); `{i}` is the override's index. Producers reject a configuration
with any of them, and `compareScopes()` throws `Invalid severity overrides: {errors joined by "; "}`.

| Rule | Message |
|---|---|
| Not an array | `overrides must be an array` (the only error) |
| An entry that is not an object | `overrides[{i}] must be an object` (nothing more for it) |
| Keys other than the four | `overrides[{i}] has unknown keys: {keys}`, sorted, joined by `, ` |
| `objectType` not an object type | `overrides[{i}].objectType must be one of table, column, primaryKey, index, foreignKey, constraint` |
| `change` not a change | `overrides[{i}].change must be one of missing, extra, changed` |
| `severity` missing or not a severity | `overrides[{i}].severity must be one of error, warning, info` |
| `field` neither a string nor null | `overrides[{i}].field must be a string or null` |
| A field with a valid `change` other than `changed` | `overrides[{i}].field applies only to changed differences, not {change}` |
| A field the valid `objectType` does not have, on `changed` | `overrides[{i}].field must be one of {fields} for objectType {objectType}` |
| The `(objectType, change, field)` of an earlier override `{j}`, both valid in those three | `overrides[{i}] repeats overrides[{j}]` |

Errors are listed per override in index order, each override's in the order of the table. A field is judged only
against a valid object type and change.

### Storing comparisons

A producer writes the comparisons it computed into a document with `storeComparisons(document, comparisons)`
(`contract/conformance/store/` checks it):

1. Two comparisons with one id are an error (`Comparison {id} is listed more than once`).
2. Stored comparisons with the id of a new one are dropped, with every diagnostic whose subject is such a comparison
   (`subject.type` `comparison`, whatever its kind). Other comparisons and diagnostics are kept.
3. Each new comparison is added with its diagnostics (`comparisonDiagnostics(document, comparison)`, checked by
   `contract/conformance/comparison-diagnostics/`): none when it is complete, else one `comparison_incomplete`
   diagnostic:
   - `category` `inspection`, `severity` `warning`, `certainty` `certain`;
   - `subject` `{ type: "comparison", id: <the comparison id>, columns: null, label }`, `label` being
     `{baseline}={target}`, each scope spelled `name` or `name:schema` with its connection's name;
   - `message` `Comparison {label} is incomplete: {reasons}`, the reasons joined by `; `: first `{omitted} of
     {total} differences are left out by the limit of {listed}` when `omitted` > 0 (`total` the summary's sum,
     `listed` the number of listed differences, which is the limit applied); then `the baseline {scope} is not
     completely covered ({gaps})` and `the target {scope} is not completely covered ({gaps})` for each side with
     [coverage gaps](#coverage-gaps), the gaps spelled as there and joined by `, `. (A comparison stored as incomplete
     with neither reason, which the algorithm never produces, gets `Comparison {label} is incomplete`.)
   - `id` by the [diagnostic id rule](#diagnostics).
4. Comparisons are sorted by id; diagnostics by `(category, kind, subject.type, subject.id, message)`, a null subject
   id as the empty string, strings in code point order, and a diagnostic id listed once (the first in that order).
   Nothing else in the document changes.

Storing the comparisons a document already holds gives the same document.

## Migrations

A migration track is one migration tool's history and the database's position in it, for one scope (`connection`,
`schema`, as for comparisons): one track per tenant schema when each tenant has its own version table. Producers
compute `status`, `pending` and `unknownRevisions` with the rules below (`migrationState()`,
`contract/conformance/migrations/`); the validator recomputes them, and viewers display them.

**MigrationTrack** `{ id, provider, connection, schema, versionTable, history, current, status, pending,
unknownRevisions, coverage, extensions? }`

- `id` is `"m"` + the digest of `["migration", provider, connection, schema]`. `provider` is the tool, lower case
  (`alembic`; open).
- `versionTable` is the version table's id, in the track's scope, or null when the database has none; then `current`
  is `[]`.
- `history` `{ revisions, heads, missing }` or null when the scripts could not be read. `revisions` are `{ id,
  parents, branchLabels }` sorted by id, with sorted parents and labels. `heads` are exactly the revisions no
  revision names as a parent (several when branches are not merged); `missing` the parents named but not present (a
  partial history, which is valid). Both sorted.
- `current` is the sorted revisions the version table records, `[]` when it records none, or null when it could not
  be read.

Status, in order (an ancestor-or-equal of `x` is `x` or any revision reachable through `parents`, missing ones
included):

1. `current` null: `unknown`.
2. `current` empty: `uninitialized`; `pending` is every ancestor-or-equal of a head (null when `history` is null or
   that includes a missing revision).
3. `history` null: `unknown`.
4. A current revision not in `revisions`: `unknown`, listed in `unknownRevisions` (sorted). It is never a validation
   error: a database ahead of the scripts is representable.
5. A current revision that is an ancestor of another current revision (an overlapping version table): `diverged`.
6. `pending`: the ancestors-or-equal of the heads that are no current revision's ancestor-or-equal, sorted. If it
   holds a missing revision: `unknown`. Otherwise `behind` when non-empty, `up_to_date` when empty (the current
   revisions are then exactly the heads).

`pending` is null whenever it cannot be determined (`unknown`, `diverged`); `unknownRevisions` is empty except in
rule 4.

**Coverage rows** `{ table, name, declared, autogenerate, migrationManaged, certainty, evidence }` say, per table,
whether it is under migration control, sorted by `(name, table)`. `table` is the table id in the track's scope, or
null for a table only migrations know (created and dropped). `declared`: an ORM model declares it. `autogenerate`
(`included`, `excluded`, `unknown`) is whether the tool's autogenerate compares it; `migrationManaged` (`yes`, `no`,
`unknown`) whether migration scripts create it. They are separate facts: `excluded` never means "not migrated". A
row with an `unknown` answer is `likely`. `evidence` `{ kind, detail }` (`create_table`, `drop_table`,
`include_filter`, `version_table`, `model`) is sorted by kind and detail.

## Inferred associations

An inferred association is what an uncovered foreign key implies between two ORM models that declare no
relationship over it. It is never a relationship, never adds or changes a link, and viewers present it as "inferred,
no ORM attribute declared". Producers compute them with the algorithm below (`inferAssociations()`,
`contract/conformance/inference/`); `check.mjs` recomputes them.

**InferredAssociation** `{ id, kind, model, relatedModel, table, relatedTable, via, cardinality, foreignKeys, links,
confidence, evidence, ambiguities, extensions? }`

- `id` is `"i"` + the digest of `["inferred", kind, sortedForeignKeyIds, via]`.
- `kind` `foreign_key` has one foreign key, `via` null, and cardinality `many-to-one` or `one-to-one` from the
  referencing model; `association_table` has two foreign keys, `via` the association table, and `many-to-many`.
- `foreignKeys` and `links` (the foreign keys' existing links) are sorted. No declared relationship covers any of the
  foreign keys: the validator rejects one whose link has relationships.
- `evidence` `{ kind, id, confirmed }`, sorted by kind and id: `foreign_key` (each foreign key), `primary_key` (the
  table id), `unique_constraint`, `unique_index`, `model_mapping` (each model mapping either table). `confirmed` is
  whether the fact was read from metadata: provenance includes `database`, or the document is `declared`. Model
  mappings are confirmed.
- `confidence` (`high`, `medium`, `low`) is the inference's: `high`, one level lower for each ambiguity and each
  unconfirmed foreign key, at most `low`. Confirmed evidence and inferred confidence are separate.
- `ambiguities` (sorted, open): `multiple_foreign_keys`, `self_reference`, `multiple_models`.

### The inference algorithm

1. Candidates are the links with a foreign key and no relationships (each link's foreign key stands for duplicates).
   A table is mapped when a model lists it; its models are taken in id order.
2. Keys of a table: its primary key; its unique constraints with columns; its unique indexes that are not partial,
   have no expression part and back neither the primary key nor a unique-constraint entity.
3. Association tables: for each unmapped table, each pair of its candidates (in foreign-key id order) with disjoint
   columns whose union is exactly a key of the table, both referenced tables mapped, is an `association_table`
   between the first and second referenced tables, with the matching keys as evidence. Their foreign keys are used.
4. Every other candidate whose table and referenced table are both mapped is a `foreign_key` inference from its
   table: `one-to-one` when its columns are exactly a key of its table (the keys are evidence), else `many-to-one`.
   `multiple_foreign_keys` when more than one foreign-key link goes from its table to the referenced table.
5. `self_reference` when both tables are one; `multiple_models` when either is mapped by several models (`model` and
   `relatedModel` are then the smallest ids). Nothing involving an unmapped table is inferred, apart from step 3.

## Gate reports

A gate checks a document in CI and prints a `laranex-schema-gate` report, a separate format with its own JSON Schema
(`contract/gate-report.schema.json`) and validator (`validateGateReport()`). Every producer's gate follows the rules
below, which `gateDocument(input, { thresholds, requested })` implements and `contract/conformance/gate/` checks:
equal inputs give byte-equal reports in canonical form (see [Canonical serialization](#canonical-serialization)). A
gate reads only the document: never a database, ORM metadata or application code.

`{ format: "laranex-schema-gate", version: "1.0", passed, exitCode, thresholds, requested, comparisons, counts,
findings, errors }`

### Input

- **The document**, as parsed JSON. Input that could not be parsed is reported, not thrown (`gateDocument(undefined)`).
- **Thresholds** `{ severity, certainty }`, each defaulting separately to `warning` and `certain`. A finding
  **qualifies** when its severity is at least `severity` (`info` < `warning` < `error`) and, with certainty
  `certain`, it is certain; with `likely`, certain and likely findings both qualify.
- **Requested comparisons**, a list of `{ baseline: { connection, schema }, target: { connection, schema } }`, empty
  or absent when none was requested or configured, as in [Requested comparisons](#requested-comparisons)
  (connection names; a target schema `"*"`). The report's `requested` lists them without duplicates, sorted by
  baseline connection, baseline schema, target connection and target schema (null before any string).

### Validation

The gate validates the document itself before anything else, in this order; the first that applies gives one
`invalid_document` error, and the report then has no other error, no findings and no checked comparisons:

| Input | `invalid_document` message |
|---|---|
| Not parseable as JSON | `The input could not be parsed as JSON.` |
| Not an object with `format` `"laranex-schema"` and a string `version` | `The input is not a laranex-schema document.` |
| `version` whose text before the first `.` is not `2` | `The document is laranex-schema {version}; the gate reads 2.x.` |
| `"2.0"` failing strict validation, or a newer `2.x` failing lenient validation | `The document fails laranex-schema {version} validation.` |

A valid document of a newer minor (any `2.x` other than `2.0`), which only lenient validation accepted, is checked as
below with the error `validation_incomplete`: `The document is laranex-schema {version}; only 2.0 is validated
strictly, so what {version} adds was not checked.` The validator's own messages are not part of the report; a gate
prints them beside it.

### Checked comparisons

- No requested comparisons: every stored comparison is checked. Zero comparisons is valid.
- Requested comparisons: **only** the requested ones are checked; other stored comparisons are neither findings nor
  errors. The gate expands the report's `requested` (so without duplicates) with
  [`expandComparisonRequests`](#requested-comparisons); each of its errors is a `comparison_not_found` error with
  the same message. Each resulting pair must be a stored comparison with exactly those scopes (connection ids,
  schemas): otherwise `Requested comparison {pair} is not in the document.`

`{pair}` spells the pair's scopes by connection name, as `{request}` does. The report's `comparisons` lists the
checked comparisons' ids, sorted. Producers pass requests to the gate as configured; the gate expands them itself.

### Findings

`findings` `{ source, id, kind, severity, certainty, label, message }`. Only these are findings:

| Source | What | `id` | `kind` | Severity, certainty | `label` | `message` |
|---|---|---|---|---|---|---|
| `comparison` | Every listed difference of every checked comparison | The difference's | `<object_type>_<change>` in snake case: `column_changed`, `primary_key_missing`, … | The difference's | `{pair} · {ref}` | `Only in the baseline` (missing), `Only in the target` (extra), `Differs in {fields}` (changed) |
| `diagnostic` | Every diagnostic of category `drift` or `reconciliation` | The diagnostic's | The diagnostic's | The diagnostic's | See below | The diagnostic's `message` |
| `migration` | Every track with status `behind`, `diverged` or `uninitialized` | The track's | `migration_<status>` | `behind`, `diverged`: error, certain; `uninitialized`: warning, certain | `{connection} · {schema}`, or `{connection}` when `schema` is null | See below |

- A comparison finding's `{pair}` spells the comparison's scopes by connection name as above; `{ref}` is the
  difference's baseline label, or its target label when it has no baseline (an extra object); `{fields}` the
  changed fields in their stored order, joined by `, `.
- A diagnostic finding's label is the subject's `label` when not null; else the name its id resolves to in the
  document: a connection's name; a table as `{connection} · {table}` (`schema.table`, or `table`); a column as that
  plus `.` and the subject's columns joined by `, `; an index, foreign key or constraint as its table's form plus
  `.` and its name (its id when unnamed); a model's class name; a relationship as `{model class}.{name}`; a
  comparison's `{pair}`; a migration track's label. Otherwise the subject's id, or `document` for the document.
- Migration messages, with `{provider}` the track's provider:
  - `behind`: `{provider} revisions not applied: {pending}`, the pending revisions joined by `, `.
  - `diverged`: `The {provider} version table records overlapping revisions, one an ancestor of another:
    {current}`, the current revisions joined by `, `. This is the status rule's overlapping version table, not
    multiple heads (a `migration_multiple_heads` diagnostic, category `lint`, which is no finding).
  - `uninitialized`: `The database has no {provider} version table` when `versionTable` is null, else `The
    {provider} version table records no revision`.
  - `up_to_date` is no finding; `unknown` is an error.
- Nothing else is a finding. Diagnostics of category `extraction` (such as `unresolved_foreign_key`), `lint` and
  `inspection` never qualify and never fail the gate; an inspection diagnostic of severity `error` is an error (below).

Findings are sorted by source, id and kind. `counts` `{ findings, qualifying, error, warning, info }` count all
findings, the qualifying ones, and each severity.

### Errors

`errors` `{ kind, message }` say why the check is incomplete; an incomplete check never passes. The kinds are a closed
list:

| Kind | When | Message |
|---|---|---|
| `invalid_document` | See [Validation](#validation) | As listed there |
| `validation_incomplete` | A valid newer 2.x minor | As listed there |
| `comparison_not_found` | A requested comparison is not in the document | See [Checked comparisons](#checked-comparisons) |
| `comparison_incomplete` | A checked comparison with `complete` false | `Comparison {pair} is incomplete: {reasons}.`, or `Comparison {pair} is incomplete.` without reasons |
| `coverage_incomplete` | In a `database` or `combined` document, a connection whose `database` coverage has `tables` or `columns` other than `complete` (left out counts as `unknown`), or any feature `unavailable` | `Connection {name}: the database inspection is incomplete: {gaps}.` |
| `inspection_failed` | Each diagnostic of category `inspection` with severity `error` | `{kind} on {label}: {message}`, with the diagnostic's kind, finding label and message |
| `migration_unknown` | Each migration track with status `unknown` | `Migration track {label} ({provider}) has an unknown status: {reason}.` |

- `comparison_incomplete` reasons, joined by `; `: `{omitted} of {total} differences omitted` when `omitted` > 0
  (`total` the summary's sum); then `the baseline {scope} was not inspected completely` and `the target {scope} was
  not inspected completely` for each side with [coverage gaps](#coverage-gaps).
- `coverage_incomplete` gaps: `{feature} {state}` (`state` `unknown` when left out, as for
  [coverage gaps](#coverage-gaps)) for each failing feature in the [coverage](#coverage) feature order, joined by
  `, `. `partial` features other than tables and columns (a dialect's known limit, such as SQLite check
  constraints) and `not_applicable` ones never fail a connection; the comparisons that read them are judged by
  their own `complete`. `declared` coverage never fails the gate.
- `migration_unknown` reason, the first that applies: `the version table could not be read` (`current` null), `the
  migration scripts could not be read` (`history` null), `the database records revisions the scripts do not have:
  {unknownRevisions}` (joined by `, `), else `the history is missing revisions it needs`.

Errors are sorted by kind and message; equal errors are listed once.

### Exit code

| Exit code | When | `passed` |
|---|---|---|
| **2** | `errors` is not empty, whatever the findings | false |
| **1** | No error, and at least one finding qualifies | false |
| **0** | Otherwise (findings below the thresholds are still listed) | true |

## Extensions

`extensions` is an object keyed by a lower-case namespace (`eloquent`, `laravel`, `sqlalchemy`, `django`, `prisma`,
`typeorm`, `alembic`, …) holding any JSON object. It is allowed on the document, connections, tables, columns,
indexes, constraints, foreign keys, models, relationships, diagnostics, comparisons, differences, migration tracks
and inferred associations.

- Extensions carry what only one ORM or framework means, such as Eloquent casts, fillable attributes, SQLAlchemy's
  `autoincrement="ignore_fk"` or a Laravel hint's ignore rule.
- Anything with a neutral meaning goes in a neutral field, never only in an extension.
- Viewers render extensions generically, and may render a known namespace more richly. They never require one.

## Canonical serialization

Producers write the document as UTF-8 JSON with:

- object keys sorted recursively by Unicode code point;
- two-space indentation, `": "` after keys, no trailing spaces;
- slashes and non-ASCII characters unescaped;
- a trailing newline;
- no `undefined` or absent-versus-null ambiguity: required fields are always present, null when unknown.

Arrays keep the order this page gives them. Where it gives none, producers sort by id (tables within a connection,
models, relationships, comparisons, migration tracks, inferred associations), keep declaration order for columns and
key parts, and sort diagnostics by `(category, kind, subject.type, subject.id, message)`. "Sorted" strings are in
Unicode code point order; string lists compare element-wise, a prefix first. A document's revision is the SHA-256 of its canonical bytes
(`documentRevision()`).

## Changes from 1.0

For the record; nothing reads or converts 1.0.

- `version` is `"2.0"`; validators reject 1.x, and strict validation accepts exactly 2.0.
- New required arrays `comparisons`, `migrations`, `inferredAssociations` (empty allowed), with new diagnostic kinds and
  subject types `comparison`, `migration`, `inferredAssociation` (and `link` subjects may name derived links).
- Diagnostics have an `id` by rule, so reports can name one and duplicates are impossible.
- `Index.columns` is gone: it repeated the column parts of `parts`, and the validator had to keep them in step.
- `Index.primary` is gone: it repeated `backs.kind == "primary_key"`. The primary index must also have exactly the
  primary key's columns.
- `Connection.driver` has one spelling per database (`postgresql`, not `pgsql`), since comparisons depend on equal
  drivers; known aliases are rejected.
- A column diagnostic must name its columns.

## Checking a producer

```bash
npm install --no-save laranex-schema-viewer-ui@<version>
node node_modules/laranex-schema-viewer-ui/contract/check.mjs path/to/snapshot.json
```

`check.mjs` runs strict validation (which checks comparison ids, order and summaries and recomputes migration
statuses), compares the stored links and inferred associations with the shared builders, and checks canonical form.
Producers in other languages also run
`contract/conformance/{graph,comparison,requests,coverage-gaps,overrides,comparison-diagnostics,store,migrations,inference,gate}/*.json`
through their own implementations and `contract/fixtures/invalid/*.json` through their own validators, where they have them.
