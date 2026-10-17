# Troubleshooting

## "This is not a laranex-schema 1.x document the viewer can read"

The bundle validates the document before rendering and lists the first errors. Common causes:

- An older framework snapshot (Laravel `format: 2`, Python `laranex-schema-viewer` version 1). Rebuild with a producer
  version that writes `laranex-schema`, or convert with the producer's own conversion command.
- A reference that does not resolve, such as a foreign key to a table the document leaves out. Producers report such
  targets with an `unresolved_foreign_key` diagnostic instead.

Run `node node_modules/laranex-schema-viewer-ui/contract/check.mjs snapshot.json` for the full list.

## The page stays blank

- Opened from `file://`: browsers block `fetch` there. Serve the directory over HTTP.
- A Content-Security-Policy without `script-src 'self'` or without `style-src 'unsafe-inline'`. See
  [Integrating a host](./integration.md#content-security-policy).
- `assets/` not served: `app.js` loads the layout engine from `assets/elk.bundled-*.js` on first use.

## The diagram is slow on a very large schema

Fold cards to table names (<kbd>C</kbd>), turn off layers you do not need (<kbd>1</kbd>–<kbd>4</kbd>), or filter to one
connection. At 40% zoom and below, cards draw placeholder rows, which keeps panning smooth.

## Labels overlap edges

Press <kbd>L</kbd> to show relationship names only on the selected table, or re-arrange with another layout (Layout
menu or Arrange).
