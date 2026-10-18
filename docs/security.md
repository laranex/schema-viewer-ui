# Security

The Schema Viewer is a **development-only tool**. It shows the full structure of a database: every table, column,
type, default, index, constraint and foreign key, ORM model and relationship names, source file paths and line numbers,
comments, notes and diagnostics. That is a map of your application for anyone who can open it.

::: danger Never in production. Authentication is mandatory, everywhere.
Never expose the Schema Viewer or its schema snapshots in production. Require authentication even for local
development.
:::

This page is the policy for every Laranex Schema Viewer host and package: Laravel, Python, Node.js and this shared
viewer. [Embedding in client applications](./embedding.md) shows how to follow it in React, Next.js, Vue, Angular,
FastAPI and Node.js applications; each framework package's own security page covers its specifics and links here.
To report a vulnerability, see [SECURITY.md](https://github.com/laranex/schema-viewer-ui/blob/main/SECURITY.md).

## Policy

1. **Never in production.** Never enable, bundle, serve or publicly expose the Schema Viewer or its schema snapshots in
   production.
2. **Authenticate everywhere.** Require authentication even for local development. The one exception is the
   standalone `serve` command of the Python and Node.js packages: a loopback-only viewer with no authentication, for a
   single developer on their own machine. Never share it; anything beyond that machine goes through an authenticated
   HTTPS reverse proxy or an access-controlled tunnel, with `serve` still on loopback. Laravel Schema Viewer on this
   shared viewer allows only loopback requests in `local` without its authorization check, and keeps its production
   viewer disabled by default: enabling it is a documented security exception that requires an application-owned gate.
3. **Basic Auth is the minimum.** HTTP Basic Auth is the minimum acceptable protection. Your application's existing
   developer or admin authentication and authorization are preferred.
4. **Protect everything on the server.** Protect the viewer page, its static assets (`app.js`, `app.css`, `offline.js`,
   `assets/*`, the favicons) and the schema JSON at the server or reverse-proxy layer, with the same check: protecting
   the page alone is insufficient (see [Every delivery path](#every-delivery-path)).
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

## Who enforces what

Authentication is enforced only by the server or the integrating application, never by the browser UI. This package
is a viewer and a contract: it has no server and no sign-in of its own.

| Concern | The package enforces | You (the application or repository owner) must |
| --- | --- | --- |
| Standalone bundle and React component | Snapshots loaded from the page's own origin only (`credentials: 'same-origin'`, `cache: 'no-store'`; another origin, or a redirect to one, is refused); schema strings rendered as text only; runs under `script-src 'self'` with no network access beyond its own files and the snapshot | Authenticate the page, every viewer file, the snapshot and every download on the server; the viewer enforces **no** authentication |
| Embedded viewer (your application) | Nothing beyond the row above | Register the routes only in development, behind your server-side check, and exclude them from production builds ([Embedding](./embedding.md)) |
| Built-in `serve` (Python, Node.js) | Documented by each package: loopback by default, `--unsafe-allow-remote` to bind elsewhere | Keep it on loopback for yourself; put an authenticated HTTPS reverse proxy or tunnel in front of anything else ([Remote access](#remote-access)) |
| Laravel route | Documented by Laravel Schema Viewer on this shared viewer: loopback-only in `local`, disabled in production by default | Enable production only as a documented security exception, behind an application-owned gate |
| Snapshots in Git | `contract/scan.mjs` and the framework packages' `scan` commands ([Git protection](#git-protection)) | Run the scan in pre-commit and CI; review every allowlist change |
| Exports and downloads | Generated in the browser, sent nowhere | Store, share and delete exported files responsibly ([Responsibility boundary](#responsibility-boundary)) |
| MCP (Python, Node.js) | Local stdio only, read-only; no remote transport ([Node.js](https://laranex.github.io/node-schema-viewer/mcp.html), [Python](https://laranex.github.io/python-schema-viewer/mcp.html)) | Never expose it over a network; any HTTP bridge must add its own authentication |

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

## Snapshots and exports are sensitive

- Keep snapshots outside `public/`, `static/` and any directory a bundler or static file server reads. Point the server
  at the file with an environment variable (`SCHEMA_VIEWER_SNAPSHOT` in the examples).
- Add the snapshot to `.gitignore` and to your container build's ignore file. Never commit a real application's
  snapshot; the fixtures in this package are synthetic.
- Serve it with `Cache-Control: no-store`, from the same origin and under the same protected prefix as the viewer, so
  the browser sends the same credentials and no shared cache keeps a copy. Send `no-store` on every viewer response,
  the `401`, `404` and `503` errors included.
- Never commit a snapshot, not even to a private repository.
- Treat everything derived from a snapshot as just as sensitive: the Download dialog's Mermaid, DBML, Markdown, JSON,
  SVG, PNG and offline HTML exports ([Downloads and exports](./exports.md)), the framework packages' own exports, and
  `laranex-schema-gate` reports kept as CI artifacts (restrict who can read them and how long they are kept).

## Every delivery path

Protecting the page alone is insufficient. Every way the schema can reach a browser or a file needs the same
server-side protection as the page:

- the viewer page and every viewer asset;
- the schema document, whether served as `snapshot.json` (`data-snapshot-url`, `<laranex-schema-viewer src>`) or
  inlined in the page (`script#schema-viewer-data`, `window.__SCHEMA_VIEWER__`);
- downloads the host offers (`downloadHref`, `ViewerConfig.downloads`) and the offline HTML the viewer builds;
- every page that shows the viewer in an `<iframe>`, and the framed viewer itself;
- caches and CDNs: send `Cache-Control: no-store` on every sensitive response, errors included, and make sure no static,
  CDN or object-storage path (a bucket, a Pages site, an artifact store) serves the same files without the check.

Use HTTPS for anything but loopback.

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

## Git protection

The scanner finds schema snapshots by content, not by file name, in what a repository tracks (the Git index, so staged
bytes and files tracked before they were ignored), what it would add, its build output and, on request, its history.
Its rules are in [Snapshot scanning](./contract.md#snapshot-scanning). This package ships it as a dependency-free
command (Node.js and Git); the framework packages have their own `scan` commands with the same flags, output and exit
codes.

```bash
node node_modules/laranex-schema-viewer-ui/contract/scan.mjs --tracked --untracked --artifacts dist
```

| Exit code | Meaning |
| --- | --- |
| 0 | Clean |
| 1 | Confirmed exposure |
| 2 | Scan failure or incomplete scan |
| 3 | Uncertain exposure |

Precedence is 2 > 1 > 3 > 0. **CI must fail on any non-zero exit.** The one-line summary prints counts only;
`--report FILE` or `--json` gives the paths, never file content. Keep reports as restricted CI artifacts.

- **Allowlist.** An approved synthetic fixture, or a snapshot committed on purpose, is listed by exact path and SHA-256
  in `.laranex-schema-allowlist.json`. Adding an entry is an explicit review decision, not proof that the content is
  harmless. Include `contract/synthetic.json` to permit this package's own synthetic documents.
- **`.gitignore`.** Keep snapshots and exports ignored. The Python and Node.js packages' `init` writes an ignore block
  for their default outputs, and their `build` commands check the output path; see each package's documentation.
- **Pre-commit.** Run the scan on what you are about to commit, for example in `.git/hooks/pre-commit`:

  ```sh
  #!/bin/sh
  exec node node_modules/laranex-schema-viewer-ui/contract/scan.mjs --tracked
  ```

  The framework packages document their own hooks.

## Limitations

The scanner guards against accidents, not adversaries:

- It detects documents by the content of supported formats, in files chosen by extension (`.json`, `.html`, `.htm`
  in a repository; also `.js`, `.mjs`, `.cjs`, `.map` in build artifacts). Other files are not read.
- Compressed or encoded payloads, for example base64+gzip offline HTML (Laravel's export), are **not** scanned:
  neither decoded nor flagged.
- Renamed or HTML-entity-escaped files, and SVG, PNG, DBML, Mermaid and Markdown exports, are not content-detectable.
- JavaScript and source maps in the repository tree are not scanned (only in build artifacts).
- A file over 64 MiB is not read; the scan reports itself incomplete (exit 2).
- Someone hiding a snapshot on purpose will not be stopped. Keep sensitive files ignored, and keep server-side
  authentication in front of everything that serves them.

## Incident response

If a snapshot, an export or a gate report reached Git or was published:

1. Stop tracking it: `git rm --cached <path>`, add the ignore rule, commit.
2. Treat anything already pushed or shared as disclosed. Find every copy in the history with
   `node node_modules/laranex-schema-viewer-ui/contract/scan.mjs --history` (a full clone; a shallow one fails).
3. Rewrite history (for example with `git filter-repo`) only with the repository owner's approval, and coordinate the
   force-push and fresh clones with everyone who has one.
4. Purge CI artifacts, caches, CDN and Pages copies, and forks where possible.
5. Rotate anything the schema revealed (secrets in column defaults or comments, for example). Rotation is the fix;
   rewriting history is cleanup.

## Responsibility boundary

Laranex Schema Viewer is responsible for safe defaults, protection of the snapshots its packages generate, scanner
checks for the supported formats, and secure behaviour when serving the viewer. Once you deliberately download or
export a standalone file (HTML, JSON, DBML, Markdown, Mermaid, SVG, PNG and the like), storing, sharing and
distributing it is your responsibility as the repository owner. The package does not scan, track or control exported
files outside your repository and build workflow.

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

## License

The package is provided under the terms of its
[MIT License](https://github.com/laranex/schema-viewer-ui/blob/main/LICENSE), including its disclaimer. Nothing on
this page is a warranty.
