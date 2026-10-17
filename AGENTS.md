# Laranex Schema Viewer UI

Independent npm package `laranex-schema-viewer-ui`: the shared, framework-independent ERD viewer for Laranex schema snapshots. It ships a React component, a standalone static bundle (`dist/viewer/`) that Laravel, Python and Node hosts serve without Node at runtime, the versioned schema document contract, and adapters for existing Laravel and Python snapshots. It never extracts ORM metadata, touches a database, or contains CLI or MCP code.

## Architecture

- `src/contract/`: the schema document contract. `types.ts` (TypeScript), `schema.json` (distributed JSON Schema), `validate.ts` (shape and cross-reference checks, no dependencies), `upgrade.ts` (older versions to the current one).
- `src/adapters/`: `python.ts` (Python `laranex-schema-viewer` v1 snapshots), `laravel.ts` (Laravel `format: 2` snapshots) and `index.ts` (`normalizeSnapshot()`, detection). Adapters are pure functions from JSON to the current document.
- `src/viewer/`: the React viewer. `graph.ts` (pure graph functions), `layout.ts` and `elk.ts` (ELK automatic layout in a worker), `routing.ts` (orthogonal edges), components, and `styles.css`.
- `src/standalone/`: the static bundle's bootstrap: reads the document from a JSON script tag, `window.__SCHEMA_VIEWER__`, or `data-snapshot-url`.

## Conventions

- The visual design and interaction model follow the Python viewer; layout and routing follow the Laravel viewer. Keep attribution in `NOTICE`.
- Keep foreign-key constraints and ORM relationships separate everywhere: contract, adapters, edges, legend and details.
- Render schema strings as text only: no `dangerouslySetInnerHTML`, no HTML built from schema data.
- The bundle must work under `script-src 'self'` with no CDNs or runtime network access beyond the snapshot URL a host gives it.
- Changing the contract means updating `types.ts`, `schema.json`, `validate.ts`, `upgrade.ts`, the fixtures and the changelog together, and bumping the document version for breaking changes.
- TypeScript strict mode; pinned dependency versions; no unrelated refactoring.

## Development and validation

```bash
npm install
npm run typecheck
npm test                 # unit and component tests (Vitest, jsdom)
npm run build            # dist/lib, dist/types, dist/viewer, dist/schema.json
npm run test:browser     # Playwright against the built viewer (npx playwright install first)
npm run test:package     # npm pack, install into a temporary project, check exports and assets
```

Run focused tests first, then `npm run check`. Report skipped or unavailable browsers accurately.

## Releases

Record user-visible changes under `## [Unreleased]` in `CHANGELOG.md`. Publishing a GitHub release `vX.Y.Z` runs `.github/workflows/publish.yml`: the full test workflow, a tag/version match, a check that the version is not on npm, then npm Trusted Publishing. Do not bypass these gates.

## Safety

- Fixtures are synthetic; never add a real application's snapshot.
- Do not create commits, tags, pushes, releases or publishes without explicit authorization. Never weaken tests or security checks to pass.
- The sibling Laravel and Python repositories are read-only references.
