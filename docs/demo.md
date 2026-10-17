---
aside: false
---

# Live demo

The demo is the package's own standalone bundle loading the contract's synthetic fixtures, exactly as a Laravel or
Python host serves it. Pick a schema in the bar above the diagram.

<LiveDemo />

## Things to try

- **Blog (Eloquent).** Click `posts`: its foreign keys and ORM relationships are listed apart. The dashed edge from
  `posts.editor_id` is a relationship with no foreign key; the guide lists it as a lint finding (a fact) beside a
  missing-index suggestion (a heuristic).
- **Drift (SQLAlchemy).** The orange marks show where the database and the models disagree: a column type, an index
  that is unique in only one of them, a column and a foreign key only the models declare.
- **PostgreSQL indexes.** Open `public.accounts` and read the Indexes section: primary, unique, constraint-backed,
  partial, expression, covering, GIN and operator-class indexes.
- Press <kbd>S</kbd> for every shortcut, <kbd>?</kbd> for the tour, <kbd>N</kbd> for notes, <kbd>C</kbd> to fold
  columns, and <kbd>E</kbd> to export the diagram as PNG or SVG.
