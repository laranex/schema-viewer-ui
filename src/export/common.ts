import type { Column, Connection, Constraint, Drift, ForeignKey, Index, Provenance, ReferentialAction, SchemaDocument, SubjectType, Table } from '../contract/types';
import { tableLabel } from '../viewer/graph';
import type { ExportOptions, ExportWarning, ExportWarningCode } from './types';

export { tableLabel };

// What every text exporter shares: the connections in scope, the database facts of each table (in a combined document,
// what only the ORM declares is not in the database and is left out), uniqueness, and warnings.

export type Context = {
    doc: SchemaDocument;
    options: ExportOptions;
    connections: Connection[];
    // More than one connection in one file: table names are qualified by their connection.
    several: boolean;
    tables: Map<string, Table>;
    connectionOf: Map<string, Connection>;
    inScope: Set<string>;
    warnings: ExportWarning[];
    warn: (code: ExportWarningCode, type: SubjectType, id: string | null, label: string | null, message: string) => void;
};

export function selectConnections(doc: SchemaDocument, ids: string[] | undefined): Connection[] {
    if (ids === undefined) {
        return doc.connections;
    }
    const unknown = ids.filter((id) => !doc.connections.some((c) => c.id === id));
    if (unknown.length) {
        throw new Error(`Unknown connection: ${unknown.join(', ')}`);
    }
    return doc.connections.filter((c) => ids.includes(c.id));
}

export function context(doc: SchemaDocument, options: ExportOptions = {}): Context {
    const connections = selectConnections(doc, options.connections);
    const tables = new Map<string, Table>();
    const connectionOf = new Map<string, Connection>();
    for (const c of doc.connections) {
        for (const t of c.tables) {
            tables.set(t.id, t);
            connectionOf.set(t.id, c);
        }
    }
    const warnings: ExportWarning[] = [];
    const ctx: Context = {
        doc,
        options,
        connections,
        several: connections.length > 1,
        tables,
        connectionOf,
        inScope: new Set(connections.flatMap((c) => c.tables.map((t) => t.id))),
        warnings,
        warn: (code, type, id, label, message) => warnings.push({ code, subject: { type, id, label }, message }),
    };
    return ctx;
}

// The warnings about the document as a whole that every database format shares: ORM-only sources and incomplete
// inspections.
export function sourceWarnings(ctx: Context): void {
    if (ctx.doc.source === 'declared') {
        ctx.warn('declared_source', 'document', null, null, 'This document holds ORM declarations only; the file describes the declared schema, not an inspected database.');
    }
    const declared = ctx.doc.source === 'declared';
    for (const c of ctx.connections) {
        const coverage = declared ? c.coverage.declared : c.coverage.database;
        if (coverage && !coverage.complete) {
            const gaps = Object.entries(coverage.features)
                .filter(([, state]) => state === 'partial' || state === 'unavailable')
                .map(([feature, state]) => `${feature}: ${state}`);
            const detail = gaps.length ? `incomplete (${gaps.join(', ')})` : 'incomplete';
            ctx.warn('incomplete_coverage', 'connection', c.id, c.name, `The ${declared ? 'declarations' : 'database inspection'} of ${c.name} ${declared ? 'are' : 'is'} ${detail}; the file holds only what was read.`);
        }
    }
}

const declaredOnly = (doc: SchemaDocument, provenance: Provenance) => doc.source === 'combined' && !provenance.includes('database');

// A table's label in the file: qualified by its connection's name when the file holds several connections.
export const labelOf = (ctx: Context, table: Table) => (ctx.several ? `${ctx.connectionOf.get(table.id)?.name ?? ''}.${tableLabel(table)}` : tableLabel(table));

export const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// The key columns of an index when every part is a whole column (no expression, no prefix length), else null.
export const plainColumns = (index: Index): string[] | null =>
    !index.expression && index.parts.every((p) => p.column !== null && p.length === null) ? index.parts.map((p) => p.column as string) : null;

// A uniqueness a database enforces on exactly these columns: no partial or expression index, no prefix length.
const enforcesUnique = (index: Index) => index.unique && !index.partial && plainColumns(index) !== null;

// Whether a table enforces uniqueness on exactly these columns, in this order: its primary key, a unique index (not
// partial, no expression or prefix length) or a unique constraint.
export const uniqueOn = (table: Pick<Table, 'primaryKey' | 'indexes' | 'constraints'>, columns: string[]) =>
    (table.primaryKey.length > 0 && sameList(table.primaryKey, columns)) ||
    table.indexes.some((i) => enforcesUnique(i) && sameList(plainColumns(i) as string[], columns)) ||
    table.constraints.some((c) => c.kind === 'unique' && c.expression === null && sameList(c.columns, columns));

export type ResolvedForeignKey = { fk: ForeignKey; target: Table };

// One table as the database has it, with the warnings about what was left out.
export type TableView = {
    table: Table;
    connection: Connection;
    label: string;
    columns: Column[];
    indexes: Index[];
    foreignKeys: ResolvedForeignKey[];
    constraints: Constraint[];
    primaryKey: string[];
    // Unique on exactly these columns, in this order: the primary key, a unique index or a unique constraint.
    unique: (columns: string[]) => boolean;
    // The single-column uniqueness of a column, other than the primary key.
    uniqueColumn: (name: string) => Index | Constraint | undefined;
};

function driftWarning(ctx: Context, what: string, type: SubjectType, id: string | null, label: string, drift: Drift[] | undefined) {
    if (drift?.length) {
        ctx.warn('lossy_conversion', type, id, label, `The database and the ORM disagree on ${what}'s ${drift.map((d) => d.field).join(', ')}; the file has the database's value.`);
    }
}

export function viewOf(ctx: Context, table: Table): TableView {
    const { doc } = ctx;
    const connection = ctx.connectionOf.get(table.id) as Connection;
    const label = labelOf(ctx, table);
    const skip = (type: SubjectType, id: string | null, what: string) => ctx.warn('skipped_entity', type, id, label, `${what} is declared only by the ORM, not in the database; it is left out.`);
    driftWarning(ctx, `table ${label}`, 'table', table.id, label, table.drift);
    const columns = table.columns.filter((c) => {
        driftWarning(ctx, `column ${label}.${c.name}`, 'column', table.id, `${label}.${c.name}`, c.drift);
        return declaredOnly(doc, c.provenance) ? (skip('column', table.id, `Column ${label}.${c.name}`), false) : true;
    });
    const indexes = table.indexes.filter((i) => {
        driftWarning(ctx, `index ${i.name ?? 'unnamed'}`, 'index', i.id, label, i.drift);
        return declaredOnly(doc, i.provenance) ? (skip('index', i.id, `Index ${i.name ?? 'unnamed'} on ${label}`), false) : true;
    });
    const constraints = table.constraints.filter((c) => {
        driftWarning(ctx, `constraint ${c.name ?? 'unnamed'}`, 'constraint', c.id, label, c.drift);
        return declaredOnly(doc, c.provenance) ? (skip('constraint', c.id, `Constraint ${c.name ?? 'unnamed'} on ${label}`), false) : true;
    });
    const foreignKeys: ResolvedForeignKey[] = [];
    for (const fk of table.foreignKeys) {
        driftWarning(ctx, `foreign key ${fk.name ?? 'unnamed'}`, 'foreignKey', fk.id, label, fk.drift);
        const target = ctx.tables.get(fk.foreignTable);
        if (declaredOnly(doc, fk.provenance)) {
            skip('foreignKey', fk.id, `Foreign key ${fk.name ?? 'unnamed'} on ${label}`);
        } else if (!target || declaredOnly(doc, target.provenance)) {
            ctx.warn('skipped_entity', 'foreignKey', fk.id, label, `Foreign key ${fk.name ?? 'unnamed'} on ${label} references a table ${target ? 'the database does not have' : 'the document does not have'}; it is left out.`);
        } else if (!fk.foreignColumns.every((c) => target.columns.some((col) => col.name === c && !declaredOnly(doc, col.provenance)))) {
            ctx.warn('skipped_entity', 'foreignKey', fk.id, label, `Foreign key ${fk.name ?? 'unnamed'} on ${label} references ${fk.foreignColumns.join(', ')}, which ${labelOf(ctx, target)} does not have; it is left out.`);
        } else {
            foreignKeys.push({ fk, target });
        }
    }
    const unique = (cols: string[]) => uniqueOn({ primaryKey: table.primaryKey, indexes, constraints }, cols);
    const uniqueColumn = (name: string) =>
        indexes.find((i) => enforcesUnique(i) && i.backs?.kind !== 'primary_key' && sameList(plainColumns(i) as string[], [name])) ??
        constraints.find((c) => c.kind === 'unique' && c.expression === null && sameList(c.columns, [name]));
    return { table, connection, label, columns, indexes, foreignKeys, constraints, primaryKey: table.primaryKey, unique, uniqueColumn };
}

// A referential action in lower-case words, as DBML and Laravel's exports write them.
export const actionWords = (action: ReferentialAction | null) => (action === null ? null : action.toLowerCase());

// A connection's tables as the database has them, in document order: in a combined document a table only the ORM
// declares is not in the database and is left out (with a warning). Call once per connection and export.
export function tablesOf(ctx: Context, connection: Connection): Table[] {
    return connection.tables.filter((t) => {
        if (declaredOnly(ctx.doc, t.provenance)) {
            ctx.warn('skipped_entity', 'table', t.id, labelOf(ctx, t), `Table ${labelOf(ctx, t)} is declared only by the ORM, not in the database; it is left out.`);
            return false;
        }
        return true;
    });
}

// The tables of every connection in scope, as tablesOf gives them.
export const scopedTables = (ctx: Context) => ctx.connections.flatMap((c) => tablesOf(ctx, c));

// A class name without its namespace or module path: App\Models\User and shop.models.User are both User.
export const shortClass = (name: string) => name.split(/[\\.]/).pop() ?? name;

// The download name of an export, after Laranex Laravel Schema Viewer's: schema-<connection>.<extension>, with every
// character outside [A-Za-z0-9_-] replaced by "-"; schema-all.<extension> for several connections.
export function exportFileName(doc: SchemaDocument, extension: string, connections?: string[]): string {
    const chosen = selectConnections(doc, connections);
    return `schema-${chosen.length === 1 ? safeName(chosen[0].name) : 'all'}.${extension}`;
}

export const safeName = (name: string) => name.replace(/[^A-Za-z0-9_-]/g, '-');
