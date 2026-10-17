# Installation

## From npm

```bash
npm install laranex-schema-viewer-ui
```

React 19 is a peer dependency for the React component. The contract module (`laranex-schema-viewer-ui/contract`) and
the standalone bundle (`dist/viewer/`) need no peers.

| Import | What it gives you |
| --- | --- |
| `laranex-schema-viewer-ui` | `<SchemaViewer>`, the contract module re-exported, and the layout helpers |
| `laranex-schema-viewer-ui/styles.css` | The viewer's stylesheet, scoped to `.lsv` |
| `laranex-schema-viewer-ui/contract` | Types, `validateDocument`, `buildGraph`, `canonicalJson`, `documentRevision`, `jsonSchema` |
| `laranex-schema-viewer-ui/schema.json` | The contract's JSON Schema (2020-12) |
| `laranex-schema-viewer-ui/contract/*` | Fixtures, graph conformance cases and `check.mjs` |
| `laranex-schema-viewer-ui/viewer/*` | The standalone bundle: `index.html`, `app.js`, `app.css`, `assets/`, `manifest.json` |

## Without Node.js at runtime

Laravel and Python packages ship a copy of `dist/viewer/` inside their own package and serve it as static files. See
[Integrating a host](./integration.md) for the three ways a host hands the document to the bundle and the
Content-Security-Policy it runs under.

## Requirements

- Browsers: current Chromium, Firefox and Safari (container queries, `color-mix()`, ES2022).
- Node.js 22.12 or later to build, test, or use the contract module from Node.
