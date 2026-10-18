# Quick start

::: warning Development only
The viewer is for development. Never serve it or a snapshot in production, and protect the page, its files and the
snapshot with server-side authentication, even locally: see [Security](./security.md). To add it to an existing
application, follow [Embedding in client applications](./embedding.md).
:::

## Render a document in React

```tsx
import { SchemaViewer, validateDocument } from 'laranex-schema-viewer-ui';
import 'laranex-schema-viewer-ui/styles.css';

export function Schema({ snapshot }: { snapshot: unknown }) {
    const result = validateDocument(snapshot);
    if (!result.ok) {
        return <pre>{result.errors.join('\n')}</pre>;
    }
    return (
        <div style={{ height: '100vh' }}>
            <SchemaViewer document={result.document} />
        </div>
    );
}
```

The viewer fills its container, so give the container a height.

## Serve the static bundle

Copy `node_modules/laranex-schema-viewer-ui/dist/viewer/` anywhere static files are served and put your document
beside `index.html` as `snapshot.json`:

```text
schema/
├── index.html
├── app.js
├── app.css
├── assets/
├── manifest.json
└── snapshot.json   ← your laranex-schema document
```

Open `schema/index.html` through a web server (not `file://`, which blocks `fetch`) that requires authentication for
every file in `schema/`, the snapshot included. Keep `snapshot.json` out of version control.

## Or use the element

```html
<link rel="stylesheet" href="/schema/app.css">
<script type="module" src="/schema/app.js"></script>

<laranex-schema-viewer src="/schema/snapshot.json" style="height: 100vh"></laranex-schema-viewer>
```

## Check a document

```bash
node node_modules/laranex-schema-viewer-ui/contract/check.mjs snapshot.json
```

`check.mjs` validates strictly, compares the stored links and inferred associations with the shared builders, and checks canonical form.
