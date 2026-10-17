# Roadmap

Planned work that is designed but not implemented. Each item lands as its own milestone with tests.

## Client-side schema export system

Delivered: the `laranex-schema-viewer-ui/export` module (one `Exporter` interface; Mermaid ERD, DBML, Markdown and
scoped JSON, pure and deterministic, with warnings), the Download dialog with preview, warnings, copy and download,
image export fidelity, and the offline HTML page. See [Downloads and exports](./exports.md). What remains planned:

| Priority | Item |
|---|---|
| P3 | SQL DDL preview: dialect-aware DDL for PostgreSQL, MySQL/MariaDB and SQLite (`.sql`) |
| P3 | DBML `Enum` blocks for unnamed (inline) enums, and column-level checks |
| P3 | Markdown sections for diagnostics and models' sources, beside the ORM declarations it already lists |

- **SQL DDL preview.** `CREATE SCHEMA`, `CREATE TYPE … AS ENUM` (PostgreSQL), `CREATE TABLE` with columns,
  defaults, generated columns, primary keys, unique and check constraints, `CREATE INDEX` (expressions, predicates,
  `INCLUDE`, methods, operator classes, collations, prefix lengths, order), and `ALTER TABLE … ADD FOREIGN KEY`, quoted
  for the chosen dialect (`ExportOptions.dialect`, reserved for it). It is an informational preview, not migration
  output: it is headed with a comment saying so, is never run by the package, and warns when the document's dialect
  differs from the one chosen or when coverage is incomplete. It follows the same rules as the other exporters: only
  physical foreign keys, nothing invented, every loss warned.

## Index analysis

The contract treats indexes as first-class entities: ordered key parts, expressions, predicates, included columns,
methods, dialect options, and whether an index backs the primary key or a unique constraint. It also reserves the
diagnostic kinds `missing_index`, `duplicate_index`, `redundant_index` and `index_drift`.

- A framework-neutral analyzer that producers run at build time, emitting those diagnostics.
- Confirmed facts, such as an exact duplicate or an index the database and the declarations disagree on, carry
  `certainty: "certain"`. Recommendations, such as a foreign key without a covering index or a likely redundant
  prefix, carry `certainty: "likely"`. The viewer shows the two apart.
- Shared conformance fixtures so Laravel, Python and Node.js producers agree.
