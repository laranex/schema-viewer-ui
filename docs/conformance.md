# Validation & conformance

Producers in PHP, Python and TypeScript write the same contract, so the package ships what they test against.

## Artifacts

| Path | Contents |
| --- | --- |
| `contract/schema.json` | JSON Schema 2020-12 for the document's shape |
| `contract/fixtures/valid/*.json` | Synthetic documents in canonical form: declared (SQLAlchemy-style), combined (Eloquent-style and with drift), and PostgreSQL, MySQL and SQLite index variations |
| `contract/fixtures/invalid/*.json` | `{ description, strict, errors, document }`: one broken rule each, with the messages a validator reports |
| `contract/conformance/graph/*.json` | `{ description, input, expected }`: graph builder cases with hand-written expected links |
| `contract/check.mjs` | Checks any producer's output: strict validation, stored links, canonical form |

## What a producer should test

1. Every valid fixture passes its validator and round-trips to identical canonical bytes.
2. Every invalid fixture is rejected; rule errors use the listed messages.
3. Its graph builder turns every conformance input into exactly the expected links and derived links, ids included.
4. Its own output passes `check.mjs`:

```bash
npm install --no-save laranex-schema-viewer-ui@1
node node_modules/laranex-schema-viewer-ui/contract/check.mjs build/schema-viewer.json
```

The Python package runs 1–3 in its test suite against a vendored copy of these files.

## Ids and bytes

Link ids are `l` plus the first 16 hex digits of the SHA-256 of the compact JSON
`["link", fromTable, toTable, sortedPairs]`; derived links use `["derived", relationshipId]`. Canonical documents sort
keys by code point, indent by two spaces and end with a newline. Both are specified in the
[contract](./contract.md#graph), so any language can reproduce them byte for byte.
