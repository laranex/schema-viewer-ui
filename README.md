# Laranex Schema Viewer UI

One JSON contract, one shared viewer, many frameworks: the `laranex-schema` contract and the ERD viewer shared by the
Laravel, Python and Node.js schema viewers.

The contract is specified in [docs/contract.md](docs/contract.md); hosts integrate the viewer as described in
[docs/integration.md](docs/integration.md); planned work is in
[ROADMAP.md](ROADMAP.md); see `AGENTS.md` for the architecture and development workflow.

```tsx
import { SchemaViewer } from 'laranex-schema-viewer-ui';
import 'laranex-schema-viewer-ui/styles.css';

<SchemaViewer document={laranexSchemaDocument} />;
```

```js
import { validateDocument, buildGraph, canonicalJson } from 'laranex-schema-viewer-ui/contract';
import { dbml, mermaid, markdown, json } from 'laranex-schema-viewer-ui/export';
```

The viewer's Download dialog exports a connection as Mermaid, DBML, Markdown or a scoped JSON document, the diagram as
SVG or PNG, and the whole viewer as one offline HTML file, all in the browser; see [docs/exports.md](docs/exports.md).

The viewer displays the comparisons, migration tracks and inferred associations a document stores (Compare and
Migrations tabs, difference marks on the diagram, inferred marks on foreign-key edges) and never computes them; see
[docs/views.md](docs/views.md).

The viewer is a development-only tool: never expose it or its snapshots in production, and require authentication
even in local development. [docs/embedding.md](docs/embedding.md) shows how to add it to an existing React, Next.js,
Vue, Angular, FastAPI or Node.js application as a protected development page; [docs/security.md](docs/security.md) is
the policy.

Hosts without Node.js serve `node_modules/laranex-schema-viewer-ui/dist/viewer/` as static files (including its
`favicon.svg` and `favicon.ico`) with a `snapshot.json` beside `index.html`, or use
`<laranex-schema-viewer src="snapshot.json">`. Using the viewer (layout, connections, line ends, column details,
shortcuts and deep links) is described in [docs/viewer.md](docs/viewer.md).

Its icons, brand mark, favicon and line ends come from Laranex Laravel Schema Viewer, drawn in this package's own
theme colors (see NOTICE); [docs/parity.md](docs/parity.md) compares the two viewers feature by feature.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
