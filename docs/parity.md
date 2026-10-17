# Feature parity with Laravel Schema Viewer

This viewer's layout, routing, icons and interaction model follow Laranex Laravel Schema Viewer (MIT, see `NOTICE`),
in this package's colors and on the framework-neutral `laranex-schema` contract. This page compares the two feature
by feature and says what this viewer does today.

**Status**: **Complete** (equivalent or better), **Partial** (the difference is named), **Missing**, or **Not
applicable** (Laravel- or Eloquent-specific, or outside a viewer package). Features only this viewer has are listed at
the end and not counted.

| Status | Rows |
|---|---|
| Complete | 73 |
| Partial | 12 |
| Missing | 2 |
| Not applicable | 3 |

## Diagram and navigation

| Feature | This viewer | Status |
|---|---|---|
| Table cards: model subtitle, key marks, `?` for nullable, type, "+ N more columns" | Also UK marks, drift and declared-only tints, comparison marks | Complete |
| Card badges: diagnostics count, `PIVOT`, package or framework label, note mark, new/changed dot | All of them; the dot follows the host's `changes` | Complete |
| Line kinds (FK + relationship, relationship only, FK only, through) with toggles <kbd>1</kbd>–<kbd>4</kbd> | Also declared-only, polymorphic, cross-connection and inferred styles | Complete |
| Crow's-foot line ends (many, one, referenced parent, through arrow) | Laravel's shapes, from one uniqueness rule shared with images and Mermaid ([details](./viewer.md#edges)) | Complete |
| Line label with a relationship-kind chip and a note mark | Label and chip; a link's note is shown in its details, not on the label | Partial |
| Dense mode for large schemas (thin muted lines until something is selected) | Off-screen elements are skipped above 60 tables; lines keep their full weight | Missing |
| Zoomed-out picture mode (40% and below) | Cards draw placeholder rows; Laravel draws one picture of the whole diagram, which is faster on very large schemas | Partial |
| ELK layout: left-right, snowflake, compact; Arrange | Same algorithms, run on the page (CSP-safe); Arrange again in the Tables menu (no toast) | Complete |
| Connection frames: name, driver, table count, diagnostics count | Same, on the diagram and in images | Complete |
| Frames follow dragged tables | A frame grows around a table dragged out of it, on the diagram and in images (Laravel's frames stay fixed); frames do not push each other away | Complete |
| Connection picker (all or one), <kbd>[</kbd> <kbd>]</kbd>, phone menu, table counts | Same | Complete |
| Reference nodes for tables on other connections | Both directions, and the intermediate tables of a relationship through another connection | Complete |
| Pan, zoom, fit, minimap | No typed zoom percentage; scrolling zooms (Laravel: scrolling pans, <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + wheel zooms) | Partial |
| Pan and select modes, <kbd>Space</kbd> to pan | Pan is the default mode (Laravel: select) | Complete |
| Search | Tables, columns, models and relationships; the diagram does not dim the cards that do not match | Partial |
| Selection lights the neighbours and dims the rest | Same | Complete |
| A line or a column as the selection | Both light their tables, lines and rows; `#link=`, `#column=` | Complete |
| Several tables: <kbd>Shift</kbd> click, box select, drag together, list in Details | Same | Complete |
| Focus on a table, depth 1–3, focus bar with name and table count | Same | Complete |
| Focus on a line or a column | Lines (double-click, <kbd>Shift</kbd> <kbd>F</kbd>, `#focus=<line>`); not columns | Partial |
| Deep links: connection, table, focus and depth | Same | Complete |
| Deep links: line, column, viewport, folded columns | `#link=`, `#column=`, `#at=x,y,zoom`; the column fold is not in the link | Partial |
| A deep link to something the document does not have | Opens the whole diagram with a toast saying so | Complete |
| Copy link (<kbd>Shift</kbd> <kbd>C</kbd>) | Adds the viewport; not the column fold | Partial |
| Compare filters in deep links | `#object=`, `#change=`, `#severity=`, `#certainty=` | Complete |
| Keyboard shortcuts, <kbd>⌘/Ctrl</kbd> <kbd>K</kbd>, <kbd>Esc</kbd> one layer at a time | Same, plus <kbd>0</kbd>, <kbd>5</kbd>, <kbd>X</kbd>, <kbd>M</kbd>, <kbd>E</kbd> and arrow-key panning | Complete |
| "Show keys next to controls" switch | Keys are in menus and the Shortcuts list only | Missing |
| Dragging cards; lines follow and re-route on drop | Same | Complete |
| Folding one card keeps every position | Same | Complete |
| No layout persistence across reloads (only the theme) | Same | Complete |
| Phone: one-finger pan, no card dragging, bottom sheet | Same; a deep link opens the sheet on its tab | Complete |

## Table, column and line details

| Feature | This viewer | Status |
|---|---|---|
| Columns: type, nullable, default, auto-increment, comment, note | Also enum, generated, collation, timezone, ORM default, provenance, drift, extensions | Complete |
| Primary key, foreign keys with actions and links to their tables | Also deferrable, initially, provenance | Complete |
| Indexes: partial, expression, included, method | Also key-part order, nulls, length, operator class, dialect options | Complete |
| Eloquent model facts (fillable, casts, scopes, observers…) | Generic: class, key, source and `extensions`, which a host renderer can format | Not applicable |
| Column ↔ model facts (cast, fillable, hidden) | Through `Column.extensions` only | Not applicable |
| Relationships: type, keys, pivot, morph, through, constraints, inverse | Same, plus cardinality and join | Complete |
| Used by (incoming relationships) | Same | Complete |
| Line details: keys, foreign key, the index that serves it, relationships, diagnostics, note | Same | Complete |
| Through relationship path, each table openable | Same | Complete |
| Column details: indexes, foreign keys both ways, lines that use it, diagnostics | Same | Complete |
| Editor links | `encodeURI` keeps the path's slashes; unsafe schemes show the path as text | Complete |
| Ownership filters and counts (your, framework, package tables) | Same, counts in the Tables menu | Complete |
| Notes on the project, tables, columns and lines; notes on cards (<kbd>N</kbd>) | Same | Complete |
| Diagnostics inside table and line details | Same | Complete |

## Diagnostics and changes

| Feature | This viewer | Status |
|---|---|---|
| Diagnostics list, severity, certain vs likely | Facts apart from heuristics | Complete |
| A diagnostic opens its subject | Tables, columns, lines, comparisons, migration tracks, inferred associations | Complete |
| Diagnostics follow the connection in view (list, tab count, phone sheet) | Same, with a note of how many are on other connections | Complete |
| Per-connection count on frames and in images | Same | Complete |
| Ignore rules with copyable configuration | A diagnostic's `extensions` are shown, through the host's renderer when it has one; there is no built-in Ignore dialog | Partial |
| Unresolved relationships | `unresolved_relationship` diagnostics, `relatedTable: null` | Complete |
| Changes since the previous build | Each change opens its subject; list and count follow the connection in view; cards carry a dot | Complete |

## Interface

| Feature | This viewer | Status |
|---|---|---|
| Light and dark theme, remembered | Follows the system until chosen | Complete |
| Responsive layout: phone sheet, ⋯ menu, small-screen note | By the viewer's own width, so it also works embedded | Complete |
| A deep link on a phone | Opens the sheet on the linked tab | Complete |
| Panel tabs at the narrowest panel | Tabs that do not fit show icons; the row scrolls to the selected tab | Complete |
| Text wrapping in the narrow panel | Between words, and identifiers after their separators | Complete |
| Dimming while something is selected | Unrelated cards at 55% and lines at 25% opacity, also after a deep link | Partial |
| Tour | 8 steps, Downloads included; Laravel's 16 steps also open menus and have phone variants, and there are no Compare, Migrations or inferred steps | Partial |
| Side panel: Browse, Details, Diagnostics, Changes; resizable with the keyboard | Plus Compare, Migrations and Browse → Inferred | Complete |
| Connection picker with driver and table counts | Same | Complete |
| Tooltips with key hints | Menu items show their keys; buttons use plain `title` tooltips without `<kbd>` | Partial |
| Loading, empty and error states | Same | Complete |
| Toasts | Same | Complete |
| Accessibility checks (axe, light and dark, dialogs; keyboard) | Same | Complete |
| Large schemas | A 200-table browser test with a time budget | Complete |

## Download and export

See [Downloads and exports](./exports.md).

| Feature | This viewer | Status |
|---|---|---|
| Download dialog with sections, conversion notes and the as-shown table count (<kbd>E</kbd>) | Same; phones open it from the ⋯ menu | Complete |
| Connection selector for schema files | Same | Complete |
| Mermaid ERD | In the browser, `laranex-schema-viewer-ui/export` | Complete |
| DBML | Same | Complete |
| Markdown | Same | Complete |
| JSON of one connection (`schema-<connection>.json`) | A strictly valid `laranex-schema` document of that connection; the whole document stays available | Complete |
| SVG and PNG, whole diagram or what is on screen | Same | Complete |
| Image fidelity | Crow's feet, label chips, diagnostics counts, `PIVOT` tags, frames with their counts, reference nodes; no package tags, framework-table dashing or changed dots | Partial |
| Comparison marks and inferred styling in images | Same as on screen | Complete |
| Fonts embedded in SVG | IBM Plex WOFF2 as data URLs | Complete |
| Labels in images independent of the selection | Only Show → Relationship names decides | Complete |
| File names `schema-<scope>.svg/png` | Same | Complete |
| Offline HTML (`schema-viewer.html`) | One file with script, styles, fonts, brand-mark favicon and document; hash-based CSP; opens from `file://` | Complete |
| ORM-only relationships are never exported as foreign keys | Tested for every format | Complete |
| CLI export (`schema-viewer:export`) | Hosts own their CLIs; the exporters are importable | Not applicable |

## Icons and identity

| Feature | This viewer | Status |
|---|---|---|
| Brand mark (two tables joined by a relationship) | In the header, in the theme's accent | Complete |
| Favicon and docs-site logo | The brand mark on a tile, light and dark, 16 and 32 pixel ICO (Laravel ships none) | Complete |
| Icon set on a 16-unit grid, 1.6 stroke, the control's color | Laravel's shapes, one registry | Complete |
| External-link, note and line-end marks; line keys | External-link and note icons, Laravel's line ends; line keys are drawn in CSS in each line's style | Complete |
| Compare, Migrations and inferred icons in the same style | Same | Complete |
| Attribution | `NOTICE` credits the layout, routing, icons, brand mark and line ends | Complete |

## Only in this viewer

Stored comparisons (Compare tab, marks on the diagram and in images, deep links), migration tracks, inferred
associations, provenance, drift and coverage of combined documents, unique and check constraints, enums, generated
columns, collations, index key-part details, generic `extensions` with host renderers, cross-connection relationship
chips, the React component and the `<laranex-schema-viewer>` element, a strict-CSP bundle with no workers or blobs, a
controlled theme and a `layout` override.
