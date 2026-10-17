# React API

```tsx
import { SchemaViewer } from 'laranex-schema-viewer-ui';
import 'laranex-schema-viewer-ui/styles.css';
```

## `<SchemaViewer>`

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `document` | `SchemaDocument` | — | A `laranex-schema` 2.x document. Validate untrusted input first. |
| `changes` | `ViewerChange[] \| null` | — | Changes since the previous build, listed in the guide. |
| `downloads` | `ViewerDownload[]` | — | Files the host prepared, offered in the Download dialog beside the built-in formats. |
| `editor` | `string \| null` | `null` | Editor URL template with `{file}` and `{line}` for source links. |
| `defaultConnection` | `string \| null` | `null` | The connection id to open on. |
| `extensionRenderers` | `Record<string, (value) => ReactNode>` | `{}` | Rich rendering for one extension namespace. |
| `theme` | `'light' \| 'dark'` | system | Controlled theme. |
| `onThemeChange` | `(theme) => void` | — | Called by the theme button. |
| `persistTheme` | `boolean` | `true` | Remember the theme in `localStorage`. |
| `deepLinks` | `boolean` | `true` | Keep the view in the URL hash. |
| `downloadHref` | `string \| null` | — | Where the dialog's whole-document JSON points; `null` hides it. |
| `offlineBundle` | `(() => Promise<OfflineBundle>) \| null` | `null` | Where "This page as HTML" gets the single-file viewer, such as `() => fetchOfflineBundle(urlOfDistViewer)`; unset hides it. See [Downloads and exports](./exports.md). |
| `title`, `className` | `ReactNode`, `string` | — | Header title, root class. |
| `layout` | `(request) => Promise<Positions>` | ELK | Replace the automatic layout, for tests or custom placement. |

## Contract helpers

```ts
import { validateDocument, assertDocument, buildGraph, inferAssociations, canonicalJson, documentRevision, jsonSchema } from 'laranex-schema-viewer-ui/contract';

const result = validateDocument(data, { strict: true }); // { ok, document, errors }
const { links, derivedLinks } = buildGraph(document);     // the shared graph rules
const associations = inferAssociations(document);         // the shared inference rules (producers only)
const bytes = canonicalJson(document);                    // sorted keys, two spaces, trailing newline
const revision = documentRevision(document);              // SHA-256 of the canonical bytes
```

Strict validation accepts exactly version 2.0 and rejects properties it does not define: producers and tests use it.
The default lenient mode reads any 2.x minor and ignores properties it does not know, so a viewer keeps working when a
producer writes a newer minor. `compareScopes`, `migrationState` and `inferAssociations` are producer algorithms with
conformance cases; viewers show the stored results and never compute them.
