# Roadmap

Planned work that is designed but not implemented. Each item lands as its own milestone with tests.

## Client-side schema export system

Export the `laranex-schema` document the viewer has loaded, entirely in the browser, with pure TypeScript. Schema data
never leaves the page.

### Priorities

| Priority | Format | Output |
|---|---|---|
| P1 | DBML | `.dbml`, as dbdiagram.io reads it |
| P2 | Mermaid ERD | `erDiagram` syntax (`.mmd`) |
| P2 | Markdown | Structured database documentation (`.md`) |
| P3 | SQL DDL preview | Dialect-aware DDL for PostgreSQL, MySQL/MariaDB and SQLite (`.sql`) |

### Architecture

- Exporters live in this package (`laranex-schema-viewer-ui/export`), consume only the unified contract, and run
  wherever the viewer runs. No backend conversion APIs, server-side exporters, database connections or external
  services.
- One interface for every format, so formats can be added without changing the viewer:

  ```ts
  type ExportOptions = { connections?: string[]; dialect?: 'postgresql' | 'mysql' | 'mariadb' | 'sqlite' };
  type ExportWarning = {
      code: string; // unsupported_feature, lossy_conversion, skipped_entity, …
      subject: { type: SubjectType; id: string | null; label: string | null };
      message: string;
  };
  type ExportResult = { content: string; warnings: ExportWarning[] };
  type Exporter = {
      id: string; // dbml, mermaid, markdown, sql
      label: string;
      extension: string;
      mediaType: string;
      export: (document: SchemaDocument, options?: ExportOptions) => ExportResult;
  };
  ```

- Exporters are pure and deterministic: the same document and options give the same bytes and the same warnings.
- The viewer gets an Export panel: format choice, a preview, the conversion warnings, copy to clipboard, and download.
- Host-prepared downloads (`ViewerConfig.downloads`) stay supported beside the built-in exporters.

### Rules every exporter follows

- Only physical foreign keys become references or constraints. ORM relationships are never turned into constraints. In
  a combined document, declared-only foreign keys are left out of DBML and DDL and reported. Mermaid and Markdown may
  show relationships, labelled as ORM declarations and kept apart from foreign keys.
- Composite primary keys, composite and expression indexes, unique and check constraints, composite foreign keys and
  schema namespaces are kept wherever the format can state them.
- Anything a format cannot state is reported as a warning, never dropped silently or approximated without saying so.
  This covers partial predicates, included columns, operator classes, collations, prefix lengths, sort and nulls order,
  index methods, deferrable constraints, generated columns, dialect options, polymorphic and through relationships,
  drift, and extensions.
- Nothing is invented: no default, constraint, index or type the document does not state.

### Formats

- **DBML (P1).** `schema.table`, columns and types, `pk`, `not null`, `unique`, `increment`, defaults (from the
  contract's SQL text, so literals keep their type), `note`s from comments and notes, `Enum`s, indexes (`[col,
  \`expr\`]` with `pk`, `unique`, `type`, `name`), checks, and `Ref`s with composite columns, names and
  `delete`/`update` actions.
- **Mermaid ERD (P2).** Entities with column types and `PK`/`FK`/`UK` markers. Foreign keys are drawn with crow's-foot
  cardinality worked out from nullability and uniqueness. ORM relationships, when included, are drawn as non-identifying
  relationships labelled as declarations. Long schemas can be split by connection.
- **Markdown (P2).** One section per connection and table: columns, keys, indexes, constraints, foreign keys, models,
  ORM relationships, notes, diagnostics, and coverage (what was and was not inspected).
- **SQL DDL preview (P3).** `CREATE SCHEMA`, `CREATE TYPE … AS ENUM` (PostgreSQL), `CREATE TABLE` with columns,
  defaults, generated columns, primary keys, unique and check constraints, `CREATE INDEX` (expressions, predicates,
  `INCLUDE`, methods, operator classes, collations, prefix lengths, order), and `ALTER TABLE … ADD FOREIGN KEY`, quoted
  for the chosen dialect. It is an informational preview, not migration output: it is headed with a comment saying so,
  is never run by the package, and warns when the document's dialect differs from the one chosen or when coverage is
  incomplete.

### Contract metadata the exporters rely on

All of this is already in the contract: connections, `schema` and `defaultSchema`; column `type` and `typeName`,
`nullable`, `autoIncrement`, `enum` (named type and values), `default` as SQL text (literal, expression, sequence,
identity), `generated`, `comment` and `note`; ordered `primaryKey`; index `parts` (column or expression, order, nulls,
length, collation, operator class), `unique`, `primary`, `backs`, `method`, `partial`, `predicate`, `included` and
`dialectOptions`; unique and check constraints; foreign keys with ordered columns, `onDelete`, `onUpdate`, `deferrable`
and `initially`; `provenance` and `coverage`, so exports can state what was inspected; relationships with
`cardinality`, `keys`, `pivot`, `polymorphic` and `through`.

Two additions are needed for complete DDL: a column-level `collation`, and table options such as engine, character set
or tablespace. The first becomes a contract field; table options go under `extensions` and are reported as lossy
unless the exporter knows the dialect key.

### Tests

Synthetic fixtures (the contract fixtures in `contract/fixtures/valid/`) with expected output and expected warnings for
each format. Where a reference parser is available as a development dependency (for example `@dbml/core` for DBML),
the output is parsed back and compared.

## Index analysis

The contract treats indexes as first-class entities: ordered key parts, expressions, predicates, included columns,
methods, dialect options, and whether an index backs the primary key or a unique constraint. It also reserves the
diagnostic kinds `missing_index`, `duplicate_index`, `redundant_index` and `index_drift`.

- A framework-neutral analyzer that producers run at build time, emitting those diagnostics.
- Confirmed facts, such as an exact duplicate or an index the database and the declarations disagree on, carry
  `certainty: "certain"`. Recommendations, such as a foreign key without a covering index or a likely redundant
  prefix, carry `certainty: "likely"`. The viewer shows the two apart.
- Shared conformance fixtures so Laravel, Python and Node.js producers agree.
