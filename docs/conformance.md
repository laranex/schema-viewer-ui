# Validation & conformance

Producers in PHP, Python and TypeScript write the same contract, so the package ships what they test against.

## Artifacts

| Path | Contents |
| --- | --- |
| `contract/schema.json` | JSON Schema 2020-12 for the document's shape |
| `contract/gate-report.schema.json` | JSON Schema 2020-12 for the CI gate report (`laranex-schema-gate`) |
| `contract/fixtures/valid/*.json` | Synthetic documents in canonical form: declared (SQLAlchemy-style), combined (Eloquent-style and with drift), PostgreSQL, MySQL and SQLite index variations, multiple connections, tenant-schema, cross-driver and incomplete comparisons, Alembic tracks in every status, and inferred associations |
| `contract/fixtures/invalid/*.json` | `{ description, strict, errors, document }`: one broken rule each, with the messages a validator reports |
| `contract/conformance/graph/*.json` | `{ description, input, expected }`: graph builder cases with hand-written expected links |
| `contract/conformance/comparison/*.json` | `{ description, input: { document, baseline, target, overrides, limit }, expected }`: comparison cases with hand-written expected comparisons |
| `contract/conformance/migrations/*.json` | `{ description, input: { revisions, current }, expected: { history, status, pending, unknownRevisions } }` |
| `contract/conformance/inference/*.json` | `{ description, input: { source, connections, models, relationships, links }, expected: { inferredAssociations } }` |
| `contract/conformance/gate/*.json` | `{ description, input: { document, thresholds, requested }, expected }`: gate cases with hand-written expected reports |
| `contract/fixtures/gate/{valid,invalid}/*.json` | Gate reports, and broken ones (`{ description, errors, report }`) |
| `contract/check.mjs` | Checks any producer's output: strict validation, stored links and inferred associations, canonical form |

## What a producer should test

1. Every valid fixture passes its validator and round-trips to identical canonical bytes.
2. Every invalid fixture is rejected; rule errors use the listed messages.
3. Its graph builder, comparison, migration status, inference and gate turn every conformance input into exactly
   the expected output, ids, labels and messages included.
4. Its own output passes `check.mjs`:

```bash
npm install --no-save laranex-schema-viewer-ui@<version>
node node_modules/laranex-schema-viewer-ui/contract/check.mjs build/schema-viewer.json
```

5. Its gate command's reports pass `validateGateReport` (or `contract/gate-report.schema.json` plus the rules in the
   contract), and it rejects the invalid gate fixtures.

The Python package runs 1–3 in its test suite against a vendored copy of these files.

## Ids and bytes

Rule-based ids are a one-letter prefix plus the first 16 hex digits of the SHA-256 of compact JSON: links
`l` + `["link", fromTable, toTable, sortedPairs]`, derived links `d` + `["derived", relationshipId]`, diagnostics,
comparisons, differences, migration tracks and inferred associations as the contract lists. Canonical documents sort
keys by code point, indent by two spaces and end with a newline. Both are specified in the
[contract](./contract.md#graph), so any language can reproduce them byte for byte.
