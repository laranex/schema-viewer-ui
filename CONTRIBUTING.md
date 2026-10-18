# Contributing

The architecture, conventions and full validation workflow are in [AGENTS.md](AGENTS.md). Record user-visible changes
under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).

## Fixtures are synthetic

- Every schema document in this repository is synthetic. Never add a real application's snapshot or export, not even
  a trimmed one, and never commit credentials, tokens or `.env` files.
- Fixtures are generated: `contract/` from `tests/fixtures/*.ts`, the export golden files in `tests/fixtures/export/`
  (`UPDATE_EXPORTS=1 npx vitest run tests/export.test.ts`), the viewer documents in `tests/viewer-documents/`
  (`UPDATE_VIEWER_DOCUMENTS=1 npx vitest run tests/intelligence.test.tsx`). Review every regenerated file.
- A new or changed synthetic document needs a regenerated allowlist entry and review: run `npm run contract` after
  the fixture. It regenerates `contract/` with `contract/synthetic.json` (every synthetic document the package ships)
  and the repository's `.laranex-schema-allowlist.json` (`tests/fixtures/export`, `tests/viewer-documents` and the
  docs site's demo snapshots). A test fails when either is stale. Review every allowlist change: an entry is a
  decision that the file may be committed, not proof that it is harmless.

## Before you commit

```bash
npm run typecheck
npm test
npm run build
npm run contract:check
node contract/scan.mjs --tracked --untracked --artifacts dist   # the scan CI runs; any non-zero exit fails
npm run test:package                                            # also scans the packed tarball
```

`npm run check` runs all but the scan. For the documentation site, build the package first, then
`cd .gh-page && npm ci && npm run check` (it also scans the built site). Browser tests: `npm run test:browser`
(see AGENTS.md).

## Security issues

Do not report vulnerabilities in public issues or pull requests. See [SECURITY.md](SECURITY.md).
