# The `laranex-schema` contract, version 1.0

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
  foreign keys, constraints, models, relationships, links), and refers to others by id. Consumers
  compare ids; they never parse them.
- **Deterministic bytes.** Equal schemas serialize to equal bytes: no timestamps, canonical key order, specified array
  order.

## Versions

`format` is `"laranex-schema"`; `version` is `"major.minor"`, currently `"1.0"`.

- A minor version only adds optional fields or new enum-like string values documented as open (diagnostic kinds,
  relationship types). A major version is any other change.
- Producers validate strictly against the version they write (`validateDocument(doc, { strict: true })`): unknown
  properties are errors.
- Readers accept every minor version of their major and ignore properties they do not know (the default, lenient
  mode). A reader rejects other majors with a clear error.

## Document

| Field | Type | Meaning |
|---|---|---|
| `format` | `"laranex-schema"` | |
| `version` | string | `"1.0"` |
| `source` | `declared` \| `database` \| `combined` | See [Source modes](#source-modes) |
| `generator` | `{ name, orm }` | The producing package and the ORM (null for database-only). No versions or times, so upgrading a producer does not change equal schemas' bytes |
| `note` | string \| null | The project's note |
| `connections` | Connection[] | Database connections or ORM namespaces, each with its tables |
| `models` | Model[] | ORM models |
| `relationships` | Relationship[] | ORM-declared relationships |
| `links` | Link[] | Graph edges between column sets; see [Graph](#graph) |
| `derivedLinks` | DerivedLink[] | Through relationships as edges |
| `diagnostics` | Diagnostic[] | What could not be read, what disagrees, and advice |
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
dialect (`pgsql`, `postgresql`, `mysql`, `mariadb`, `sqlite`, `sqlsrv`, …) or null when the source does not know it.

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

**Index** `{ id, name, parts, columns, expression, unique, primary, backs, method, partial, predicate, included,
dialectOptions?, provenance, drift?, extensions? }`

- `parts` lists every key part in order. A part is a column or an expression, never both:
  `{ column, expression, order, nulls, length, collation, opclass }`, with `order` `asc`/`desc`, `nulls` `first`/`last`,
  `length` a prefix length (MySQL `name(10)`), and `opclass` an operator class (PostgreSQL `text_pattern_ops`).
- `columns` repeats the column parts' names in order, for convenience. The validator checks it.
- `expression` is true when any key part is an expression, including one whose text the source does not report (the
  part is then left out of `parts`).
- `primary` marks the primary key's index; it is unique and `backs.kind` is `primary_key`.
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

**Diagnostic** `{ kind, category, severity, certainty, subject, message, extensions? }`

- `category`: `extraction` (ORM metadata could not be read), `inspection` (database metadata could not be read),
  `reconciliation` (one source has what the other lacks), `drift` (both have it and disagree), `lint` (advice).
- `severity`: `error`, `warning`, `info`. `certainty`: `certain` for a confirmed fact read from metadata, `likely` for
  a heuristic recommendation inferred from names, conventions or usage. Viewers show the two apart.
- `subject`: `{ type, id, columns, label }`, where `type` is `document`, `connection`, `table`, `column`, `index`,
  `foreignKey`, `constraint`, `model`, `relationship` or `link`. For `column`, `id` is the table's id and `columns`
  names the columns. `id` must exist in the document, except for `unresolved_*` kinds, which name what is missing.
  `label` is a readable name for when the id does not resolve.
- Named kinds producers share (open list): `unresolved_foreign_key`, `unresolved_relationship`, `unsupported_metadata`,
  `inspection_unavailable`, `model_without_table`, `table_without_model`, `declared_only`, `database_only`,
  `column_drift`, `index_drift`, `foreign_key_drift`, `missing_index`, `duplicate_index`, `redundant_index`,
  `relationship_without_foreign_key`, `foreign_key_without_relationship`.

## Extensions

`extensions` is an object keyed by a lower-case namespace (`eloquent`, `laravel`, `sqlalchemy`, `django`, `prisma`,
`typeorm`, …) holding any JSON object. It is allowed on the document, connections, tables, columns, indexes,
constraints, foreign keys, models, relationships and diagnostics.

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
models, relationships), keep declaration order for columns and key parts, and sort diagnostics by
`(category, kind, subject.type, subject.id, message)`. A document's revision is the SHA-256 of its canonical bytes
(`documentRevision()`).

## Checking a producer

```bash
npm install --no-save laranex-schema-viewer-ui@<version>
node node_modules/laranex-schema-viewer-ui/contract/check.mjs path/to/snapshot.json
```

`check.mjs` runs strict validation, compares the stored links with the shared graph builder, and checks canonical
form. Producers in other languages also run `contract/conformance/graph/*.json` through their own graph builders and
`contract/fixtures/invalid/*.json` through their own validators, where they have them.
