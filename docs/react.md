# React API

```tsx
import { SchemaViewer } from 'laranex-schema-viewer-ui';
import 'laranex-schema-viewer-ui/styles.css';
```

## `<SchemaViewer>`

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `document` | `SchemaDocument` | — | A `laranex-schema` 1.x document. Validate untrusted input first. |
| `changes` | `ViewerChange[] \| null` | — | Changes since the previous build, listed in the guide. |
| `downloads` | `ViewerDownload[]` | — | Files the host prepared, offered in the guide. |
| `editor` | `string \| null` | `null` | Editor URL template with `{file}` and `{line}` for source links. |
| `defaultConnection` | `string \| null` | `null` | The connection id to open on. |
| `extensionRenderers` | `Record<string, (value) => ReactNode>` | `{}` | Rich rendering for one extension namespace. |
| `theme` | `'light' \| 'dark'` | system | Controlled theme. |
| `onThemeChange` | `(theme) => void` | — | Called by the theme button. |
| `persistTheme` | `boolean` | `true` | Remember the theme in `localStorage`. |
| `deepLinks` | `boolean` | `true` | Keep the view in the URL hash. |
| `downloadHref` | `string \| null` | — | Where Download JSON points; `null` hides it. |
| `title`, `status`, `className` | `ReactNode`, `ReactNode`, `string` | — | Header title, footer status, root class. |
| `layout` | `(request) => Promise<Positions>` | ELK | Replace the automatic layout, for tests or custom placement. |

## Contract helpers

```ts
import { validateDocument, assertDocument, buildGraph, canonicalJson, documentRevision, jsonSchema } from 'laranex-schema-viewer-ui/contract';

const result = validateDocument(data, { strict: true }); // { ok, document, errors }
const { links, derivedLinks } = buildGraph(document);     // the shared graph rules
const bytes = canonicalJson(document);                    // sorted keys, two spaces, trailing newline
const revision = documentRevision(document);              // SHA-256 of the canonical bytes
```

Strict validation rejects properties the version does not define (for producers); the default lenient mode ignores
them (for readers of a later 1.x minor).
