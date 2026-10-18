# Security policy

`laranex-schema-viewer-ui` is the `laranex-schema` contract and the shared, development-only ERD viewer for the
Laranex Laravel, Python and Node.js schema viewers. The full cross-framework policy is
[Security](https://laranex.github.io/schema-viewer-ui/security.html) on the documentation site
([docs/security.md](https://github.com/laranex/schema-viewer-ui/blob/main/docs/security.md) in this repository); this file summarises it and says how to report a
vulnerability.

## Supported versions

During the 0.x development phase only the latest released version on npm receives security fixes (currently 0.4.0).
Fixes ship in a new release; there are no backports to older 0.x releases or to prereleases.

## Reporting a vulnerability

Do not put vulnerability details, exploit code or any schema snapshot in a public issue, pull request or discussion.

Report it privately through
[GitHub private vulnerability reporting](https://github.com/laranex/schema-viewer-ui/security/advisories/new), with
the affected version, reproduction steps using synthetic data, and the impact you observed. Please allow time for a fix
before public disclosure.

## Security model

Authentication is enforced only by the server or the integrating application, never by the browser UI. This package
has no server and no authentication of its own.

| Concern | The package enforces | You (the application or repository owner) must |
| --- | --- | --- |
| Standalone bundle and React component | Snapshots loaded from the page's own origin only, with `credentials: 'same-origin'` and `cache: 'no-store'`; schema strings rendered as text only; runs under `script-src 'self'` with no network access beyond its own files and the snapshot | Authenticate the page, every viewer file, the snapshot and every download on the server; the viewer enforces no authentication |
| Embedded viewer (your application) | Nothing beyond the row above | Register the routes only in development, behind a server-side check, and exclude them from production builds |
| Snapshots in Git | `contract/scan.mjs`; the framework packages' `scan` commands | Run the scan in pre-commit and CI; review every allowlist change |
| Exports and downloads | Generated in the browser, sent nowhere | Store, share and delete exported files responsibly |

The framework packages' built-in viewers (`serve`, the Laravel route) and MCP servers are covered by their own
security pages and by [Who enforces what](https://laranex.github.io/schema-viewer-ui/security.html#who-enforces-what).

## Schema snapshots are sensitive

A snapshot maps your database and application: tables, columns, defaults, constraints, models, relationships, source
paths, comments and notes. Every export of a private schema is just as sensitive: JSON, offline HTML, DBML, Mermaid,
Markdown, SVG and PNG, and `laranex-schema-gate` reports kept as CI artifacts (restrict access and retention).

## Protecting the page alone is insufficient

The schema document and every delivery path need the same server-side protection as the page: viewer assets,
`snapshot.json` or an inline document, downloads, `<iframe>` embedding, caches and CDNs, object storage. Send
`Cache-Control: no-store` on the viewer page, the schema document, downloads and error responses; fingerprinted static
assets without schema data may use `private, max-age=31536000, immutable`, never `public`. Use HTTPS beyond localhost. See
[Every delivery path](https://laranex.github.io/schema-viewer-ui/security.html#every-delivery-path).

## Development-only viewer

Never expose the viewer or its snapshots in production. Authentication is mandatory, even locally. The one exception
is the Python and Node.js `serve` command: loopback-only, for a single developer, never shared; its
`--unsafe-allow-remote` override is unsafe, and remote access goes only through an authenticated HTTPS reverse proxy
or tunnel. Laravel Schema Viewer on this shared viewer is loopback-only in `local` and disabled in production by
default; enabling it there is a documented security exception that requires an application-owned gate.

## Git protection

```bash
node node_modules/laranex-schema-viewer-ui/contract/scan.mjs --tracked --untracked --artifacts dist
```

Exit codes: 0 clean, 1 confirmed exposure, 2 scan failure or incomplete scan, 3 uncertain exposure. CI must fail on
any non-zero exit. The path + SHA-256 allowlist (`.laranex-schema-allowlist.json`) is an explicit review decision, not
proof that content is harmless. Keep snapshots and exports in `.gitignore` and run the scan in a pre-commit hook. The
rules are in [Snapshot scanning](https://laranex.github.io/schema-viewer-ui/contract.html#snapshot-scanning); setup is
in [Git protection](https://laranex.github.io/schema-viewer-ui/security.html#git-protection).

## Limitations

- Detection is by the content of supported formats, in files chosen by extension.
- Compressed or encoded payloads (for example base64+gzip offline HTML) are not scanned.
- Renamed or HTML-entity-escaped files, and SVG, PNG, DBML, Mermaid and Markdown exports, are not content-detectable.
- It guards against accidents, not adversaries.

See [Limitations](https://laranex.github.io/schema-viewer-ui/security.html#limitations) for the full list.

## Incident response

If a snapshot or export reached Git or was published:

1. `git rm --cached <path>`, add the ignore rule, commit.
2. Treat anything already pushed or shared as disclosed; scan the history with `scan.mjs --history`.
3. Rewrite history (`git filter-repo`) only with the repository owner's approval, and coordinate the force-push and
   re-clones.
4. Purge CI artifacts, caches, CDN and Pages copies, and forks where possible.
5. Rotate anything the schema revealed (secrets in defaults or comments, for example). Rotation is the fix; history
   rewriting is cleanup.

## Responsibility boundary

The package is responsible for safe defaults, protection of the snapshots its packages generate, scanner checks for
the supported formats, and secure viewer serving. Once you deliberately download or export a standalone file,
storing, sharing and distributing it is your responsibility as the repository owner.

## Disclaimer

See [LICENSE](LICENSE). Nothing in this policy is a warranty.
