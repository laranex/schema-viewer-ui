# Comparisons, migrations and inferences

A `laranex-schema` 2.0 document can store three kinds of computed results beside the schema: `comparisons`,
`migrations` and `inferredAssociations` (see [the contract](./contract.md)). Producers compute them with the shared
algorithms; the viewer only displays what the document stores and never compares, resolves revisions or infers
anything itself. A document whose three arrays are empty looks exactly as before: no extra tabs, marks or notes.

## Compare

The **Compare** tab (<kbd>X</kbd>) shows one stored comparison at a time.

- **Baseline → target.** The selectors list the scopes the stored comparisons name: a connection and a schema, or
  the connection's default schema. The direction is written out everywhere: **missing** (−) is in the baseline and
  not the target, **extra** (+) is in the target only, **changed** (~) is in both with different fields. When the
  document also stores the reverse comparison, ⇄ switches to it.
- **Summary.** The counts come from the comparison's `summary`, which counts every difference found; *listed* says
  how many are in the document, and how many in all when the producer left some out.
- **Incomplete comparisons.** When `complete` is false, a warning says so above everything else, with the number of
  omitted differences and the coverage gaps of the compared connections. An incomplete comparison never reads as "no
  drift": a difference that is not listed may still exist. A complete comparison with no differences says that it
  found the two scopes equal.
- **Differences.** Grouped as missing, extra and changed, each with its object type, severity and certainty, and a
  baseline-versus-target table: the object itself for missing and extra, every differing field for changed.
  **Likely** findings (compared through normalized types or SQL text, a heuristic) are labelled and dashed apart from
  **certain** ones. Filter by object type, change, severity and certainty.
- **Navigation.** *Show in baseline* and *Show in target* open the affected table on that side; the table's Details
  then list its differences, with *Open in Compare* to come back.
- **Diagnostics** about the comparison and its connections (an incomplete inspection, for one) are listed below.

### On the diagram

The comparison chosen in Compare is marked on the diagram while **Show → Comparison marks** is on:

- a table only the baseline has is outlined and labelled `− missing`, one only the target has `+ extra`, and a table
  with differences inside shows `~ n`; `likely` is added when all of them are heuristics;
- columns the comparison names are tinted with their symbol and stay visible on folded cards; hovering one shows
  the differing fields;
- Details mark indexes, foreign keys and constraints the same way.

A note over the diagram names the marked comparison, and says when it is incomplete.

## Migrations

The **Migrations** tab (<kbd>M</kbd>) lists every migration track per connection and schema (one per tenant schema
when each has its own version table) with the status the producer computed:

| Status | Meaning |
| --- | --- |
| Up to date | The recorded revisions are exactly the heads of the migration history |
| Behind (pending) | Revisions of the history are not applied yet; they are listed as pending |
| Diverged | A recorded revision is an ancestor of another recorded revision: the version table overlaps itself, so what is pending cannot be determined |
| Uninitialized | The version table records no revision, or there is none: every revision up to the heads is pending |
| Unknown | The status could not be determined; the card says why (version table unreadable, scripts unreadable, a revision the scripts do not define, or a partial history) |

Each card shows the current revisions, the expected heads, the pending revisions, and a warning when the history has
several heads. *More* adds unknown and missing revisions, the version table, the track's diagnostics and its migration
coverage: whether a model declares each table, whether autogenerate compares it, and whether migration scripts create
it — separate facts, so *excluded from autogenerate* never means *not migrated*.

Revision status is not schema drift: a database can be up to date and still differ from another. The Migrations tab
never shows schema differences, and Compare never shows revisions.

## Inferred associations

An inferred association is what a foreign key implies between two models that declare no relationship over it. It is
a heuristic, never an ORM relationship:

- It is drawn on the foreign-key edge it rests on — violet, dash-dot, labelled `FK · inferred` — and never as an edge
  of its own. **Relationships → Inferred associations** (<kbd>5</kbd>) turns the marks off.
- **Browse → Inferred** lists every one; Details shows its models, cardinality, confidence, ambiguities, supporting
  foreign keys and evidence (confirmed when read from metadata), and always states that no ORM relationship attribute
  is declared for it. High confidence never means one exists.
- Table and foreign-key details list the inferred associations that involve them.

## Deep links

`#view=compare&comparison=<id>&difference=<id>`, `#view=migrations&migration=<id>` and `#inferred=<id>` open these
views; the hash follows as you use them. Compare's filters are kept too: `&object=table&change=missing&severity=error&certainty=certain`
(unknown values are ignored).
