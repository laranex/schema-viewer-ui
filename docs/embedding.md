# Embedding in client applications

This guide shows how to add the Schema Viewer to an existing application as a **protected, development-only page**:
a React component in a React or Next.js app, or the standalone viewer opened as a page or in an `<iframe>` from Vue,
Angular or any other frontend, served by the application's own development server or backend.

::: danger Development only. Authentication is mandatory.
Never enable, bundle or serve the Schema Viewer or its snapshots in production. Require authentication even for local
development, and protect the page, every viewer file and the schema JSON on the server. Read [Security](./security.md)
first: it is the policy every example below follows.
:::

The framework packages also have their own local viewer (`node-schema-viewer serve`, Python's
`laranex-schema-viewer serve`, Laravel's route): a separate server on loopback for one developer. Embedding is for
when the viewer belongs inside your application's development environment, behind its sign-in.

## Supported methods

| Method | What you use | Fits | Where the viewer's code comes from |
| --- | --- | --- | --- |
| [React component](#react-vite) | `<SchemaViewer>` and `styles.css` from `laranex-schema-viewer-ui` | React 19 apps: [Vite](#react-vite), [Next.js](#next-js) | Your bundler, in development builds only |
| [Standalone viewer](#serve-the-standalone-viewer) | The prebuilt `laranex-schema-viewer-ui/viewer/*` files, opened as a page or in an `<iframe>` | Any frontend: [Vue](#vue), [Angular](#angular), server-rendered pages | Your dev server or backend, under the protected prefix |
| [`<laranex-schema-viewer>` element](#vue) | The custom element that the standalone `app.js` defines | Pages that can load a module script (Vue, plain HTML) | Your dev server or backend, under the protected prefix |

Either way the browser reads a [laranex-schema 2.0 snapshot](#load-a-laranex-schema-2-0-snapshot) from a protected
URL on the same origin.

### Not supported

- **No Vue, Angular or Svelte components.** Use the standalone viewer in an `<iframe>` (recommended) or the custom
  element.
- **The custom element is not an npm export.** `<laranex-schema-viewer>` is defined by the standalone bundle's
  `app.js`, not by any `import` from `laranex-schema-viewer-ui`. It has no Shadow DOM: `app.css` sets
  `html, body { height: 100%; margin: 0 }` and font faces for the whole page. Removing the element does not unmount
  the viewer (there is no unmount API) until the page reloads. Prefer the `<iframe>` in single-page applications.
- **No server-side rendering.** The viewer renders in the browser only; in Next.js it lives in a client component.
- **No framework middleware or mount helper in this package.** Your server serves the files. The examples below show
  how; [Node.js Schema Viewer](https://laranex.github.io/node-schema-viewer/embedding.html) has tested Express,
  Fastify, NestJS and Next.js versions.
- **The standalone page's snapshot URL is fixed.** `index.html` loads `snapshot.json` from its own directory. For
  another URL, use the element's `src`, `window.LaranexSchemaViewer.mount(element, url)` or an inline
  `script#schema-viewer-data` ([Integrating a host](./integration.md)).
- **Same origin only.** The bundle runs under `script-src 'self'`, loads its own files relative to `app.js` and fetches
  the snapshot with `credentials: 'same-origin'`. Serving it from a CDN or another origin is not supported.
- **laranex-schema 2.x only.** A 1.x snapshot is refused with a message; nothing converts it.

## The shape of a protected embedding

Every example below serves the same paths, all behind **one** server-side check:

```text
/dev/schema-viewer/                 the page: the standalone index.html, or your application's page
/dev/schema-viewer/app.js           app.css, offline.js, favicon.svg, favicon.ico, assets/* (standalone viewer)
/dev/schema-viewer/snapshot.json    the laranex-schema document
```

1. **One check before everything.** The check runs on the server (middleware, a route dependency, a proxy) before any
   file or the snapshot is read. Unauthorized requests get `401` with `WWW-Authenticate: Basic realm="…"` and a body
   that says nothing about the schema.
2. **Development only, opt-in.** The routes exist only when `SCHEMA_VIEWER_ENABLED=1` is set in a development
   environment. Production mode (`NODE_ENV=production`, `APP_ENV=production`, `vite build`, `next build`, `ng build`)
   never registers them, even with the variable set, and the build output contains neither the viewer nor the snapshot.
3. **The snapshot stays outside the build.** The server reads it from `SCHEMA_VIEWER_SNAPSHOT`, a path outside
   `public/`, `static/` and your source tree, on every request.
4. **Manifest files only.** Serve exactly the files `viewer/manifest.json` lists (checking their SHA-256 costs
   nothing at startup), never the whole package directory. Every response, errors included, carries
   `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; viewer files carry the
   [Content-Security-Policy](./integration.md#content-security-policy). Use `frame-ancestors 'self'` only when your
   own pages show the viewer in an `<iframe>`; otherwise `'none'`.
5. **One prefix, one origin.** With the page, its files and the snapshot under the same prefix, the browser sends the
   same credentials for the snapshot request it already sent for the page.

The examples read these variables. Set them in your shell or a secret manager, never in a committed file, and never
with a prefix that a bundler exposes to the browser (`VITE_`, `NEXT_PUBLIC_`):

| Variable | Meaning |
| --- | --- |
| `SCHEMA_VIEWER_ENABLED` | `1` turns the viewer on in a development environment. Anything else: no routes. |
| `SCHEMA_VIEWER_USER`, `SCHEMA_VIEWER_PASSWORD` | HTTP Basic Auth credentials. The examples refuse to start without them and refuse passwords under 16 characters. |
| `SCHEMA_VIEWER_SNAPSHOT` | Absolute path of the snapshot, outside every public or bundled directory. |

```bash
export SCHEMA_VIEWER_ENABLED=1 SCHEMA_VIEWER_USER="$USER"
read -rs 'SCHEMA_VIEWER_PASSWORD?Schema viewer password: ' && export SCHEMA_VIEWER_PASSWORD   # zsh; bash: read -rsp '…' SCHEMA_VIEWER_PASSWORD
export SCHEMA_VIEWER_SNAPSHOT="$HOME/.local/share/my-app/schema-viewer.json"
```

HTTP Basic Auth is the minimum. Where your application already has developer or admin sign-in, put that check in the
same place instead ([Authentication](#authentication)).

## Load a laranex-schema 2.0 snapshot

- **Produce it** with your framework's package: [Python Schema Viewer](https://laranex.github.io/python-schema-viewer/)
  (`laranex-schema-viewer build`), [Node.js Schema Viewer](https://laranex.github.io/node-schema-viewer/) or Laravel
  Schema Viewer. Producers write laranex-schema 2.0; the viewer reads any 2.x document.
- **Check it** before use: `node node_modules/laranex-schema-viewer-ui/contract/check.mjs schema-viewer.json`.
- **Keep it out of the frontend.** Never `import` it, never put it in `public/` or `static/`, never inline it in an
  environment variable. Write it to a path outside the project or add it to `.gitignore` (and your container build's
  ignore file). Never commit it.
- **Serve it from a protected endpoint** that reads it on every request, so a rebuilt snapshot shows up on reload.
  The standalone viewer and the React example both validate it in the browser with `validateDocument` and show the
  errors instead of a diagram when it is not a 2.x document.

## React (Vite)

The React component is a client-side React 19 component; `react` and `react-dom` 19 are peer dependencies. Install the
package as a development dependency so production installs do not contain it:

```bash
npm install --save-dev laranex-schema-viewer-ui
```

In Vite's dev server, your pages, the viewer's modules (from `node_modules/.vite/deps/`) and your source files are all
served at their own URLs. So this plugin puts Basic Auth in front of **the whole dev server** while the viewer is
enabled, and serves the snapshot. `apply: 'serve'` keeps it out of `vite build` and `vite preview`. With
`standalone: true` it also serves the prebuilt viewer at `/dev/schema-viewer/` (used by the [Vue](#vue) example).

::: code-group

```ts [dev-schema-viewer.ts]
// Development-only Vite plugin: HTTP Basic Auth in front of the whole dev server, the snapshot at
// /dev/schema-viewer/snapshot.json and, with standalone: true, the prebuilt viewer at /dev/schema-viewer/.
// apply: 'serve' keeps it out of `vite build` and `vite preview`.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import type { Plugin } from 'vite';
import { canonicalJson, validateDocument } from 'laranex-schema-viewer-ui/contract';

const PREFIX = '/dev/schema-viewer/';
const TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};
// The policy the bundle is built for; frame-ancestors 'self' lets the application's own pages show it in an iframe.
const POLICY = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest();

// Only the files the bundle's manifest lists, each checked against its SHA-256.
function viewerFiles(): Map<string, { body: Buffer; type: string }> {
    const directory = dirname(createRequire(import.meta.url).resolve('laranex-schema-viewer-ui/viewer/manifest.json'));
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as { files: { path: string; sha256: string }[] };
    const files = new Map<string, { body: Buffer; type: string }>();
    for (const { path, sha256 } of manifest.files) {
        const type = TYPES[extname(path)];
        if (type === undefined) continue;
        const body = readFileSync(join(directory, path));
        if (digest(body).toString('hex') !== sha256) throw new Error(`Viewer file ${path} does not match its manifest`);
        files.set(path, { body, type });
    }
    return files;
}

export function devSchemaViewer({ standalone = false } = {}): Plugin {
    return {
        name: 'dev-schema-viewer',
        apply: 'serve',
        configureServer(server) {
            const { SCHEMA_VIEWER_ENABLED, SCHEMA_VIEWER_USER: user, SCHEMA_VIEWER_PASSWORD: password, SCHEMA_VIEWER_SNAPSHOT: snapshot } = process.env;
            if (SCHEMA_VIEWER_ENABLED !== '1') return;
            if (!user || !password || password.length < 16 || !snapshot) {
                throw new Error('SCHEMA_VIEWER_USER, SCHEMA_VIEWER_PASSWORD (16+ characters) and SCHEMA_VIEWER_SNAPSHOT are required');
            }
            const files = standalone ? viewerFiles() : new Map<string, { body: Buffer; type: string }>();
            const send = (response: ServerResponse, status: number, type: string, body: Buffer | string, headers: Record<string, string> = {}) => {
                response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
                response.end(body);
            };
            const authorized = (header = '') => {
                const match = /^Basic[ ]+([A-Za-z0-9+/=]+)$/i.exec(header);
                const decoded = match ? Buffer.from(match[1]!, 'base64').toString('utf8') : '';
                const colon = decoded.indexOf(':');
                // Both comparisons always run, on digests of equal length.
                const userOk = timingSafeEqual(digest(colon === -1 ? '' : decoded.slice(0, colon)), digest(user));
                const passwordOk = timingSafeEqual(digest(colon === -1 ? '' : decoded.slice(colon + 1)), digest(password));
                return colon !== -1 && userOk && passwordOk;
            };

            // Every request to the dev server: your pages, their modules, the viewer's code and the snapshot.
            server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
                if (authorized(request.headers.authorization)) return next();
                send(response, 401, 'text/plain; charset=utf-8', 'Authentication required\n', {
                    'WWW-Authenticate': 'Basic realm="Schema Viewer (development)", charset="UTF-8"',
                });
            });
            server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
                const path = (request.url ?? '').split('?')[0]!;
                if (!path.startsWith(PREFIX)) return next();
                const name = path.slice(PREFIX.length) || 'index.html';
                if (name === 'snapshot.json') {
                    try {
                        // Read and validated on every request, so a rebuilt snapshot shows up on reload.
                        const result = validateDocument(JSON.parse(readFileSync(snapshot, 'utf8')));
                        if (!result.ok) throw new Error('invalid');
                        return send(response, 200, 'application/json; charset=utf-8', canonicalJson(result.document));
                    } catch {
                        return send(response, 503, 'text/plain; charset=utf-8', 'Snapshot unavailable\n');
                    }
                }
                const file = files.get(name);
                if (file === undefined) return next();
                send(response, 200, file.type, file.body, { 'Content-Security-Policy': POLICY });
            });
        },
    };
}
```

:::

::: code-group

```ts [vite.config.ts]
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { devSchemaViewer } from './dev-schema-viewer';

export default defineConfig({
    plugins: [react(), devSchemaViewer()],
    server: { host: '127.0.0.1' },
});
```

:::

The page only renders under `import.meta.env.DEV`, which `vite build` replaces with `false`, so the branch, the page and
`laranex-schema-viewer-ui` are dropped from the production bundle:

::: code-group

```tsx [src/main.tsx]
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = createRoot(document.getElementById('root')!);

if (import.meta.env.DEV && location.pathname === '/dev/schema-viewer') {
    // `vite build` replaces import.meta.env.DEV with false and drops this branch, so neither the page nor
    // laranex-schema-viewer-ui reaches the production bundle.
    void import('./dev/SchemaViewerPage').then(({ SchemaViewerPage }) => {
        root.render(
            <StrictMode>
                <SchemaViewerPage snapshotUrl="/dev/schema-viewer/snapshot.json" />
            </StrictMode>,
        );
    });
} else {
    root.render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
```

:::

::: code-group

```tsx [src/dev/SchemaViewerPage.tsx]
import { useEffect, useState } from 'react';
import { SchemaViewer, validateDocument, type SchemaDocument } from 'laranex-schema-viewer-ui';
import 'laranex-schema-viewer-ui/styles.css';

type State = { document: SchemaDocument } | { error: string } | null;

export function SchemaViewerPage({ snapshotUrl }: { snapshotUrl: string }) {
    const [state, setState] = useState<State>(null);

    useEffect(() => {
        let active = true;
        fetch(snapshotUrl, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`The snapshot request failed (${response.status}).`))))
            .then((data: unknown) => {
                const result = validateDocument(data);
                if (active) {
                    setState(result.ok ? { document: result.document } : { error: result.errors.join('\n') });
                }
            })
            .catch((error: unknown) => {
                if (active) {
                    setState({ error: error instanceof Error ? error.message : String(error) });
                }
            });
        return () => {
            active = false;
        };
    }, [snapshotUrl]);

    if (state === null) {
        return <p>Loading the schema…</p>;
    }
    if ('error' in state) {
        return <pre>{state.error}</pre>;
    }
    return (
        <div style={{ height: '100dvh' }}>
            <SchemaViewer document={state.document} downloadHref={snapshotUrl} />
        </div>
    );
}
```

:::

With a router, add the route inside the same `import.meta.env.DEV` branch and load the page with a dynamic `import()`.
Never guard the route only at run time: a guard decides what the UI shows, not what the server sends.

Open `http://127.0.0.1:5173/dev/schema-viewer` and sign in when the browser asks. The component fills its container,
so give the container a height; other props are in the [React API](./react.md).

## Next.js

Next.js needs both halves:

- **Server-side protection.** `proxy.ts` answers every request under `/dev/schema-viewer` with `404` unless the viewer
  is enabled and with `401` without valid credentials. The route handler that serves the snapshot (and, if you use it,
  the standalone viewer's files) and the page check again, so the proxy is not the only control.
- **Client-side rendering.** The page renders a `'use client'` component, the same as `SchemaViewerPage` above with
  `'use client'` as its first line. It fetches the snapshot from the protected route handler after the page loads, so
  the schema is never part of a JavaScript bundle or the server-rendered HTML.
- **Production exclusion.** The viewer's page and route handler are `*.dev.tsx` / `*.dev.ts` files, and
  `next.config.mjs` adds those extensions to `pageExtensions` only in `next dev` with `SCHEMA_VIEWER_ENABLED=1`. In
  `next build` they are not routes at all, so the build contains no viewer page, handler, code or snapshot.

::: code-group

```js [next.config.mjs]
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

// The viewer's routes are *.dev.ts(x) files. They are routes only in `next dev` with SCHEMA_VIEWER_ENABLED=1; every
// other phase, `next build` included, does not treat them as routes, so the production build has no viewer page, no
// viewer route handler and no viewer code.
export default function config(phase) {
    const devViewer = phase === PHASE_DEVELOPMENT_SERVER && process.env.SCHEMA_VIEWER_ENABLED === '1';
    return {
        pageExtensions: devViewer ? ['dev.tsx', 'dev.ts', 'tsx', 'ts'] : ['tsx', 'ts'],
        // node-schema-viewer reads the viewer files beside its own module at run time; let Node.js load it unbundled.
        serverExternalPackages: ['node-schema-viewer'],
        poweredByHeader: false,
        agentRules: false,
    };
}
```

:::

The complete, tested files (`proxy.ts`, the route handler, the page and the client component) are in
[Node.js Schema Viewer's embedding guide](https://laranex.github.io/node-schema-viewer/embedding.html#next-js).

::: warning What the proxy does not cover
With the React component, Next.js serves the page's JavaScript chunks from `/_next/static/`, outside
`/dev/schema-viewer`. In `next dev` those chunks hold the viewer's library code, never the schema. If your policy
requires the viewer's code to be unreachable without credentials too, use the standalone viewer's route handler, which
serves every viewer file under the protected prefix, or put the whole development server behind authentication.
:::

## Serve the standalone viewer

The standalone viewer is static: `index.html`, `app.js`, `app.css`, `offline.js`, `favicon.svg`, `favicon.ico` and
`assets/*`, listed with their sizes and SHA-256 in `manifest.json`. Find the directory with
`require.resolve('laranex-schema-viewer-ui/viewer/manifest.json')` in Node.js, or at
`node_modules/laranex-schema-viewer-ui/dist/viewer/` in a frontend workspace. Serve it under a prefix that ends with a
slash (`/dev/schema-viewer/`), because `index.html` loads `app.css`, `app.js` and `snapshot.json` by relative URLs,
and serve the snapshot as `snapshot.json` in the same directory.

The [Vite plugin](#react-vite) does this with `standalone: true`, the [FastAPI](#fastapi-backend-with-a-react-or-vue-frontend)
module below does it in Python, and the [Node.js examples](https://laranex.github.io/node-schema-viewer/embedding.html)
do it in Express, Fastify, NestJS and Next.js.

## Vue

Vue has no Schema Viewer component. Serve the standalone viewer under the protected prefix, here with the Vite plugin
from the [React section](#react-vite) and `standalone: true` (or from your backend with a [dev-server
proxy](#node-js-backend-with-a-frontend)), and show it in an `<iframe>`, or use the custom element.

::: code-group

```ts [vite.config.ts]
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { devSchemaViewer } from './dev-schema-viewer';

export default defineConfig({
    plugins: [
        vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === 'laranex-schema-viewer' } } }),
        devSchemaViewer({ standalone: true }),
    ],
    server: { host: '127.0.0.1' },
});
```

:::

::: code-group

```ts [src/main.ts]
import { createApp } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import App from './App.vue';
import Home from './Home.vue';

const routes: RouteRecordRaw[] = [{ path: '/', component: Home }];
if (import.meta.env.DEV) {
    // `vite build` replaces import.meta.env.DEV with false and drops these routes and their components.
    routes.push(
        { path: '/dev/schema', component: () => import('./dev/SchemaViewerFrame.vue') },
        { path: '/dev/schema-element', component: () => import('./dev/SchemaViewerElement.vue') },
    );
}

createApp(App).use(createRouter({ history: createWebHistory(), routes })).mount('#app');
```

:::

The `<iframe>` keeps the viewer's styles and lifetime separate from your application. The plugin sends
`frame-ancestors 'self'`, so only your own pages can frame it:

::: code-group

```vue [src/dev/SchemaViewerFrame.vue]
<template>
  <iframe src="/dev/schema-viewer/" title="Schema viewer" class="schema-viewer"></iframe>
</template>

<style scoped>
.schema-viewer {
  display: block;
  width: 100%;
  height: 100dvh;
  border: 0;
}
</style>
```

:::

Or the custom element, with the caveats listed under [Not supported](#not-supported) (global styles, no unmount):

::: code-group

```vue [src/dev/SchemaViewerElement.vue]
<script setup lang="ts">
import { onMounted, ref } from 'vue';

const base = '/dev/schema-viewer/';
const ready = ref(false);

// app.js defines <laranex-schema-viewer> once per page; app.css is the bundle's global stylesheet.
function load(): Promise<void> {
  if (customElements.get('laranex-schema-viewer')) return Promise.resolve();
  if (!document.querySelector(`link[href="${base}app.css"]`)) {
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: `${base}app.css` }));
  }
  return new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), { type: 'module', src: `${base}app.js` });
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('The schema viewer could not be loaded')));
    document.head.append(script);
  });
}

onMounted(async () => {
  await load();
  ready.value = true;
});
</script>

<template>
  <laranex-schema-viewer v-if="ready" :src="`${base}snapshot.json`" style="height: 100dvh"></laranex-schema-viewer>
</template>
```

:::

## Angular

Angular has no Schema Viewer component, and the Angular CLI's dev server takes no Vite plugins. Let your backend serve
and protect the standalone viewer (the [FastAPI](#fastapi-backend-with-a-react-or-vue-frontend) or
[Node.js](#node-js-backend-with-a-frontend) examples), proxy `/dev/schema-viewer` to it from `ng serve`, and show it in
an `<iframe>`. The `Authorization` header passes through the proxy.

::: code-group

```json [proxy.conf.json]
{
  "/dev/schema-viewer": { "target": "http://127.0.0.1:8000" }
}
```

:::

Register the proxy for the development configuration only, and replace the development routes in the production
configuration, so `ng build` contains neither the route nor the component:

::: code-group

```json [angular.json (excerpt)]
{
  "projects": {
    "my-app": {
      "architect": {
        "build": {
          "configurations": {
            "production": {
              "fileReplacements": [{ "replace": "src/app/dev-routes.ts", "with": "src/app/dev-routes.prod.ts" }]
            }
          }
        },
        "serve": {
          "configurations": {
            "development": { "proxyConfig": "proxy.conf.json" }
          }
        }
      }
    }
  }
}
```

:::

::: code-group

```ts [src/app/dev-routes.ts]
import { Routes } from '@angular/router';

// Development builds only: the production configuration replaces this file with dev-routes.prod.ts.
export const devRoutes: Routes = [
  { path: 'dev/schema', loadComponent: () => import('./dev/schema-viewer-frame').then((m) => m.SchemaViewerFrame) },
];
```

:::

::: code-group

```ts [src/app/dev-routes.prod.ts]
import { Routes } from '@angular/router';

export const devRoutes: Routes = [];
```

:::

::: code-group

```ts [src/app/app.routes.ts]
import { Routes } from '@angular/router';
import { devRoutes } from './dev-routes';

export const routes: Routes = [...devRoutes];
```

:::

::: code-group

```ts [src/app/dev/schema-viewer-frame.ts]
import { Component } from '@angular/core';

// The standalone viewer, served and protected by the backend under /dev/schema-viewer/ (proxied by `ng serve`).
@Component({
  selector: 'app-schema-viewer-frame',
  template: `<iframe src="/dev/schema-viewer/" title="Schema viewer"></iframe>`,
  styles: `iframe { display: block; width: 100%; height: 100dvh; border: 0; }`,
})
export class SchemaViewerFrame {}
```

:::

`ng serve` itself serves your application shell and this small component without the backend's check. They contain
only the `<iframe>`'s URL; the viewer's files and the snapshot come from the backend, which checks every request. Put
the dev server behind your reverse proxy's authentication if your policy covers the application shell too.

## FastAPI backend with a React or Vue frontend

In a monorepo with a FastAPI backend and a Vite frontend, the frontend installs `laranex-schema-viewer-ui` as a
development dependency and the backend serves the standalone viewer from the frontend's `node_modules` in
development:

```text
backend/                 FastAPI (Python 3.10+)
  main.py
  dev_schema_viewer.py
frontend/                Vite (React or Vue)
  node_modules/laranex-schema-viewer-ui/dist/viewer/
```

[Python Schema Viewer](https://laranex.github.io/python-schema-viewer/) builds the snapshot
(`laranex-schema-viewer build`) and has its own local viewer, but it does not provide an ASGI app or router to mount
into FastAPI. This module serves the bundle itself, behind HTTP Basic Auth checked with `secrets.compare_digest`:

::: code-group

```python [backend/dev_schema_viewer.py]
"""Development-only Schema Viewer for a FastAPI backend, behind HTTP Basic Auth.

Serves the prebuilt viewer from the frontend's node_modules (only the files its manifest lists, checked by SHA-256)
and the snapshot at /dev/schema-viewer/snapshot.json. Returns no router unless SCHEMA_VIEWER_ENABLED=1 and
APP_ENV is not "production".
"""

import base64
import binascii
import hashlib
import json
import os
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

PREFIX = "/dev/schema-viewer"
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}
POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "object-src 'none'; base-uri 'none'; frame-ancestors 'self'"
)
HEADERS = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
REALM = "Schema Viewer (development)"


def _viewer_files(directory: Path) -> dict[str, tuple[bytes, str]]:
    manifest = json.loads((directory / "manifest.json").read_text("utf-8"))
    files = {}
    for entry in manifest["files"]:
        media_type = TYPES.get(Path(entry["path"]).suffix)
        if media_type is None:
            continue
        body = (directory / entry["path"]).read_bytes()
        if hashlib.sha256(body).hexdigest() != entry["sha256"]:
            raise RuntimeError(f"Viewer file {entry['path']} does not match its manifest")
        files[entry["path"]] = (body, media_type)
    return files


def _basic_credentials(header: str) -> tuple[bytes, bytes]:
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "basic":
        return b"", b""
    try:
        decoded = base64.b64decode(value.strip(), validate=True)
    except binascii.Error:
        return b"", b""
    given_user, colon, given_password = decoded.partition(b":")
    return (given_user, given_password) if colon else (b"", b"")


def dev_schema_viewer() -> APIRouter | None:
    env = os.environ
    if env.get("APP_ENV") == "production" or env.get("SCHEMA_VIEWER_ENABLED") != "1":
        return None
    missing = [name for name in ("SCHEMA_VIEWER_USER", "SCHEMA_VIEWER_PASSWORD", "SCHEMA_VIEWER_SNAPSHOT") if not env.get(name)]
    if missing:
        raise RuntimeError(f"The development schema viewer is enabled but {', '.join(missing)} not set")
    user = env["SCHEMA_VIEWER_USER"].encode()
    password = env["SCHEMA_VIEWER_PASSWORD"].encode()
    if len(password) < 16:
        raise RuntimeError("SCHEMA_VIEWER_PASSWORD must be at least 16 characters")
    snapshot = Path(env["SCHEMA_VIEWER_SNAPSHOT"])
    files = _viewer_files(Path(env.get("SCHEMA_VIEWER_UI", "frontend/node_modules/laranex-schema-viewer-ui/dist/viewer")))

    def require_developer(request: Request) -> None:
        # Or your application's own authentication dependency with a developer role check.
        given_user, given_password = _basic_credentials(request.headers.get("authorization", ""))
        # Both comparisons always run; a missing or malformed header compares empty values and fails.
        user_ok = secrets.compare_digest(given_user, user)
        password_ok = secrets.compare_digest(given_password, password)
        if not (user_ok and password_ok):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={**HEADERS, "WWW-Authenticate": f'Basic realm="{REALM}"'},
            )

    router = APIRouter(prefix=PREFIX, dependencies=[Depends(require_developer)], include_in_schema=False)

    @router.api_route("/snapshot.json", methods=["GET", "HEAD"])
    def snapshot_json() -> Response:
        try:
            # Read on every request, so a rebuilt snapshot shows up on reload. The viewer validates it.
            body = snapshot.read_bytes()
            json.loads(body)
        except (OSError, ValueError):
            return Response("Snapshot unavailable\n", status_code=503, media_type="text/plain", headers=HEADERS)
        return Response(body, media_type="application/json", headers={**HEADERS, "Content-Security-Policy": POLICY})

    @router.api_route("/{path:path}", methods=["GET", "HEAD"])
    def viewer_file(path: str) -> Response:
        path = path or "index.html"  # /dev/schema-viewer/ is the page
        if path not in files:
            return Response("Not found\n", status_code=404, media_type="text/plain", headers=HEADERS)
        body, media_type = files[path]
        return Response(body, media_type=media_type, headers={**HEADERS, "Content-Security-Policy": POLICY})

    return router
```

:::

::: code-group

```python [backend/main.py]
from fastapi import FastAPI

from .dev_schema_viewer import dev_schema_viewer

app = FastAPI()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


if (viewer := dev_schema_viewer()) is not None:
    app.include_router(viewer)
```

:::

Run the backend from the repository root (`uvicorn backend.main:app --host 127.0.0.1`) with the variables above, or set
`SCHEMA_VIEWER_UI` to the viewer directory. Starlette redirects `/dev/schema-viewer` to `/dev/schema-viewer/` before the
check runs; the redirect carries no content. In production, set `APP_ENV=production`: no router is added, and the
backend image contains neither the frontend's `node_modules` nor the snapshot.

The frontend's dev server forwards the prefix to the backend, `Authorization` header included:

::: code-group

```ts [frontend/vite.config.ts]
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    server: {
        host: '127.0.0.1',
        // Development only: the backend serves and protects the viewer files and the snapshot; the dev server forwards
        // them, Authorization header included. The trailing slash leaves /dev/schema-viewer to the frontend.
        proxy: { '/dev/schema-viewer/': 'http://127.0.0.1:8000' },
    },
});
```

:::

Show the backend's viewer in an `<iframe src="/dev/schema-viewer/">`, in React as in the [Vue section](#vue). The
dev server serves your application's own pages without the backend's check; they hold only the `<iframe>`'s URL. To
use the React component instead, protect the frontend's dev server as well (the [Vite plugin](#react-vite) does) and
fetch the snapshot from `/dev/schema-viewer/snapshot.json`.

## Node.js backend with a frontend

With an Express, Fastify or NestJS backend, serve the standalone viewer and the snapshot from the backend with
`node-schema-viewer`'s `loadViewer` and `loadDocument`, and proxy `/dev/schema-viewer` from the frontend's dev server
as in the [FastAPI section](#fastapi-backend-with-a-react-or-vue-frontend). The examples, with tests of every rule on
this page, are in [Node.js Schema Viewer: Embedding](https://laranex.github.io/node-schema-viewer/embedding.html).

## Authentication

Put the check where every viewer request passes through it: Vite or Express middleware, a Fastify hook, a FastAPI
router dependency, the Next.js proxy, or your reverse proxy.

- **Your application's sign-in (preferred).** Reuse the existing session or SSO and require a developer or admin role
  on the server. Answer anonymous requests as your application does (`401`, or a redirect to sign in) and signed-in
  users without the role with `403`, with no schema details in the body.
- **HTTP Basic Auth (minimum).** As in the examples: credentials from environment variables, a constant-time
  comparison of both the user name and the password, `401` with `WWW-Authenticate: Basic realm="…"`, `no-store`,
  the `Authorization` header never logged, and HTTPS for anything but loopback. Its limits are listed in
  [Security](./security.md#http-basic-auth).

## Check your setup

```bash
curl -i http://127.0.0.1:5173/dev/schema-viewer/snapshot.json                # 401, WWW-Authenticate: Basic, no schema
curl -i -u "$SCHEMA_VIEWER_USER" http://127.0.0.1:5173/dev/schema-viewer/snapshot.json   # prompts for the password; 200
```

Request the page and each viewer file the same way: all of them must answer `401` without credentials. Then build for
production and search the output (see [Production exclusion](./security.md#production-exclusion)), and keep the
snapshot out of Git with the [snapshot scan](./security.md#git-protection).

Every example on this page was run against `laranex-schema-viewer-ui` 0.3.0 with a synthetic fixture: unauthenticated
requests to the page, every viewer file and the snapshot were refused with `401`, authenticated ones rendered the
diagram in Chromium, and the production builds (`vite build`, `ng build`, `next build`) contained no viewer code,
route or schema data.
