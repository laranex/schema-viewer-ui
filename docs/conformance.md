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
| `contract/conformance/requests/*.json` | `{ description, input: { document, requests }, expected: { pairs, errors } }`: requested-comparison expansion (`*` targets, precedence, duplicates, errors) |
| `contract/conformance/coverage-gaps/*.json` | `{ description, input: { document, scope }, expected: { gaps, covered } }`: why a side cannot be compared completely |
| `contract/conformance/overrides/*.json` | `{ description, input: { overrides }, expected: { errors } }`: severity override validation with exact messages |
| `contract/conformance/comparison-diagnostics/*.json` | `{ description, input: { document, comparison }, expected: { diagnostics } }`: the `comparison_incomplete` diagnostic stored beside a comparison |
| `contract/conformance/store/*.json` | `{ description, input: { document, comparisons }, expected: { document } }`: storing comparisons into a document |
| `contract/conformance/migrations/*.json` | `{ description, input: { revisions, current }, expected: { history, status, pending, unknownRevisions } }` |
| `contract/conformance/inference/*.json` | `{ description, input: { source, connections, models, relationships, links }, expected: { inferredAssociations } }` |
| `contract/conformance/gate/*.json` | `{ description, input: { document, thresholds, requested }, expected }`: gate cases with hand-written expected reports |
| `contract/fixtures/gate/{valid,invalid}/*.json` | Gate reports, and broken ones (`{ description, errors, report }`) |
| `contract/check.mjs` | Checks any producer's output: strict validation, stored links and inferred associations, canonical form |
| `contract/scan.mjs` | The snapshot scanner for every repository's CI: tracked, untracked, artifact and history scopes, allowlist, report, exit codes ([Snapshot scanning](./contract.md#snapshot-scanning)) |
| `contract/scan-report.schema.json` | JSON Schema 2020-12 for the scan report (`laranex-schema-scan`) |
| `contract/allowlist.schema.json` | JSON Schema 2020-12 for allowlists (`laranex-schema-allowlist`) |
| `contract/synthetic.json` | The allowlist of every synthetic document the package ships, by package-relative path and digest, generated with the files it lists |
| `contract/conformance/scan/*.json` | `{ description, input: { scopes, limit, files, allowlist, allowlists }, expected }`: scanner cases with hand-written expected reports (below) |

## What a producer should test

1. Every valid fixture passes its validator and round-trips to identical canonical bytes.
2. Every invalid fixture is rejected; rule errors use the listed messages.
3. Its graph builder, comparison (with request expansion, coverage gaps, override validation, incomplete
   diagnostics and storing), migration status, inference and gate turn every conformance input into exactly the
   expected output, ids, labels and messages included.
4. Its own output passes `check.mjs`:

```bash
npm install --no-save laranex-schema-viewer-ui@<version>
node node_modules/laranex-schema-viewer-ui/contract/check.mjs build/schema-viewer.json
```

5. Its gate command's reports pass `validateGateReport` (or `contract/gate-report.schema.json` plus the rules in the
   contract), and it rejects the invalid gate fixtures.

6. Its CI scans the repository and its build output, and fails on any non-zero exit (see below).

The Python package runs 1–3 in its test suite against a vendored copy of these files.

## Snapshot scanning

Every repository runs the one scanner, `contract/scan.mjs`, rather than its own copy of the rules:

```bash
node node_modules/laranex-schema-viewer-ui/contract/scan.mjs --tracked --untracked --artifacts dist
```

Its allowlist, `.laranex-schema-allowlist.json` at the repository root, lists the repository's own synthetic fixtures
by path and digest, and includes the package's with
`{ "path": "node_modules/laranex-schema-viewer-ui/contract/synthetic.json", "root": "node_modules/laranex-schema-viewer-ui" }`
when the installed package is scanned. This repository's own allowlist is generated by `npm run contract` and checked
by the tests, so it is always exact.

A scan case is `{ description, input, expected }`:

- `input.files` `[{ scope, path, commit, content | contentBase64 }]`: each file's scope, path, commit (history only,
  else null) and bytes, as UTF-8 text or base64. Content is held as a string, so a case file is itself no snapshot.
- `input.scopes` the scopes scanned; `input.limit` the size limit, null for 64 MiB.
- `input.allowlist` null, or the path of the allowlist to resolve; `input.allowlists` maps each allowlist path to its
  JSON, includes resolved against it (an absent path cannot be read).
- `expected` the exact `laranex-schema-scan` report. Every path a case's allowlist names counts as covered.

`resolveAllowlist(input.allowlist, path => input.allowlists[path])` and `scanFiles({ scopes, files, allowlist, limit })`
turn every input into exactly the expected report.

## Ids and bytes

Rule-based ids are a one-letter prefix plus the first 16 hex digits of the SHA-256 of compact JSON: links
`l` + `["link", fromTable, toTable, sortedPairs]`, derived links `d` + `["derived", relationshipId]`, diagnostics,
comparisons, differences, migration tracks and inferred associations as the contract lists. Canonical documents sort
keys by code point, indent by two spaces and end with a newline. Both are specified in the
[contract](./contract.md#graph), so any language can reproduce them byte for byte.
