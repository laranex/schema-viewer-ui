# Using the viewer

## Layout

The layout follows Laravel Schema Viewer's:

- **Header**: the brand mark, the search box finds any table, column, model or relationship and opens it (<kbd>/</kbd>); then the
  connection, the Download menu (the JSON document, host files, and PNG or SVG images), the theme and Shortcuts.
- **Diagram**: tables as cards, links as edges, a minimap in the corner. Drag the background to pan, scroll or pinch
  to zoom, drag a card by its title to move it, fold a card with its chevron, double-click it (or a line) to focus on
  its neighbors; the focus bar names what is focused and how many tables are shown. Click a column's row on a card (or
  its name in Details) for the column's details: its facts, the indexes and foreign keys it is part of in both
  directions, the lines that use it, lit on the diagram, and its diagnostics.
- **Toolbar** (bottom): zoom, fit, the hand (pan) and select tools — click the active one again to switch —, and the
  Relationships, Tables and Show menus.
- **Side panel** (right, resizable): **Browse** (Tables & Models, Relationships, Columns, each with a filter),
  **Details** (the selection, or an overview of the document), **Diagnostics** (facts apart from heuristics, each with
  a way to its table) and **Changes** when the host provides them; **Compare** and **Migrations** when the document
  stores comparisons or migration tracks, and an **Inferred** mode in Browse when it stores inferred associations. See
  [Comparisons, migrations and inferences](./views.md). When the panel is too narrow for every tab label, the other
  tabs show their icon (hover for the name) and the row scrolls to keep the selected tab in view; the arrow keys,
  <kbd>Home</kbd> and <kbd>End</kbd> move between tabs.

Folding one card keeps every table where it is, dragged ones included. Changing Columns for every card
(<kbd>C</kbd>), notes, comparison marks or Arrange lays the diagram out again, which resets dragged positions.

## Several connections

A document may hold several connections, each with its own driver. The viewer never assumes one:

- **All connections** (the default): each connection is laid out on its own inside a labelled frame showing its name,
  driver, table count and diagnostic count, so tables of the same name in two connections never mix. Relationships between connections
  run between the frames. A frame follows its tables: drag one out and the frame grows to contain it.
- **One connection**: pick it in the header's connection menu (on a phone, in the ⋯ menu), step through them with
  <kbd>[</kbd> <kbd>]</kbd>, or open `#connection=<id>`. Tables on other connections that its relationships reach stay
  on the diagram as dashed reference nodes marked "On connection …": they cannot be moved or folded, and clicking one
  opens that table on its own connection.
- A relationship through a table on another connection draws that table as a reference node too.
- **Changes** (from the host) follow the connection in view as well; each change whose subject is still in the
  document has a Show it link, and cards new or changed since the previous build carry a dot (filled: new; ring:
  changed).
- **Diagnostics** follow the connection in view: with one connection shown, the tab, its count and the phone sheet's
  count list that connection's diagnostics and those about the whole document (marked "whole document").
- With more than one connection, every table label names its connection, `analytics · public.users`: cards, Browse,
  search results, Details headings, edge details, the phone sheet and image exports.
- A relationship between two connections is always drawn as an ORM-only (dashed) edge with a `cross-connection` chip.
  Foreign keys never cross connections, so the viewer never shows one there.

On a phone the header keeps only the search and a ⋯ menu, the diagram fills the screen, and the side panel is a bottom
sheet: tap a table, Browse, or the diagnostics count to open it. A deep link to a table, line, association or view
opens the sheet on its tab.

## Edges

| Line | Meaning |
| --- | --- |
| Solid, accent | A foreign key and the ORM relationships that use its columns |
| Solid, grey | A foreign-key constraint no relationship uses |
| Dashed | An ORM relationship with no foreign key behind it |
| Dotted | An ORM relationship through intermediate tables |
| Dashed, orange | A foreign key only the ORM declares, not found in the database (combined documents) |
| Dash-dot, violet, `FK · inferred` | A foreign key with an inferred association: a heuristic, no ORM relationship declared |

Line ends follow Laravel Schema Viewer's: a crow's foot where the referencing columns can repeat, a single bar where
they are unique (primary key, unique index or unique constraint), a double bar at the referenced table, and an arrow
at the end of a relationship through other tables.

A line's details name the index that serves its foreign key (one whose leading columns are the key's) or say there is
none, and list the diagnostics about the line, its foreign key and its relationships.

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
| <kbd>Shift</kbd> <kbd>F</kbd> | Focus on the selected table or line, or leave focus |
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

Models and relationships with a source location show it as `file:line`. With an `editor` template (a `ViewerConfig`
field or the `editor` prop, e.g. `vscode://file/{file}:{line}`) it is a link: `{file}` is inserted with its slashes
kept (`encodeURI`) and `{line}` defaults to 1. Templates with a `javascript:`, `data:`, `vbscript:`, `blob:` or
`file:` scheme are ignored. The host puts the project root into the template when `file` is relative.

## Deep links

The URL hash keeps the view: `#table=<id>` (with `&column=<name>` for a column), `#link=<id>`, `#inferred=<id>`, `#focus=<table or line id>&depth=2`, `#connection=<id>`,
`#view=compare&comparison=<id>&difference=<id>` (with the Compare filters `object`, `change`, `severity`, `certainty`) and `#view=migrations&migration=<id>`. An unknown connection id opens every connection; a `#table=` on another connection than
`#connection=` opens the table's own connection. A link to a table, line, connection, comparison or migration track the document
does not have opens the whole diagram with a note saying so. Press
<kbd>Shift</kbd> <kbd>C</kbd> to copy it.
