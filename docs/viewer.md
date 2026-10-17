# Using the viewer

## Layout

- **Tables** (left): every table shown, searchable by table, column or model name. Press <kbd>/</kbd> to search.
- **Diagram** (middle): tables as cards, links as edges. Drag the background to pan, scroll or pinch to zoom, drag a
  card by its title to move it. Double-click a card to focus on it and its neighbors.
- **Details** (right): the guide when nothing is selected; a table's columns, indexes, constraints, foreign keys,
  relationships and models when one is; a link's foreign key and relationships when an edge is.

Both side panels resize: drag their edges, or focus a handle and use the arrow keys. Double-click a handle to reset.

## Edges

| Line | Meaning |
| --- | --- |
| Solid, accent | A foreign key and the ORM relationships that use its columns |
| Solid, grey | A foreign-key constraint no relationship uses |
| Dashed | An ORM relationship with no foreign key behind it |
| Dotted | An ORM relationship through intermediate tables |
| Dashed, orange | A foreign key only the ORM declares, not found in the database (combined documents) |

Each kind has its own layer toggle (keys <kbd>1</kbd>–<kbd>4</kbd>). The viewer draws the links the document stores;
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
| <kbd>Y</kbd> <kbd>G</kbd> <kbd>P</kbd> | Your, framework and package tables |
| <kbd>[</kbd> <kbd>]</kbd> | Previous or next connection |
| <kbd>Shift</kbd> <kbd>C</kbd> | Copy a link to this view |
| <kbd>E</kbd> | Export PNG or SVG |
| <kbd>S</kbd> | All shortcuts |
| <kbd>?</kbd> | The tour |

## Provenance, drift and diagnostics

In a combined document (database introspection enriched with ORM metadata), badges say where each table, column,
index, constraint and foreign key came from. Rows the database and the ORM disagree on are tinted, and the details
list each differing field with both values. Diagnostics separate **facts** (read from metadata) from **heuristics**
(inferred), and the guide's Coverage section lists what each source could not read.

## Deep links

The URL hash keeps the view: `#table=<id>`, `#link=<id>`, `#focus=<id>&depth=2`, `#connection=<id>`. Press
<kbd>Shift</kbd> <kbd>C</kbd> to copy it.
