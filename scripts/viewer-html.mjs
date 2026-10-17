// Finishes dist/viewer for hosts that vendor it:
//   index.html: the page, loading snapshot.json from its own directory. Hosts that inline the document use a
//     script#schema-viewer-data tag or window.__SCHEMA_VIEWER__ instead of data-snapshot-url.
//   favicon.svg and favicon.ico: the Laranex mark (scripts/favicon.mjs), linked by relative URLs so they work under any
//     base path, and at /favicon.ico when a host serves dist/viewer at its root.
//   offline.js: the viewer as one script with ELK inlined (vite.offline.config.ts builds it to dist/offline), which the
//     Download dialog's "This page as HTML" inlines into a self-contained page. Moved here so the manifest lists it.
//   manifest.json: the package and contract versions and every file's size and SHA-256, so a vendored copy can be
//     checked against the release it came from.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { faviconIco, faviconSvg } from './favicon.mjs';

const root = fileURLToPath(new URL('../dist/viewer/', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

renameSync(fileURLToPath(new URL('../dist/offline/offline.js', import.meta.url)), join(root, 'offline.js'));
rmSync(fileURLToPath(new URL('../dist/offline/', import.meta.url)), { recursive: true, force: true });

writeFileSync(join(root, 'favicon.svg'), faviconSvg);
writeFileSync(join(root, 'favicon.ico'), faviconIco());

writeFileSync(
    join(root, 'index.html'),
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="generator" content="laranex-schema-viewer-ui ${version}">
  <title>Laranex Schema Viewer</title>
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="icon" href="favicon.ico" sizes="32x32">
  <link rel="stylesheet" href="app.css">
  <script type="module" src="app.js"></script>
</head>
<body>
  <div id="schema-viewer" data-snapshot-url="snapshot.json"></div>
</body>
</html>
`,
);

const files = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
const entries = files(root)
    .filter((path) => !path.endsWith('manifest.json'))
    .sort()
    .map((path) => {
        const bytes = readFileSync(path);
        return { path: relative(root, path).split('\\').join('/'), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
writeFileSync(join(root, 'manifest.json'), `${JSON.stringify({ name: 'laranex-schema-viewer-ui', version, contract: { format: 'laranex-schema', major: 2 }, entry: { script: 'app.js', style: 'app.css', page: 'index.html', offline: 'offline.js' }, files: entries }, null, 2)}\n`);
