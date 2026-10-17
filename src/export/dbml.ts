import type { Column, Constraint, Index, SchemaDocument } from '../contract/types';
import { actionWords, context, labelOf, scopedTables, sourceWarnings, viewOf, type Context, type TableView } from './common';
import type { Exporter, ExportOptions, ExportResult } from './types';

// DBML as dbdiagram.io reads it, after Laranex Laravel Schema Viewer's DbmlExporter: an optional Project note, named
// enums, every table with its columns, keys, indexes, checks and notes, then one Ref per foreign key. Only physical
// foreign keys become Refs; ORM relationships never do.

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

// A name as written: bare when it is an identifier, otherwise quoted with " and \ escaped.
export const dbmlName = (name: string) => (IDENT.test(name) ? name : `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
const dbmlType = (type: string) => (/^[A-Za-z0-9_(),]+$/.test(type) ? type : `"${type.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
// A single-quoted string: \ and ' escaped, line breaks as spaces.
const quoted = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r\n|\r|\n/g, ' ')}'`;
const joined = (...texts: (string | null)[]) => texts.filter((t): t is string => t !== null).join(' · ');

// The DBML reference to a table: schema.table, or the connection-qualified name as one quoted name when the file holds
// several connections.
function tableRef(ctx: Context, view: Pick<TableView, 'table'>): string {
    const { table } = view;
    return ctx.several ? dbmlName(labelOf(ctx, table)) : table.schema ? `${dbmlName(table.schema)}.${dbmlName(table.name)}` : dbmlName(table.name);
}

const columnsRef = (columns: string[]) => (columns.length === 1 ? dbmlName(columns[0]) : `(${columns.map(dbmlName).join(', ')})`);

function exportDbml(doc: SchemaDocument, options: ExportOptions = {}): ExportResult {
    const ctx = context(doc, options);
    sourceWarnings(ctx);
    if (ctx.several) {
        ctx.warn('lossy_conversion', 'document', null, null, 'DBML has one namespace per file: with several connections, each table is named by its connection and table, such as "app.public.users".');
    }
    const views = scopedTables(ctx).map((t) => viewOf(ctx, t));
    const blocks: string[] = [];
    if (doc.note !== null) {
        blocks.push(`Project ${dbmlName(ctx.connections.length === 1 ? ctx.connections[0].name : 'schema')} {\n  Note: ${quoted(doc.note)}\n}`);
    }
    blocks.push(...enums(ctx, views));
    blocks.push(...views.map((view) => tableBlock(ctx, view)));
    const refs = references(ctx, views);
    return { content: `${blocks.join('\n\n')}${refs.length ? `\n\n${refs.join('\n')}` : ''}\n`, warnings: ctx.warnings };
}

// Named enum types, once each, in the order their columns appear.
function enums(ctx: Context, views: TableView[]): string[] {
    const seen = new Map<string, string[]>();
    const out: string[] = [];
    for (const view of views) {
        for (const column of view.columns) {
            const e = column.enum;
            if (!e || e.name === null) {
                continue;
            }
            const known = seen.get(e.name);
            if (known) {
                if (known.join('\u0000') !== e.values.join('\u0000')) {
                    ctx.warn('lossy_conversion', 'column', view.table.id, `${view.label}.${column.name}`, `Enum ${e.name} has different values on ${view.label}.${column.name}; DBML keeps the first list.`);
                }
                continue;
            }
            seen.set(e.name, e.values);
            out.push(`Enum ${dbmlName(e.name)} {\n${e.values.map((v) => `  "${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join('\n')}\n}`);
        }
    }
    return out;
}

function tableBlock(ctx: Context, view: TableView): string {
    const { table, label } = view;
    const lines = [`Table ${tableRef(ctx, view)} {`];
    const single = view.primaryKey.length === 1 ? view.primaryKey[0] : null;
    // Single-column uniqueness written on the column, and so not repeated under indexes.
    const onColumn = new Set<Index | Constraint>();
    for (const column of view.columns) {
        const found = view.uniqueColumn(column.name);
        // Only an index the column setting says everything about; any other stays under indexes with its details.
        const unique = found && (!('parts' in found) || plain(found)) ? found : undefined;
        if (unique) {
            onColumn.add(unique);
            if (unique.name !== null) {
                ctx.warn('lossy_conversion', 'parts' in unique ? 'index' : 'constraint', unique.id, label, `The unique ${'parts' in unique ? 'index' : 'constraint'} ${unique.name} on ${label}.${column.name} is written as the column's unique setting; its name is not kept.`);
            }
        }
        const settings = [
            single === column.name ? 'pk' : '',
            column.autoIncrement ? 'increment' : '',
            column.nullable ? '' : 'not null',
            unique ? 'unique' : '',
            defaultSetting(ctx, view, column),
            column.comment !== null || column.note !== null ? `note: ${quoted(joined(column.comment, column.note))}` : '',
        ].filter(Boolean);
        const type = column.enum?.name ? dbmlName(column.enum.name) : dbmlType(column.type);
        lines.push(`  ${dbmlName(column.name)} ${type}${settings.length ? ` [${settings.join(', ')}]` : ''}`);
        columnWarnings(ctx, view, column);
    }

    const indexLines: string[] = [];
    if (view.primaryKey.length > 1) {
        indexLines.push(`    (${view.primaryKey.map(dbmlName).join(', ')}) [pk]`);
    }
    for (const index of view.indexes) {
        if (index.backs?.kind === 'primary_key' || onColumn.has(index)) {
            continue;
        }
        const line = indexLine(ctx, view, index);
        if (line) {
            indexLines.push(line);
        }
    }
    for (const c of view.constraints) {
        if (c.kind !== 'unique' || onColumn.has(c) || view.indexes.some((i) => i.backs?.kind === 'unique_constraint' && i.backs.constraint === c.id)) {
            continue;
        }
        const keys = [...c.columns.map(dbmlName), ...(c.expression !== null ? [code(ctx, view, c.expression)] : [])];
        indexLines.push(`    ${keys.length === 1 ? keys[0] : `(${keys.join(', ')})`} [unique${c.name !== null ? `, name: ${quoted(c.name)}` : ''}]`);
        ctx.warn('lossy_conversion', 'constraint', c.id, label, `The unique constraint ${c.name ?? 'unnamed'} on ${label} is written as a unique index; DBML has no unique constraints apart from indexes.`);
    }
    if (indexLines.length) {
        lines.push('', '  indexes {', ...indexLines, '  }');
    }

    const checks = view.constraints.filter((c) => c.kind === 'check');
    const checkLines: string[] = [];
    for (const c of checks) {
        if (c.expression === null) {
            ctx.warn('skipped_entity', 'constraint', c.id, label, `The check constraint ${c.name ?? 'unnamed'} on ${label} has no reported expression; it is left out.`);
            continue;
        }
        checkLines.push(`    ${code(ctx, view, c.expression)}${c.name !== null ? ` [name: ${quoted(c.name)}]` : ''}`);
    }
    if (checkLines.length) {
        lines.push('', '  checks {', ...checkLines, '  }');
    }

    if (table.comment !== null || table.note !== null) {
        lines.push(`  Note: ${quoted(joined(table.comment, table.note))}`);
    }
    lines.push('}');
    return lines.join('\n');
}

// An index that only makes its columns unique: nothing a column's unique setting would lose but its name.
const plain = (index: Index) =>
    !index.included.length &&
    !(index.dialectOptions && Object.keys(index.dialectOptions).length) &&
    (index.method === null || index.method.toLowerCase() === 'btree') &&
    index.parts.every((p) => p.order === null && p.nulls === null && p.collation === null && p.opclass === null);

// SQL text in backticks; a backtick inside it becomes a quote, as DBML has no escape for it.
function code(ctx: Context, view: TableView, sql: string): string {
    if (sql.includes('`')) {
        ctx.warn('lossy_conversion', 'table', view.table.id, view.label, `SQL text on ${view.label} contains a backtick, which DBML cannot hold; it is written as a quote: ${sql}`);
    }
    return `\`${sql.replace(/`/g, "'")}\``;
}

function defaultSetting(ctx: Context, view: TableView, column: Column): string {
    // An auto-increment column's default (an identity, a sequence's nextval) is the increment itself.
    if (column.default === null || column.autoIncrement) {
        return '';
    }
    return `default: ${code(ctx, view, column.default.value)}`;
}

function columnWarnings(ctx: Context, view: TableView, column: Column): void {
    const at = `${view.label}.${column.name}`;
    if (column.generated !== null) {
        ctx.warn('unsupported_feature', 'column', view.table.id, at, `${at} is a generated${column.generated.kind ? ` (${column.generated.kind})` : ''} column; DBML cannot state its expression: ${column.generated.expression}`);
    }
    if (column.collation !== null) {
        ctx.warn('unsupported_feature', 'column', view.table.id, at, `DBML has no column collation; ${at} uses ${column.collation}.`);
    }
}

function indexLine(ctx: Context, view: TableView, index: Index): string | null {
    const { label } = view;
    const name = index.name ?? 'unnamed';
    if (index.expression && !index.parts.some((p) => p.expression !== null)) {
        ctx.warn('skipped_entity', 'index', index.id, label, `Index ${name} on ${label} is on an expression whose text was not reported; it is left out.`);
        return null;
    }
    const keys = index.parts.map((p) => (p.column !== null ? dbmlName(p.column) : code(ctx, view, p.expression as string)));
    const lost: string[] = [];
    if (index.partial) {
        lost.push(index.predicate === null ? 'that it is partial (its predicate was not reported)' : `the predicate WHERE ${index.predicate}`);
    }
    if (index.included.length) {
        lost.push(`the included columns (${index.included.join(', ')})`);
    }
    for (const p of index.parts) {
        const key = p.column ?? p.expression ?? '';
        const details = [p.order ? `order ${p.order}` : '', p.nulls ? `nulls ${p.nulls}` : '', p.length !== null ? `prefix length ${p.length}` : '', p.collation ? `collation ${p.collation}` : '', p.opclass ? `operator class ${p.opclass}` : ''].filter(Boolean);
        if (details.length) {
            lost.push(`${key}'s ${details.join(', ')}`);
        }
    }
    const method = index.method?.toLowerCase() ?? null;
    if (method !== null && method !== 'btree' && method !== 'hash') {
        lost.push(`the method ${index.method}`);
    }
    if (index.dialectOptions && Object.keys(index.dialectOptions).length) {
        lost.push(`the dialect options (${Object.keys(index.dialectOptions).join(', ')})`);
    }
    if (lost.length) {
        ctx.warn('lossy_conversion', 'index', index.id, label, `Index ${name} on ${label} loses ${lost.join('; ')}: DBML cannot state them.`);
    }
    const settings = [index.unique ? 'unique' : '', method === 'hash' ? 'type: hash' : '', index.name !== null ? `name: ${quoted(index.name)}` : ''].filter(Boolean);
    return `    ${keys.length === 1 ? keys[0] : `(${keys.join(', ')})`}${settings.length ? ` [${settings.join(', ')}]` : ''}`;
}

function references(ctx: Context, views: TableView[]): string[] {
    const out: string[] = [];
    const written = new Map<string, string>();
    for (const view of views) {
        for (const { fk, target } of view.foreignKeys) {
            const from = `${tableRef(ctx, view)}.${columnsRef(fk.columns)}`;
            const to = `${tableRef(ctx, { table: target })}.${columnsRef(fk.foreignColumns)}`;
            const key = [from, to].sort().join('\u0000');
            const name = fk.name ?? 'unnamed';
            const earlier = written.get(key);
            if (earlier !== undefined) {
                ctx.warn('skipped_entity', 'foreignKey', fk.id, view.label, `Foreign key ${name} on ${view.label} has the same columns as ${earlier}; DBML allows one Ref per pair of endpoints, so it is left out.`);
                continue;
            }
            written.set(key, name);
            const actions = [
                fk.onDelete !== null && fk.onDelete !== 'NO ACTION' ? `delete: ${actionWords(fk.onDelete)}` : '',
                fk.onUpdate !== null && fk.onUpdate !== 'NO ACTION' ? `update: ${actionWords(fk.onUpdate)}` : '',
            ].filter(Boolean);
            out.push(`Ref${fk.name !== null ? ` ${dbmlName(fk.name)}` : ''}: ${from} ${view.unique(fk.columns) ? '-' : '>'} ${to}${actions.length ? ` [${actions.join(', ')}]` : ''}`);
            if (fk.deferrable || fk.initially === 'DEFERRED') {
                ctx.warn('unsupported_feature', 'foreignKey', fk.id, view.label, `DBML cannot state that foreign key ${name} on ${view.label} is deferrable${fk.initially ? `, initially ${fk.initially.toLowerCase()}` : ''}.`);
            }
        }
    }
    return out;
}

export const dbml: Exporter = { id: 'dbml', label: 'DBML', extension: 'dbml', mediaType: 'text/plain', export: exportDbml };
