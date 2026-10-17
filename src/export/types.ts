import type { SchemaDocument, SubjectType } from '../contract/types';

// The client-side export system (docs/exports.md): pure, deterministic conversions of a laranex-schema document into
// other formats. The same document and options always give the same bytes and the same warnings.

export type ExportDialect = 'postgresql' | 'mysql' | 'mariadb' | 'sqlite';

export type ExportOptions = {
    // Connection ids to export, in any order; the file follows the document's order. Every connection when unset.
    connections?: string[];
    // Reserved for dialect-aware formats such as an SQL DDL preview; the current formats ignore it.
    dialect?: ExportDialect;
    // Mermaid and Markdown: also list the ORM's relationships and the inferred associations, each labelled as what it
    // is and kept apart from foreign keys. Off by default, so the database-only output stays reproducible.
    orm?: boolean;
};

export type ExportWarningCode =
    // The format has no way to state something the document holds; it is left out.
    | 'unsupported_feature'
    // The format states it differently, with less detail, or under a changed name.
    | 'lossy_conversion'
    // An entity left out on purpose, such as a foreign key only the ORM declares in a combined document.
    | 'skipped_entity'
    // What the document's source or coverage means for the file: ORM declarations only, or an incomplete inspection.
    | 'declared_source'
    | 'incomplete_coverage';

export type ExportWarning = {
    code: ExportWarningCode;
    subject: { type: SubjectType; id: string | null; label: string | null };
    message: string;
};

export type ExportResult = { content: string; warnings: ExportWarning[] };

export type Exporter = {
    // mermaid, dbml, markdown, json
    id: string;
    label: string;
    // Without the dot.
    extension: string;
    mediaType: string;
    export: (document: SchemaDocument, options?: ExportOptions) => ExportResult;
};
