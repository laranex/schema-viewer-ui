# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Planned as 0.2.0.

### Added

- Complete multi-connection support. With every connection shown, each connection is laid out in its own labelled frame (name, driver, table count), in the diagram and in PNG and SVG exports. With one connection shown, tables on other connections that its relationships reach appear as dashed, non-editable reference nodes ("On connection …") that open the table on its own connection, so cross-connection relationships never disappear.
- Table labels name their connection whenever a document has more than one (`analytics · public.users`): cards, Browse, search, Details, edge details, the diagnostics panel, the phone sheet and exports. Tables with the same name, or the same schema and name, in two connections are always told apart.
- Relationships between connections are drawn as ORM-only edges marked `cross-connection`, and their details say no foreign key can enforce them.
- Synthetic fixtures `combined-multi-connection` (pgsql, mysql and sqlite connections, `users` in two of them, cross-connection relationships without foreign keys, per-connection coverage, drift on one connection) and `declared-multi-connection`; graph conformance cases `cross-connection-relationship`, `cross-connection-foreign-key` and `duplicate-table-names`; and the invalid fixture `foreign-key-across-connections`.

### Changed

- The validator rejects a foreign key whose target table is in another connection (`Foreign key crosses connections`), and `buildGraph()` never links one; `docs/contract.md` states that documents are multi-connection, foreign keys never cross connections and relationships may. Every existing valid document stays valid.
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

[Unreleased]: https://github.com/laranex/schema-viewer-ui/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/laranex/schema-viewer-ui/releases/tag/v0.1.0
