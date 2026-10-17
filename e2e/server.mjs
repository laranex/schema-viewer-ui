// Serves the built standalone viewer (dist/viewer) the way a strict host would: script-src 'self', no inline scripts,
// no eval, no workers from blobs. Pages:
//   /f/<fixture>/          the viewer, fetching snapshot.json (a contract fixture)
//   /inline/<fixture>/     the viewer, with the document inline in script#schema-viewer-data
//   /element/<fixture>/    <laranex-schema-viewer src="snapshot.json">
//   /f/invalid/            a document the viewer must refuse
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const viewer = join(root, 'dist/viewer');
const port = Number(process.env.PORT ?? 4180);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' };
// The Python package's viewer policy (src/laranex_schema_viewer/server.py), so passing here means the bundle drops in.
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const fixture = (name) => {
    if (name === 'invalid') {
        return JSON.stringify({ format: 'laranex-schema', version: '1.0', connections: 'nope' });
    }
    const path = join(root, 'contract/fixtures/valid', `${name}.json`);
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Schema viewer test</title><link rel="stylesheet" href="app.css"><script type="module" src="app.js"></script></head><body>${body}</body></html>`;

createServer((request, response) => {
    const send = (status, type, body) => {
        response.writeHead(status, { 'Content-Type': type, 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
        response.end(body);
    };
    const [, mode, name, ...rest] = new URL(request.url, 'http://x').pathname.split('/');
    const file = rest.join('/');
    if (!['f', 'inline', 'element'].includes(mode) || !name) {
        return send(404, 'text/plain', 'not found');
    }
    const json = fixture(name);
    if (file === '') {
        if (json === null) {
            return send(404, 'text/plain', 'no such fixture');
        }
        const escaped = json.replace(/</g, '\\u003c');
        const body =
            mode === 'inline'
                ? `<div id="schema-viewer"></div><script type="application/json" id="schema-viewer-data">${escaped}</script>`
                : mode === 'element'
                  ? '<laranex-schema-viewer src="snapshot.json" style="height:100vh"></laranex-schema-viewer>'
                  : '<div id="schema-viewer" data-snapshot-url="snapshot.json"></div>';
        return send(200, 'text/html', page(body));
    }
    if (file === 'snapshot.json') {
        return json === null ? send(404, 'text/plain', 'no such fixture') : send(200, 'application/json', json);
    }
    const path = normalize(join(viewer, file));
    if (!path.startsWith(viewer) || !existsSync(path)) {
        return send(404, 'text/plain', 'not found');
    }
    send(200, types[extname(path)] ?? 'application/octet-stream', readFileSync(path));
}).listen(port, '127.0.0.1');
