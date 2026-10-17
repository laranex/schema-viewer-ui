# Laranex Schema Viewer UI

One JSON contract, one shared viewer, many frameworks: the `laranex-schema` contract and the ERD viewer shared by the
Laravel, Python and Node.js schema viewers.

Work in progress. The contract is specified in [docs/contract.md](docs/contract.md); planned work is in
[ROADMAP.md](ROADMAP.md); see `AGENTS.md` for the architecture and development workflow.

```tsx
import { SchemaViewer } from 'laranex-schema-viewer-ui';
import 'laranex-schema-viewer-ui/styles.css';

<SchemaViewer document={laranexSchemaDocument} />;
```

```js
import { validateDocument, buildGraph, canonicalJson } from 'laranex-schema-viewer-ui/contract';
```

Hosts without Node.js serve `node_modules/laranex-schema-viewer-ui/dist/viewer/` as static files with a
`snapshot.json` beside `index.html`, or use `<laranex-schema-viewer src="snapshot.json">`.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
