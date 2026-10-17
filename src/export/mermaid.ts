import type { Cardinality, SchemaDocument, Table } from '../contract/types';
import { context, labelOf, scopedTables, shortClass, sourceWarnings, viewOf, type Context, type TableView } from './common';
import type { Exporter, ExportOptions, ExportResult } from './types';

// A Mermaid erDiagram of the database, after Laranex Laravel Schema Viewer's MermaidExporter: every table with its
// columns (base type, name, PK/FK/UK), then one relationship per foreign key. ORM relationships and inferred
// associations are added only with { orm: true }, as dotted (non-identifying) lines labelled as what they are.

// Mermaid names allow letters, digits and underscores; anything else becomes an underscore, and a leading digit gets one.
export function ident(value: string): string {
    const name = value.replace(/[^A-Za-z0-9_]/g, '_');
    return /^[0-9]/.test(name) ? `_${name}` : name;
}

// A relationship label: anything but a double quote or a control character fits between its quotes.
export const mermaidLabel = (value: string) => value.replace(/"/g, "'").replace(/[\x00-\x1f]+/g, ' ');

const ORM_ENDS: Record<Cardinality, [string, string]> = {
    'one-to-one': ['|o', 'o|'],
    'one-to-many': ['|o', 'o{'],
    'many-to-one': ['}o', 'o|'],
    'many-to-many': ['}o', 'o{'],
};

function exportMermaid(doc: SchemaDocument, options: ExportOptions = {}): ExportResult {
    const ctx = context(doc, options);
    sourceWarnings(ctx);
    const views = scopedTables(ctx).map((t) => viewOf(ctx, t));
    const lines = ['erDiagram'];
    const seen = new Map<string, string>();
    const renamedTables: string[] = [];
    const entity = (label: string, id: string) => {
        const name = ident(label);
        const other = seen.get(name);
        if (other === undefined) {
            seen.set(name, label);
            if (name !== label) {
                renamedTables.push(`${label} → ${name}`);
            }
        } else if (other !== label) {
            ctx.warn('lossy_conversion', 'table', id, label, `${other} and ${label} are both written as ${name} in Mermaid.`);
        }
        return name;
    };

    for (const view of views) {
        lines.push(`    ${entity(view.label, view.table.id)} {`);
        const foreign = new Set(view.foreignKeys.flatMap(({ fk }) => fk.columns));
        const primary = new Set(view.primaryKey);
        const renamed: string[] = [];
        const names = new Set<string>();
        for (const column of view.columns) {
            const name = ident(column.name);
            if (name !== column.name || names.has(name)) {
                renamed.push(`${column.name} → ${name}${names.has(name) ? ' (twice)' : ''}`);
            }
            names.add(name);
            const keys = [primary.has(column.name) ? 'PK' : '', foreign.has(column.name) ? 'FK' : '', !primary.has(column.name) && view.uniqueColumn(column.name) ? 'UK' : ''].filter(Boolean);
            lines.push(`        ${ident(column.typeName ?? column.type)} ${name}${keys.length ? ` ${keys.join(', ')}` : ''}`);
        }
        if (renamed.length) {
            ctx.warn('lossy_conversion', 'table', view.table.id, view.label, `Mermaid names allow letters, digits and underscores only; columns of ${view.label} renamed: ${renamed.join(', ')}.`);
        }
        lines.push('    }');
    }

    for (const view of views) {
        for (const { fk, target } of view.foreignKeys) {
            const optional = fk.columns.some((c) => view.columns.find((col) => col.name === c)?.nullable);
            lines.push(`    ${ident(labelOf(ctx, target))} ${optional ? '|o' : '||'}--${view.unique(fk.columns) ? 'o|' : 'o{'} ${ident(view.label)} : "${mermaidLabel(fk.columns.join(', '))}"`);
            if (fk.columns.length > 1) {
                ctx.warn('lossy_conversion', 'foreignKey', fk.id, view.label, `Composite foreign key ${fk.name ?? 'unnamed'} on ${view.label} is one relationship labelled with its columns; Mermaid cannot pair them with ${fk.foreignColumns.join(', ')}.`);
            }
        }
    }

    if (renamedTables.length) {
        ctx.warn('lossy_conversion', 'document', null, null, `Mermaid names allow letters, digits and underscores only; tables renamed: ${renamedTables.join(', ')}.`);
    }
    if (options.orm) {
        lines.push(...ormLines(ctx));
    }
    omitted(ctx, views);
    return { content: `${lines.join('\n')}\n`, warnings: ctx.warnings };
}

function ormLines(ctx: Context): string[] {
    const { doc } = ctx;
    const out: string[] = [];
    const label = (id: string) => labelOf(ctx, ctx.tables.get(id) as Table);
    const model = (id: string) => shortClass(doc.models.find((m) => m.id === id)?.className ?? id);
    for (const r of doc.relationships) {
        if (!ctx.inScope.has(r.table)) {
            continue;
        }
        if (r.relatedTable === null || !ctx.inScope.has(r.relatedTable)) {
            ctx.warn('skipped_entity', 'relationship', r.id, `${model(r.model)}::${r.name}`, `ORM relationship ${model(r.model)}::${r.name} ${r.relatedTable === null ? 'has no single related table' : 'relates to a table outside this export'}; it is not drawn.`);
            continue;
        }
        const [left, right] = ORM_ENDS[r.cardinality];
        const via = r.pivot ? ` via ${label(r.pivot.table)}` : r.through?.length ? ` through ${r.through.map(label).join(', ')}` : '';
        out.push(`    ${ident(label(r.table))} ${left}..${right} ${ident(label(r.relatedTable))} : "${mermaidLabel(`ORM: ${model(r.model)}::${r.name} (${r.type}${via})`)}"`);
    }
    for (const a of doc.inferredAssociations) {
        if (![a.table, a.relatedTable].every((t) => ctx.inScope.has(t))) {
            continue;
        }
        const [left, right] = ORM_ENDS[a.cardinality];
        out.push(`    ${ident(label(a.table))} ${left}..${right} ${ident(label(a.relatedTable))} : "${mermaidLabel(`inferred: ${model(a.model)} → ${model(a.relatedModel)} (no ORM attribute declared)`)}"`);
    }
    return out;
}

// One warning per connection for what an ER diagram cannot hold.
function omitted(ctx: Context, views: TableView[]): void {
    for (const c of ctx.connections) {
        const own = views.filter((v) => v.connection.id === c.id);
        const count = (n: number, one: string, many = `${one}s`) => (n ? [`${n} ${n === 1 ? one : many}`] : []);
        const parts = [
            ...count(own.reduce((n, v) => n + v.indexes.filter((i) => i.backs?.kind !== 'primary_key').length, 0), 'index', 'indexes'),
            ...count(own.reduce((n, v) => n + v.constraints.filter((k) => k.kind === 'check').length, 0), 'check constraint'),
            ...count(own.reduce((n, v) => n + v.columns.filter((col) => col.default !== null).length, 0), 'column default'),
            ...count(own.reduce((n, v) => n + v.columns.filter((col) => col.generated !== null).length, 0), 'generated column'),
            ...count(own.reduce((n, v) => n + v.columns.filter((col) => col.enum !== null).length, 0), 'enum value list'),
            ...count(own.reduce((n, v) => n + [v.table.comment, v.table.note, ...v.columns.flatMap((col) => [col.comment, col.note])].filter((t) => t !== null).length, 0), 'comment or note', 'comments and notes'),
            ...count(own.reduce((n, v) => n + v.foreignKeys.filter(({ fk }) => (fk.onDelete !== null && fk.onDelete !== 'NO ACTION') || (fk.onUpdate !== null && fk.onUpdate !== 'NO ACTION')).length, 0), 'referential action set', 'referential action sets'),
        ];
        if (parts.length) {
            ctx.warn('unsupported_feature', 'connection', c.id, c.name, `A Mermaid ER diagram holds tables, columns, keys and foreign keys only; left out of ${c.name}: ${parts.join(', ')}.`);
        }
    }
}

export const mermaid: Exporter = { id: 'mermaid', label: 'Mermaid', extension: 'mmd', mediaType: 'text/plain', export: exportMermaid };
