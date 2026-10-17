import type { SchemaDocument } from './types';

// What a host hands the viewer beside the document. None of it is part of the schema: it describes the page, not the
// database, so it never changes a snapshot's revision.

// One change since the previous build, as the host's diff reports it.
export type ViewerChange = {
    type: string;
    change: 'added' | 'removed' | 'changed';
    // The entity's id in the document, when it still exists.
    subject?: string | null;
    label?: string | null;
    message?: string | null;
    fields?: Record<string, [unknown, unknown]>;
};

// A file the host prepared, such as a Mermaid or Markdown export of one connection.
export type ViewerDownload = { label: string; filename: string; mediaType: string; content: string };

export type ViewerConfig = {
    document: SchemaDocument;
    // What changed since the previous build that changed the schema; null before there was one to compare with.
    changes?: ViewerChange[] | null;
    downloads?: ViewerDownload[];
    // An editor URL template with {file} (relative to the project root) and {line}, for source links. Never set it in a
    // static export.
    editor?: string | null;
    // The connection id the viewer opens on, or null for all.
    defaultConnection?: string | null;
    // Set when the host has no snapshot yet: what to run to build one.
    missing?: string | null;
};
