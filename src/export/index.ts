// laranex-schema-viewer-ui/export: the client-side export system. Pure TypeScript with no React and no DOM, so it runs
// in the viewer, in Node.js and in any bundler. See docs/exports.md.
import { dbml } from './dbml';
import { json } from './json';
import { markdown } from './markdown';
import { mermaid } from './mermaid';
import type { Exporter } from './types';

export type { ExportDialect, Exporter, ExportOptions, ExportResult, ExportWarning, ExportWarningCode } from './types';
export { exportFileName } from './common';
export { scopeDocument } from './json';
export { dbml, json, markdown, mermaid };

// Every built-in exporter, in the order the Download dialog lists them.
export const EXPORTERS: readonly Exporter[] = [mermaid, dbml, markdown, json];
