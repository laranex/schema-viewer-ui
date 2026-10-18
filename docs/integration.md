# Integrating the shared viewer

::: tip Adding the viewer to your own application?
This page is for framework packages that host the viewer. To embed it in an existing application as a protected,
development-only page, see [Embedding in client applications](./embedding.md) and [Security](./security.md).
:::

Every host renders the same viewer from the same `laranex-schema` document. Hosts differ only in how they produce the
document (see [contract.md](contract.md)) and how they serve the page.

Put every connection the host reads in one document, each with its own `driver`: the viewer frames them, qualifies
labels by connection and keeps cross-connection relationships visible. `defaultConnection` (or `#connection=`) takes a
connection **id**; an unknown id opens every connection. Table ids must be unique across connections, so qualify them by
connection; foreign keys stay inside their connection.

## React applications

```tsx
import { SchemaViewer } from 'laranex-schema-viewer-ui';
import 'laranex-schema-viewer-ui/styles.css';

export function Schema({ document }) {
    return (
        <div style={{ height: '100vh' }}>
            <SchemaViewer document={document} editor="vscode://file/{file}:{line}" />
        </div>
    );
}
```

| Prop | Meaning |
|---|---|
| `document` | A `laranex-schema` 2.x document. Validate untrusted input with `validateDocument()` first. |
| `changes`, `downloads`, `editor`, `defaultConnection` | Host settings, as in `ViewerConfig`. |
| `extensionRenderers` | `{ [namespace]: (value) => ReactNode }` for rich rendering of one extension namespace. Others render generically. |
| `theme`, `onThemeChange`, `persistTheme` | Controlled or remembered theme. |
| `deepLinks` | Keep the view in the URL hash (default true). |
| `downloadHref` | Where Download JSON points, or `null` to hide it. |

The component fills its container; give the container a height. Styles are scoped to `.lsv`.

## Hosts without Node.js (Laravel, Python)

Ship `dist/viewer/` from the npm package inside the host package: `index.html`, `app.js`, `app.css`, `assets/`, and
the favicon `favicon.svg` and `favicon.ico` (16 and 32 pixels), which `index.html` links by relative URLs. Check
the copy against `manifest.json`, which lists every file's size and SHA-256 and the contract major it reads. At runtime
the host serves those files and gives the viewer the document in one of three ways.

1. **A snapshot URL.** Serve the document as `snapshot.json` beside `index.html`, as the Python package does with
   `/snapshot.json`. The bundled `index.html` already has `<div id="schema-viewer" data-snapshot-url="snapshot.json">`.
2. **An inline JSON block.** Render the page with `<script type="application/json" id="schema-viewer-data">` holding
   the document or a `ViewerConfig`. Escape every `<` as `\u003c` inside it. It is data, not script, so no CSP nonce is
   needed.
3. **A global.** Set `window.__SCHEMA_VIEWER__ = { document, … }` from a script the page's CSP allows (for example a
   nonce-bearing script, as Laravel's page does) before `app.js` runs.

Pages that use no framework can also write `<laranex-schema-viewer src="snapshot.json"></laranex-schema-viewer>` and
include `app.css` and `app.js`, or call `window.LaranexSchemaViewer.mount(element, url)`.

### Content-Security-Policy

The bundle runs under `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` (the Python server's
policy; the browser tests use it). It uses no inline scripts, `eval`, workers or blob/data images: ELK lays out on the
page from a lazily loaded module, and PNG export draws straight onto a canvas. The Download dialog's exports run in the
page; the offline HTML export and the SVG's embedded fonts only fetch `offline.js`, `app.css`, `favicon.svg` and the
fonts from the bundle's own directory (same origin). `style-src 'unsafe-inline'` covers React
Flow's positioning styles.

### Assets

`app.js` (≈145 kB gzipped) loads `assets/elk.bundled-*.js` (≈440 kB gzipped) when it first lays out. Fonts are IBM
Plex Sans and Mono, latin subset, in `assets/`. `offline.js` (≈2 MB, ≈620 kB gzipped) is the viewer as one script
with ELK inlined; it is only fetched when someone saves the page as offline HTML. Serve `assets/*` as static files with long cache lifetimes; their
names carry content hashes. `app.js`, `app.css` and `index.html` keep fixed names, so serve them with revalidation.

## Versions

The viewer reads every 2.x document and refuses others, including `laranex-schema` 1.0, with a clear message. Hosts
write 2.0 directly; the viewer has no adapters or converters.
