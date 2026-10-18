# Security

The Schema Viewer is a **development-only tool**. It shows the full structure of a database: every table, column,
type, default, index, constraint and foreign key, ORM model and relationship names, source file paths and line numbers,
comments, notes and diagnostics. That is a map of your application for anyone who can open it.

::: danger Never in production. Authentication is mandatory, everywhere.
Never expose the Schema Viewer or its schema snapshots in production. Require authentication even for local
development.
:::

This page is the policy for every Laranex Schema Viewer host. [Embedding in client applications](./embedding.md) shows
how to follow it in React, Next.js, Vue, Angular, FastAPI and Node.js applications.

## Policy

1. **Never in production.** Never enable, bundle, serve or publicly expose the Schema Viewer or its schema snapshots in
   production.
2. **Authenticate everywhere.** Require authentication even for local development.
3. **Basic Auth is the minimum.** HTTP Basic Auth is the minimum acceptable protection. Your application's existing
   developer or admin authentication and authorization are preferred.
4. **Protect everything on the server.** Protect the viewer page, its static assets (`app.js`, `app.css`, `offline.js`,
   `assets/*`, the favicons) and the schema JSON at the server or reverse-proxy layer, with the same check.
5. **Client-side checks are not security controls.** Authentication is enforced only by the server or the integrating
   application, never by the browser UI. Client-side route guards, hidden navigation links, JavaScript
   environment checks and obscure URLs protect nothing: anyone can request the files directly.
6. **No schema in public bundles.** Never put private schema JSON inside a publicly accessible frontend bundle: no
   `import schema from './schema.json'`, no `public/` or `static/` directory, no environment variable a bundler inlines.
7. **Staging and UAT: off by default.** Integration in staging or UAT is disabled by default and enabled only for
   explicitly authorized developers.
8. **Shared development environments.** Use HTTPS and restricted access (VPN, IP allowlist or SSO) on any environment
   more than one person can reach.
9. **No secrets in the repository.** Never hardcode credentials or commit `.htpasswd` files, passwords, tokens or
   private schema snapshots.
10. **Refuse first.** Reject unauthorized requests before returning, or even reading, protected HTML, JavaScript, CSS,
    images or schema JSON.
11. **Constant-time comparison.** Where you implement Basic Auth yourself, compare credentials in constant time
    (`crypto.timingSafeEqual` on equal-length digests in Node.js, `secrets.compare_digest` in Python).
12. **Exclude, don't hide.** Production build artifacts must not contain the viewer, its routes or schema data. Hiding
    the route is not enough: check the build output.

## What protects the viewer, and what does not

| Measure | Protects the viewer and snapshot? |
| --- | --- |
| Authentication middleware, a route handler check or a reverse proxy in front of **every** viewer path and the snapshot | **Yes**, for the paths it covers |
| The route, the viewer files and the snapshot absent from the production build and install | **Yes**: nothing to request |
| Basic Auth on the page while `snapshot.json` sits in `public/` or in a JavaScript bundle | **No**: the snapshot is public |
| Basic Auth on the snapshot while a bundle inlines the same document | **No** |
| A client-side route guard, `if (import.meta.env.DEV)` around a link, a hidden menu entry, a long random URL | **No**: these only change what the UI shows |
| `NODE_ENV` or `APP_ENV` checks on the **server** that keep the route from being registered | **Yes**, in that environment, together with authentication everywhere else |
| Binding the development server to `127.0.0.1` | Partly: it keeps other machines out, not other local users or processes; still authenticate |
| A static or CDN path that serves the same files without the check | **No**: every path to the files must pass the check |

## HTTP Basic Auth

Basic Auth is the floor, not a goal. When you use it:

- Read the user name and password from environment variables or a secret manager. Never commit them, and never give the
  variables a prefix that a bundler exposes to the browser (`VITE_`, `NEXT_PUBLIC_`, `PUBLIC_`, `REACT_APP_`).
- Use a long random password (the examples refuse fewer than 16 characters) per developer or per environment.
- Answer a missing or wrong `Authorization` header with `401`, `WWW-Authenticate: Basic realm="…"` and a generic body
  that says nothing about the schema.
- Compare in constant time, and compare the user name and the password every time.
- Never log the `Authorization` header or the decoded credentials. Check your access logs and error reporting too.
- Use TLS for anything but loopback: Basic Auth sends the credentials with every request, only Base64-encoded.

Know its limits: browsers keep the credentials until they quit (there is no logout), every developer shares one set
unless you issue several, nothing records who looked, and nothing limits guessing unless you add rate limiting (for
example in your reverse proxy). Your application's own sign-in, with a developer or admin role check on the server,
fixes most of these and is the better choice wherever it exists.

## Staging, UAT and shared environments

The examples in [Embedding](./embedding.md) refuse to register the viewer when the application runs in production mode
(`NODE_ENV=production`, `APP_ENV=production`), even when the opt-in variable is set. Staging and UAT usually run in
production mode, so they stay excluded. If your organization decides the viewer is needed there:

- keep it disabled by default and turn it on for a limited time;
- protect it with your existing SSO or admin authentication **and** an authorization check limited to named developers;
- serve it over HTTPS only, and restrict network access (VPN or IP allowlist);
- make sure the snapshot describes that environment only and is not readable by the application's other users.

The simpler option is usually to download the snapshot through an authorized channel and open it with your framework
package's local viewer.

## Snapshots

- Keep snapshots outside `public/`, `static/` and any directory a bundler or static file server reads. Point the server
  at the file with an environment variable (`SCHEMA_VIEWER_SNAPSHOT` in the examples).
- Add the snapshot to `.gitignore` and to your container build's ignore file. Never commit a real application's
  snapshot; the fixtures in this package are synthetic.
- Serve it with `Cache-Control: no-store`, from the same origin and under the same protected prefix as the viewer, so
  the browser sends the same credentials and no shared cache keeps a copy. Send `no-store` on every viewer response,
  the `401`, `404` and `503` errors included.
- Never commit a snapshot, not even to a private repository.
- Treat everything derived from a snapshot as just as sensitive: the Download dialog's Mermaid, DBML, Markdown, JSON,
  SVG, PNG and offline HTML exports, and `laranex-schema-gate` reports kept as CI artifacts (restrict who can read them
  and how long they are kept).

## Remote access

The framework packages' own local viewers (`node-schema-viewer serve`, Python's `laranex-schema-viewer serve`) have no
authentication and stay on loopback. To reach one from another machine, keep it on loopback and put an authenticated
HTTPS reverse proxy, or an equivalent access-controlled tunnel, in front of it; in a container, publish the port to the
host's loopback only (`-p 127.0.0.1:8765:8765`). An override that binds such a server directly to a non-loopback
address (`--unsafe-allow-remote`, where a package offers it) is unsafe: no authentication, no TLS. Do not use it as a
way to share the viewer.

## Production exclusion

Check the result, not the intent:

- Install the viewer packages as development dependencies, so `npm ci --omit=dev` (or your production image) does not
  contain them.
- Register the viewer's routes only behind a development switch evaluated on the server or at build time, as the
  examples do with `import.meta.env.DEV`, Next.js `pageExtensions`, Angular `fileReplacements` and environment checks.
- After a production build, search the output for the viewer and your schema, for example:

```bash
grep -rlE 'laranex-schema|LaranexSchemaViewer|react-flow|dev/schema-viewer' dist/ && echo 'The viewer is in the build'
```

  Add the name of one of your own tables to the pattern to catch a snapshot.

## What the viewer itself guarantees

These protect the page from the schema's content, not the schema from the people who can open the page:

- It renders schema strings as text only (no HTML from schema data) and runs under `script-src 'self'` with no inline
  scripts, `eval` or workers ([Content-Security-Policy](./integration.md#content-security-policy)).
- It makes no network requests beyond its own files and the snapshot URL the host gives it, both same-origin; it sends
  cookies and HTTP credentials only to the same origin (`credentials: 'same-origin'`).
- It ignores editor link templates with `javascript:`, `data:`, `vbscript:`, `blob:` or `file:` schemes.
- It never connects to a database; producers build snapshots ahead of time.

Your framework package documents the security of producing snapshots: [Node.js](https://laranex.github.io/node-schema-viewer/security.html),
[Python](https://laranex.github.io/python-schema-viewer/security.html).
