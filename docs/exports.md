# Downloads and exports

The viewer's **Download** dialog (header button, <kbd>E</kbd>, or ⋯ → Download… on a phone) makes every file in the
browser from the document it shows. No schema data is sent anywhere: the text formats come from the pure exporters in
`laranex-schema-viewer-ui/export`, the images from the diagram as it is drawn, and the offline page from the viewer's
own files. The dialog follows Laranex Laravel Schema Viewer's.

## Exports are sensitive files

Every file exported from a private schema is as sensitive as the schema itself: the offline HTML page, the whole
document and scoped JSON, DBML, Mermaid, Markdown, SVG and PNG. "No schema data is sent anywhere" describes the
network, not the file you save; keep exports out of version control, build output and public places.

Once you download or export a file, storing, sharing and distributing it is your responsibility as the owner of the
repository or the file: see [Responsibility boundary](./security.md#responsibility-boundary). The
[snapshot scanner](./security.md#git-protection) recognises JSON documents, including those inside the offline HTML
page, but not the other formats ([Limitations](./security.md#limitations)).

## The dialog

1. **Connection** (only with several connections): the connection the schema files describe. It opens on the
   selection's connection (a table, link or inferred association), else the connection in view, else the first.
2. **Database schema of `<connection>`**: Mermaid, DBML, Markdown or JSON, with a preview, the file name and line
   count, **Copy** (to the clipboard) and **Download**. The conversion notes list everything the format leaves out or
   changes. For Mermaid and Markdown, a checkbox adds the ORM relationships and inferred associations, labelled.
3. **Diagram image**: SVG or PNG of the **Whole diagram** or **What's on screen**, "as shown: N tables".
4. **Use it offline**: **This page as HTML** (standalone bundle, or when the host passes `offlineBundle`).
5. **From this page**: the whole document as JSON (`schema-viewer.json`, or the host's `downloadHref`) and any files the
   host passes in `ViewerConfig.downloads`.

## File names

| Export | File name | Media type |
| --- | --- | --- |
| Mermaid | `schema-<connection>.mmd` | `text/plain` |
| DBML | `schema-<connection>.dbml` | `text/plain` |
| Markdown | `schema-<connection>.md` | `text/markdown` |
| JSON (one connection) | `schema-<connection>.json` | `application/json` |
| SVG, PNG | `schema-<scope>.svg`, `schema-<scope>.png` | `image/svg+xml`, `image/png` |
| Offline page | `schema-viewer.html` | `text/html` |
| Whole document | `schema-viewer.json` | `application/json` |

`<connection>` is the connection's **name** (not its id) with every character outside `[A-Za-z0-9_-]` replaced by
`-`; an export of several connections through the API is named `schema-all.<extension>`. Images are named after the
diagram's scope, not the dialog's connection: the connection in view, the only connection, or `all`.

## The exporter API

```ts
import { EXPORTERS, dbml, exportFileName, markdown, mermaid, json, scopeDocument } from 'laranex-schema-viewer-ui/export';

const { content, warnings } = dbml.export(document, { connections: ['connection:app'] });
const name = exportFileName(document, dbml.extension, ['connection:app']); // schema-app.dbml
```

```ts
type ExportOptions = {
    connections?: string[]; // connection ids; every connection when unset
    dialect?: 'postgresql' | 'mysql' | 'mariadb' | 'sqlite'; // reserved; the current formats ignore it
    orm?: boolean; // Mermaid and Markdown: add labelled ORM relationships and inferred associations
};
type ExportWarning = {
    code: 'unsupported_feature' | 'lossy_conversion' | 'skipped_entity' | 'declared_source' | 'incomplete_coverage';
    subject: { type: SubjectType; id: string | null; label: string | null };
    message: string;
};
type ExportResult = { content: string; warnings: ExportWarning[] };
type Exporter = { id: string; label: string; extension: string; mediaType: string; export: (document, options?) => ExportResult };
```

The module is plain TypeScript with no React and no DOM, so it runs in Node.js too. Exporters are deterministic: the
same document and options give the same bytes and the same warnings. An unknown connection id throws.

## Rules every format follows

- **Only physical foreign keys become relationships, Refs or foreign-key rows.** ORM relationships, relationship-only
  links, derived (through) links and inferred associations never do. With `orm: true`, Mermaid draws them as dotted
  lines labelled `ORM: Model::name (Type)` or `inferred: A → B (no ORM attribute declared)`, and Markdown lists them in
  a separate "ORM declarations" section; DBML ignores the option.
- **The database's facts only, in a combined document.** Tables, columns, indexes, constraints and foreign keys only
  the ORM declares are left out (`skipped_entity`); where the database and the ORM disagree (drift) the database's
  value is written (`lossy_conversion`).
- **A declared document** (ORM metadata only) is exported as the declared schema, with a `declared_source` warning.
- **Incomplete coverage** (a feature partial or unavailable) is reported with `incomplete_coverage`; Markdown also
  states it under the title.
- **Nothing is invented**: no default, constraint, index, `not null` or type the document does not state. A foreign
  key whose target table or columns the document does not have is left out with a warning.
- **Several connections in one file** (API only): Mermaid and DBML qualify table names by connection
  (`app_public_users`, `"app.public.users"`); Markdown writes one `#` section per connection.

## Formats

### Mermaid (`.mmd`)

Laravel's layout: `erDiagram`, every table (`schema.table` when it has a schema) with its columns as
`<base type> <name> [PK, FK, UK]`, then one line per foreign key, `parent ||--o{ child : "columns"`. Names keep
letters, digits and `_` (others become `_`, a leading digit gets one; renames and collisions are warned). Beyond
Laravel: `UK` marks a single-column unique key; the child end is `o|` when the foreign-key columns are unique, and
the parent end is `|o` when a foreign-key column is nullable. One `unsupported_feature` warning per connection
counts what an ER diagram cannot hold: indexes, check constraints, defaults, generated columns, enum values,
comments and notes, referential actions. Composite foreign keys are one labelled line (warned).

### DBML (`.dbml`, dbdiagram.io)

Laravel's layout: an optional `Project` block with the document's note, named `Enum`s, each `Table schema.name` with
`[pk, increment, not null, unique, default: \`…\`, note: '…']`, an `indexes` block (composite primary key `[pk]`,
other indexes with `unique`, `type: hash`, `name`), a `checks` block, the table `Note`, then
`Ref name: a.cols > b.cols [delete: …, update: …]` (`-` when the referencing columns are unique). Beyond Laravel:
expression indexes are kept as `` `lower(email)` ``, unique constraints without an index are written as unique
indexes, check constraints as `checks`. Warned: partial predicates, included columns, part order, nulls order, prefix
lengths, collations and operator classes, methods other than btree and hash, dialect options, the name of a unique
index written as a column's `unique`, column collations, generated columns, deferrable foreign keys, a second foreign
key on the same columns (DBML allows one Ref per pair of endpoints), check constraints and indexes on expressions
whose text was not reported, and backticks inside SQL text. Every golden DBML file in the tests is parsed back with
`@dbml/core`.

### Markdown (`.md`)

Laravel's layout: `# Database schema: <connection> (<driver>)`, the document's note, `N tables.`, then per table its
comment, note, a six-cell column table (`Column | Type | Null | Default | Key | Comment`), `Indexes:` and
`Foreign keys:` (actions in words, `not reported` when the document has none). Beyond Laravel: expression parts in
code spans, partial predicates, methods other than btree, included columns, part order, prefix lengths, collations and
operator classes, `UK` keys, auto-increment, enum values, generated columns, a `Constraints:` list, deferrable foreign
keys, framework and package tables marked, and incomplete coverage stated. Schema text is escaped so no raw HTML
appears outside code spans and every table row keeps six cells.

### JSON (`.json`)

A strictly valid `laranex-schema` 2.0 document of the chosen connection (Laravel writes the bare connection object;
this is a document any 2.x reader opens). It keeps the connection's tables, the models mapping them, relationships,
diagnostics, comparisons, migration tracks and inferred associations wholly inside it, and rebuilds `links` and
`derivedLinks` with the shared `buildGraph`. A relationship reaching another connection is left out with a warning; an
inverse left out that way is written as `null`. The result is validated strictly before it is returned
(`scopeDocument(document, ids)` does the same for callers). With every connection chosen, the document is written
unchanged.

## Images

SVG and PNG are drawn from one list of shapes, so they match. They show the diagram as it is: the connections in view
with their frames, reference nodes for other connections' tables, the edge kinds and table groups switched on, focus,
folded cards, notes, comparison marks (table chips, column tints and symbols, likely ones dashed) while Show →
Comparison marks is on, inferred-association styling while it is on, diagnostics counts, `PIVOT` tags, crow's-foot
ends (many or one at the referencing end, a double bar at the referenced end, an arrow for through relationships), and
relationship-name labels with their chips only while Show → Relationship names is on — never because of the
selection, so selecting something does not change the file. Colours are the theme's, resolved to literals. The SVG
embeds the IBM Plex WOFF2 fonts it uses as data URLs (fetched from the page's own origin), so it renders the same
anywhere. *What's on screen* keeps only what lies in the viewport. PNGs are painted on a canvas at up to 2× and scaled
down to stay under 16 megapixels, which works under a strict CSP.

## Offline HTML

**This page as HTML** saves one `schema-viewer.html` with everything inside:

- the viewer as one script, `dist/viewer/offline.js` (the same entry as `app.js` with the ELK layout engine inlined,
  ≈2 MB, listed in `manifest.json`), in an inline `<script type="module">`;
- `app.css` with its WOFF2 fonts as data URLs, in an inline `<style>`;
- the brand mark as the favicon, a data URL of the same SVG as `favicon.svg` (`FAVICON_DATA_URI` in `src/viewer/brand.ts`);
- the document as `<script type="application/json" id="schema-viewer-data">` holding a `ViewerConfig` with only
  `document`, `changes` and `defaultConnection` (the connection in view). `editor` and host `downloads` are never
  written, so host-only actions disappear and no local paths leak.

The file carries its own policy:
`default-src 'none'; script-src 'sha256-…'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;
connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`. The one script is allowed by its SHA-256
hash, not by `'unsafe-inline'`; styles use `'unsafe-inline'` as the hosts' policies do. Text that could end an element
early is escaped (`</script`, `<!--` and `<script` as `\x3C…` in the script, `<` as `\u003c` in the JSON, `</style` as
`<\/style`). The page opens from `file://` with no network access; its Download dialog still makes every file, and it
can save itself again byte for byte. A file for the 3-connection demo document is ≈2.3 MB.

While exporting, the hosted viewer fetches `offline.js`, `app.css` and the fonts from its own directory (same origin,
so `script-src 'self'` pages allow it). Hosts serve them unchanged: they are `.js`, `.css` and `.woff2` files listed in
the manifest. React hosts pass `offlineBundle={() => fetchOfflineBundle(urlOfDistViewer)}` to
`<SchemaViewer>` to offer it; without that prop the entry is hidden.
