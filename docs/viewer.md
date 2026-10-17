# Using the viewer

## Layout

The layout follows Laravel Schema Viewer's:

- **Header**: the search box finds any table, column, model or relationship and opens it (<kbd>/</kbd>); then the
  connection, the Download menu (the JSON document, host files, and PNG or SVG images), the theme and Shortcuts.
- **Diagram**: tables as cards, links as edges, a minimap in the corner. Drag the background to pan, scroll or pinch
  to zoom, drag a card by its title to move it, fold a card with its chevron, double-click it to focus on its
  neighbors.
- **Toolbar** (bottom): zoom, fit, the hand (pan) and select tools — click the active one again to switch —, and the
  Relationships, Tables and Show menus.
- **Side panel** (right, resizable): **Browse** (Tables & Models, Relationships, Columns, each with a filter),
  **Details** (the selection, or an overview of the document), **Diagnostics** (facts apart from heuristics, each with
  a way to its table) and **Changes** when the host provides them; **Compare** and **Migrations** when the document
  stores comparisons or migration tracks, and an **Inferred** mode in Browse when it stores inferred associations. See
  [Comparisons, migrations and inferences](./views.md).

## Several connections

A document may hold several connections, each with its own driver. The viewer never assumes one:

- **All connections** (the default): each connection is laid out on its own inside a labelled frame showing its name,
  driver and table count, so tables of the same name in two connections never mix. Relationships between connections
  run between the frames.
- **One connection**: pick it in the header's connection menu (on a phone, in the ⋯ menu), step through them with
  <kbd>[</kbd> <kbd>]</kbd>, or open `#connection=<id>`. Tables on other connections that its relationships reach stay
  on the diagram as dashed reference nodes marked "On connection …": they cannot be moved or folded, and clicking one
  opens that table on its own connection.
- With more than one connection, every table label names its connection, `analytics · public.users`: cards, Browse,
  search results, Details headings, edge details, the phone sheet and image exports.
- A relationship between two connections is always drawn as an ORM-only (dashed) edge with a `cross-connection` chip.
  Foreign keys never cross connections, so the viewer never shows one there.

On a phone the header keeps only the search and a ⋯ menu, the diagram fills the screen, and the side panel is a bottom
sheet: tap a table, Browse, or the diagnostics count to open it.

## Edges

| Line | Meaning |
| --- | --- |
| Solid, accent | A foreign key and the ORM relationships that use its columns |
| Solid, grey | A foreign-key constraint no relationship uses |
| Dashed | An ORM relationship with no foreign key behind it |
| Dotted | An ORM relationship through intermediate tables |
| Dashed, orange | A foreign key only the ORM declares, not found in the database (combined documents) |
| Dash-dot, violet, `FK · inferred` | A foreign key with an inferred association: a heuristic, no ORM relationship declared |

Each kind has its own layer toggle (keys <kbd>1</kbd>–<kbd>4</kbd>; <kbd>5</kbd> for the inferred marks). The viewer draws the links the document stores;
it never infers a constraint from a relationship.

## Shortcuts

| Keys | Action |
| --- | --- |
| <kbd>/</kbd> | Search |
| <kbd>Esc</kbd> | Clear the search, the selection and focus |
| <kbd>F</kbd> <kbd>0</kbd> | Fit the diagram |
| <kbd>+</kbd> <kbd>−</kbd> | Zoom |
| <kbd>Space</kbd> | Hold to pan anywhere |
| <kbd>Shift</kbd> click / drag | Pick several tables; drag one to move them all |
| <kbd>Shift</kbd> <kbd>F</kbd> | Focus on the selection, or leave focus |
| <kbd>C</kbd> | Key columns, all columns, or table names |
| <kbd>N</kbd> | Notes on cards |
| <kbd>L</kbd> | Relationship names everywhere or on the selection |
| <kbd>1</kbd>–<kbd>4</kbd> | FK + ORM, FK only, ORM only, through edges |
| <kbd>5</kbd> | Inferred-association marks on foreign-key edges |
| <kbd>Y</kbd> <kbd>G</kbd> <kbd>P</kbd> | Your, framework and package tables |
| <kbd>[</kbd> <kbd>]</kbd> | Previous or next connection, or all of them |
| <kbd>Shift</kbd> <kbd>C</kbd> | Copy a link to this view |
| <kbd>A</kbd> <kbd>D</kbd> <kbd>H</kbd> <kbd>W</kbd> | Browse, Details, Diagnostics, Changes |
| <kbd>X</kbd> <kbd>M</kbd> | Compare, Migrations (when the document has them) |
| <kbd>E</kbd> | Download menu: JSON, PNG or SVG |
| <kbd>S</kbd> | All shortcuts |
| <kbd>?</kbd> | The tour |

## Provenance, drift and diagnostics

In a combined document (database introspection enriched with ORM metadata), badges say where each table, column,
index, constraint and foreign key came from. Rows the database and the ORM disagree on are tinted, and the details
list each differing field with both values. Diagnostics separate **facts** (read from metadata) from **heuristics**
(inferred), and the guide's Coverage section lists what each source could not read.

## Deep links

The URL hash keeps the view: `#table=<id>`, `#link=<id>`, `#inferred=<id>`, `#focus=<id>&depth=2`, `#connection=<id>`,
`#view=compare&comparison=<id>&difference=<id>` and `#view=migrations&migration=<id>`. An unknown connection id opens every connection; a `#table=` on another connection than
`#connection=` opens the table's own connection. Press
<kbd>Shift</kbd> <kbd>C</kbd> to copy it.
