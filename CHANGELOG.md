# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Upgrading from 0.2.0

- Producers must write `laranex-schema` 2.0 documents: `version: "2.0"`, the three required arrays (empty when not
  produced), diagnostic ids, index `parts`/`backs` instead of `columns`/`primary`, and canonical driver names. Check a
  producer with `node contract/check.mjs` and the fixtures in `contract/fixtures/`.
- The viewer and validators reject 1.x documents; rebuild saved snapshots with a producer that writes 2.0.

### Changed

- **Breaking:** the contract is `laranex-schema` 2.0. Validators accept only 2.x (1.x is rejected with one clear
  error) and strict validation accepts exactly 2.0; nothing reads or converts 1.0. `docs/contract.md` lists every
  change under "Changes from 1.0".
- `Index.columns` and `Index.primary` are removed: the column parts of `parts` and `backs.kind: "primary_key"` say
  the same. The primary index must have exactly the primary key's columns.
- Diagnostics have a rule-based `id`; column diagnostics must name their columns.
- `Connection.driver` uses one spelling per database (`postgresql`, `mysql`, `mariadb`, `sqlite`, `sqlsrv`,
  `oracle`); aliases such as `pgsql` are rejected.

### Added

- Required document arrays `comparisons` (schema comparisons between two scopes, such as tenant schemas or
  connections on different drivers, with normalized identities, severity defaults and certainty), `migrations`
  (migration history and status per scope: `up_to_date`, `behind`, `diverged`, `uninitialized`, `unknown`, with
  partial histories, multiple heads, unknown revisions and autogenerate/migration coverage) and
  `inferredAssociations` (associations uncovered foreign keys imply, kept apart from relationships and links).
- Shared producer algorithms `compareScopes`, `migrationHistory`, `migrationState` and `inferAssociations` with
  conformance cases in `contract/conformance/{comparison,migrations,inference}/`; `check.mjs` also checks stored
  inferred associations. The viewer never computes these.
- The `laranex-schema-gate` CI report: `contract/gate-report.schema.json`, `validateGateReport()` and fixtures, with
  exit codes 0 (pass), 1 (qualifying drift) and 2 (incomplete or invalid check).
- The normative gate (`docs/contract.md`, "Gate reports") and its reference implementation `gateDocument(input,
  { thresholds, requested })`, with conformance cases in `contract/conformance/gate/`. Findings are only comparison
  differences, `drift` and `reconciliation` diagnostics, and `behind`, `diverged` and `uninitialized` migration
  tracks, each with an exact label and message; extraction, lint and inspection warnings never fail the gate. Errors
  (exit 2) are a closed list: `invalid_document`, `validation_incomplete` (a newer 2.x minor read leniently),
  `comparison_not_found` (a requested comparison, or a `*` expansion, that the document does not have),
  `comparison_incomplete`, `coverage_incomplete` (tables or columns not read completely, or a feature unavailable),
  `inspection_failed` and `migration_unknown`. When comparisons are requested only those are checked. Reports also
  list the `requested` and checked `comparisons`.
- Fixtures `comparison-tenant-schemas`, `comparison-multi-connection`, `comparison-incomplete`,
  `comparison-schema-named-tables` (tables, columns and indexes named like the compared schemas), `migrations-alembic`
  and `inferred-associations`, and invalid fixtures for each new rule.
- Viewer **Compare** tab for stored comparisons: baseline and target selectors built from the stored scopes (with a
  swap when the reverse comparison is stored), the baseline → target direction everywhere, summary counts, `omitted`
  and an incomplete-comparison warning with the coverage gaps, differences grouped as missing, extra and changed with
  baseline and target values side by side, filters by object type, change, severity and certainty, the connections'
  diagnostics, and links that open the affected table on the baseline or target side.
- Comparison marks on the diagram and in Details: missing, extra and changed tables, columns (kept visible on folded
  cards), indexes, foreign keys and constraints, each with a symbol and words; likely (heuristic) findings dashed and
  labelled apart from certain ones; a canvas note names the marked comparison and says when it is incomplete. Toggle
  them in Show → Comparison marks.
- Viewer **Migrations** tab: every migration track per connection and schema with its stored status (up to date,
  behind with the pending revisions, diverged in the contract's words, uninitialized, unknown with the reason),
  current revisions, expected heads, multiple-heads warnings, unknown and missing revisions, the version table, the
  track's diagnostics and its migration coverage. Revision status is kept apart from schema differences.
- Inferred associations: marked on the foreign-key edges they rest on (violet dash-dot, `FK · inferred`, own legend
  entry and toggle <kbd>5</kbd>) without drawing new edges; listed in Browse → Inferred, in table and edge details,
  and in their own details with cardinality, confidence, ambiguities and confirmed or unconfirmed evidence, always
  stating that no ORM relationship attribute is declared.
- Deep links `#view=compare&comparison=…&difference=…`, `#view=migrations&migration=…` and `#inferred=…`; shortcuts
  <kbd>X</kbd> (Compare), <kbd>M</kbd> (Migrations) and <kbd>5</kbd>; diagnostics about a comparison, migration track
  or inferred association link to it.

## [0.2.0] - 2026-10-17

### Added

- Complete multi-connection support. With every connection shown, each connection is laid out in its own labelled frame (name, driver, table count), in the diagram and in PNG and SVG exports. With one connection shown, tables on other connections that its relationships reach appear as dashed, non-editable reference nodes ("On connection …") that open the table on its own connection, so cross-connection relationships never disappear.
- Table labels name their connection whenever a document has more than one (`analytics · public.users`): cards, Browse, search, Details, edge details, the diagnostics panel, the phone sheet and exports. Tables with the same name, or the same schema and name, in two connections are always told apart.
- Relationships between connections are drawn as ORM-only edges marked `cross-connection`, and their details say no foreign key can enforce them.
- The standalone bundle ships a favicon from the Laranex mark: `dist/viewer/favicon.svg` and `favicon.ico` (a 32×32 PNG in an ICO container, generated byte-for-byte reproducibly by `scripts/favicon.mjs`), listed in `manifest.json` and linked from `index.html` by relative URLs.
- Synthetic fixtures `combined-multi-connection` (pgsql, mysql and sqlite connections, `users` in two of them, cross-connection relationships without foreign keys, per-connection coverage, drift on one connection) and `declared-multi-connection`; graph conformance cases `cross-connection-relationship`, `cross-connection-foreign-key` and `duplicate-table-names`; and the invalid fixture `foreign-key-across-connections`.

### Changed

- **Stricter validation:** the validator now rejects a foreign key whose target table is in another connection (`Foreign key crosses connections`), in strict and lenient mode alike, and `buildGraph()` never links one. Physical constraints live in one database; only ORM relationships may cross connections. A producer that wrote such a foreign key must drop it or write it as a relationship. Every 0.1.0 contract fixture stays valid, and the contract stays at `laranex-schema` 1.0. `docs/contract.md` now states that documents are multi-connection, foreign keys never cross connections, and relationships may.
- An unknown `#connection=` (or `defaultConnection`) id opens every connection instead of an empty diagram, and a `#table=` deep link to another connection opens that table's connection. Opening a table on another connection from search, Browse or Details switches to its connection instead of to all connections.
- The connection menu shows each connection's driver.

## [0.1.0] - 2026-10-17

### Added

- The viewer's layout follows Laravel Schema Viewer's, in this package's colors: a header with a schema-wide search (tables, columns, models, relationships), connection picker, Download menu, theme and Shortcuts; the diagram across the page with a minimap; a floating toolbar with zoom, fit, hand and select tools and the Relationships, Tables and Show menus; and one resizable side panel with Browse (Tables & Models, Relationships, Columns), Details, Diagnostics (facts apart from heuristics) and Changes tabs. Cards show model names, nullable marks, pivot tables, highlighted link columns and a fold chevron; edge labels carry their cardinality.
- Phones get Laravel's phone layout: a compact header with a ⋯ menu, the diagram across the screen, an icon toolbar, and the side panel as a bottom sheet.

- The unified `laranex-schema` 1.0 contract (`laranex-schema-viewer-ui/contract`): TypeScript types, a JSON Schema 2020-12 (`contract/schema.json`) generated from the same definitions as the runtime validator, strict (producer) and lenient (reader) validation with cross-reference rules, canonical serialization and revisions, and the shared graph builder for links and derived links.
- Declared, database and combined source modes with per-entity provenance, drift values and per-connection coverage.
- Indexes as first-class entities: ordered key parts (columns or expressions, with order, nulls, prefix length, collation and operator class), methods, partial predicates, included columns, dialect options, and the constraint an index backs.
- Synthetic contract fixtures (`contract/fixtures/valid`, `contract/fixtures/invalid`), graph conformance cases (`contract/conformance/graph`), and `contract/check.mjs` for checking any producer's output in CI.
- The shared viewer (`laranex-schema-viewer-ui`): a React component (`<SchemaViewer document={…} />`) with React Flow, ELK layout (left-right, snowflake, compact), orthogonal routing, pan, zoom, search, focus, connection and ownership filters, separate foreign-key and ORM layers drawn from the stored links, PK/FK/UK marks, an Indexes section (primary, unique, constraint-backing, composite, partial, expression, method, key-part order, nulls, collation, operator class, prefix length, INCLUDE, dialect options), constraints, foreign keys in and out, ORM relationships, models with editor links, diagnostics that tell facts from heuristics, provenance, drift and coverage indicators, generic extension rendering with per-namespace renderers, deep links, dark and light themes, and container-responsive layout.
- Laravel viewer interaction parity: four link-kind layers (FK + ORM, FK only, ORM only, through; keys 1–4), column folding to keys, all or names (C), notes on cards (N), relationship names everywhere or on the selection (L), your, framework and package table toggles (Y, G, P), connection stepping ([ ]), focus with depth 1–3 (double-click or Shift F), Shift-click and box selection to move several tables together, a select/pan mode switch and Space to pan, copying a link to the view (Shift C), and a shortcuts dialog (S).
- Image export (E): PNG or SVG of the whole diagram or the visible area, in the current theme. The PNG is painted straight onto a canvas, so it works under a Content-Security-Policy that allows no blob: or data: images.
- A guided tour (?), started only on request, spotlighting the diagram, a table, layers, search, details, tools and shortcuts.
- At 40% zoom and below, cards draw placeholder rows instead of text, so large schemas stay responsive.
- Resizable tables and details panels: drag their edges, or focus a handle and use the arrow keys, Home and End; double-click resets. Handles hide on phone-width layouts, where the details panel stacks below the diagram.
- The standalone bundle (`dist/viewer`): `app.js`, `app.css`, lazily loaded ELK and fonts, `index.html` and a `manifest.json` with file hashes. It reads the document from an inline JSON script, `window.__SCHEMA_VIEWER__` or a snapshot URL, defines the `<laranex-schema-viewer>` element, and runs under `script-src 'self'`.
- Contract documentation (`docs/contract.md`) and the roadmap for client-side exports and index analysis (`ROADMAP.md`).

[Unreleased]: https://github.com/laranex/schema-viewer-ui/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/laranex/schema-viewer-ui/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/laranex/schema-viewer-ui/releases/tag/v0.1.0
