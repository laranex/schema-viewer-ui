import type { Connection, DerivedLink, Diagnostic, Link, Model, Relationship, SchemaDocument, Table } from '../contract/types';

// Pure document-to-diagram functions. The viewer draws the links and derived links the document stores; it never
// derives relationships or constraints of its own.

export type EdgeKind = 'both' | 'foreign_key' | 'relationship' | 'through';

export type GraphEdge = {
    id: string;
    kind: EdgeKind;
    // Table ids: from the referencing table to the referenced one.
    source: string;
    target: string;
    sourceColumn?: string;
    targetColumn?: string;
    label: string;
    // What the edge is, in a few words: the relationship's cardinality, FK, or through.
    chip: string;
    // A foreign key only the ORM declares, in a combined document: not enforced by the database.
    declaredOnly: boolean;
    polymorphic: boolean;
    // The two ends are in different connections: always an ORM relationship, never a foreign key.
    crossConnection: boolean;
    link: Link | null;
    derived: DerivedLink | null;
    // The referencing end may hold the same key more than once: a crow's foot, else a single bar (Laravel's markers).
    many: boolean;
};

// Card geometry, shared by the cards' CSS, the layout and the edge routes.
export const CARD_WIDTH = 300;
export const HEADER_HEIGHT = 54;
export const ROW_HEIGHT = 27;
export const MORE_HEIGHT = 30;

export const tableLabel = (table: Pick<Table, 'name' | 'schema'>) => `${table.schema ? `${table.schema}.` : ''}${table.name}`;

export type Lookup = {
    tables: Map<string, Table>;
    // Table id to connection id, and connections by id.
    connectionOf: Map<string, string>;
    connections: Map<string, Connection>;
    // More than one connection: labels name the connection, since table names repeat across connections.
    qualified: boolean;
    // A table's label, qualified by its connection when the document has several: analytics · public.users.
    label: (tableId: string) => string;
    relationships: Map<string, Relationship>;
    models: Map<string, Model>;
    foreignKeys: Map<string, Table['foreignKeys'][number]>;
};

export function lookup(doc: SchemaDocument): Lookup {
    const tables = new Map<string, Table>();
    const connectionOf = new Map<string, string>();
    for (const c of doc.connections) {
        for (const t of c.tables) {
            tables.set(t.id, t);
            connectionOf.set(t.id, c.id);
        }
    }
    const connections = new Map(doc.connections.map((c) => [c.id, c]));
    const qualified = doc.connections.length > 1;
    const label = (id: string) => {
        const table = tables.get(id);
        if (!table) {
            return id;
        }
        const name = connections.get(connectionOf.get(id) ?? '')?.name;
        return qualified && name !== undefined ? `${name} · ${tableLabel(table)}` : tableLabel(table);
    };
    return {
        tables,
        connectionOf,
        connections,
        qualified,
        label,
        relationships: new Map(doc.relationships.map((r) => [r.id, r])),
        models: new Map(doc.models.map((m) => [m.id, m])),
        foreignKeys: new Map([...tables.values()].flatMap((t) => t.foreignKeys.map((f) => [f.id, f] as const))),
    };
}

// What a diagnostic is about: its table, when it has one, and the connections it concerns. No connection means the whole
// document (subject "document", or an id the document does not have); a comparison concerns both of its sides.
export type DiagnosticScope = { tableOf: (d: Diagnostic) => string | undefined; connectionsOf: (d: Diagnostic) => string[]; tableOfId: (id: string) => string | undefined };

export function diagnosticScope(doc: SchemaDocument, l: Lookup): DiagnosticScope {
    const owner = new Map<string, string>();
    for (const t of l.tables.values()) {
        for (const part of [...t.indexes, ...t.foreignKeys, ...t.constraints]) {
            owner.set(part.id, t.id);
        }
    }
    const links = new Map(doc.links.map((k) => [k.id, k.from.table]));
    const inferred = new Map(doc.inferredAssociations.map((a) => [a.id, a.table]));
    // The table any entity id belongs to: a table, its index, foreign key or constraint, a relationship, link, model or
    // inferred association.
    const tableOfId = (id: string): string | undefined =>
        l.tables.has(id) ? id : (owner.get(id) ?? l.relationships.get(id)?.table ?? links.get(id) ?? inferred.get(id) ?? l.models.get(id)?.tables.find((t) => l.tables.has(t)));
    const tableOf = (d: Diagnostic): string | undefined => (d.subject.id === null ? undefined : tableOfId(d.subject.id));
    const comparisons = new Map(doc.comparisons.map((c) => [c.id, [...new Set([c.baseline.connection, c.target.connection])]]));
    const tracks = new Map(doc.migrations.map((t) => [t.id, t.connection]));
    const connectionsOf = (d: Diagnostic): string[] => {
        const id = d.subject.id;
        if (id === null || d.subject.type === 'document') {
            return [];
        }
        if (d.subject.type === 'connection') {
            return l.connections.has(id) ? [id] : [];
        }
        if (d.subject.type === 'comparison') {
            return comparisons.get(id) ?? [];
        }
        if (d.subject.type === 'migration') {
            const c = tracks.get(id);
            return c ? [c] : [];
        }
        const table = tableOf(d);
        const c = table === undefined ? undefined : l.connectionOf.get(table);
        return c ? [c] : [];
    };
    return { tableOf, connectionsOf, tableOfId };
}

// Whether these columns are unique in the table on their own: its primary key, or a unique index (whole, columns only)
// or unique constraint on exactly them, in any order.
export function isUnique(table: Table | undefined, columns: string[]): boolean {
    if (!table || !columns.length) {
        return false;
    }
    const same = (other: (string | null)[]) => other.length === columns.length && columns.every((c) => other.includes(c));
    return (
        same(table.primaryKey) ||
        table.indexes.some((i) => i.unique && !i.partial && !i.expression && same(i.parts.map((p) => p.column))) ||
        table.constraints.some((c) => c.kind === 'unique' && same(c.columns))
    );
}

export function edgesFor(doc: SchemaDocument, l: Lookup = lookup(doc)): GraphEdge[] {
    const edges: GraphEdge[] = doc.links.map((link) => {
        const fk = link.foreignKey === null ? undefined : l.foreignKeys.get(link.foreignKey);
        const names = link.relationships.map((id) => l.relationships.get(id)?.name ?? id);
        const fkLabel = `${fk?.name ?? 'FK'} · ${link.from.columns.join(', ')} → ${link.to.columns.join(', ')}`;
        return {
            id: link.id,
            kind: link.state,
            source: link.from.table,
            target: link.to.table,
            sourceColumn: link.from.columns[0],
            targetColumn: link.to.columns[0],
            label: names.length ? names.join(' · ') : fkLabel,
            chip: link.relationships.length ? (l.relationships.get(link.relationships[0])?.cardinality ?? 'relationship') : 'FK',
            declaredOnly: fk !== undefined && !fk.provenance.includes('database') && doc.source === 'combined',
            polymorphic: link.polymorphic,
            crossConnection: l.connectionOf.get(link.from.table) !== l.connectionOf.get(link.to.table),
            link,
            derived: null,
            many: !isUnique(l.tables.get(link.from.table), link.from.columns),
        };
    });
    for (const derived of doc.derivedLinks) {
        const relation = l.relationships.get(derived.relationship);
        edges.push({
            id: derived.id,
            kind: 'through',
            source: derived.from,
            target: derived.to,
            label: `${relation?.name ?? derived.relationship} via ${derived.via.map((id) => l.label(id)).join(', ')}`,
            chip: 'through',
            declaredOnly: false,
            polymorphic: false,
            crossConnection: l.connectionOf.get(derived.from) !== l.connectionOf.get(derived.to),
            link: null,
            derived,
            many: true,
        });
    }
    return edges;
}

export const EDGE_KINDS: EdgeKind[] = ['both', 'foreign_key', 'relationship', 'through'];

// Whether an edge is on with these layers: foreign keys, ORM relationships, or both.
export const edgeShown = (edge: GraphEdge, foreignKeys: boolean, orm: boolean) =>
    edge.kind === 'both' ? foreignKeys || orm : edge.kind === 'foreign_key' ? foreignKeys : orm;

// The table and every table one edge away, including the intermediate tables of a through relationship.
export function neighbors(id: string, edges: GraphEdge[]): Set<string> {
    return within(id, edges, 1);
}

// The tables within depth links of the seeds: one table, or a line's tables (its ends and the tables it goes through).
export function within(seed: string | string[], edges: GraphEdge[], depth: number): Set<string> {
    const seeds = typeof seed === 'string' ? [seed] : seed;
    const seen = new Set(seeds);
    let frontier = [...seeds];
    for (let level = 0; level < depth && frontier.length; level++) {
        const next: string[] = [];
        for (const edge of edges) {
            if (frontier.includes(edge.source) || frontier.includes(edge.target)) {
                for (const t of [edge.source, edge.target, ...(edge.derived?.via ?? [])]) {
                    if (!seen.has(t)) {
                        seen.add(t);
                        next.push(t);
                    }
                }
            }
        }
        frontier = next;
    }
    return seen;
}

export function matchesTable(table: Table, connection: string, query: string, models: Model[]): boolean {
    const q = query.trim().toLocaleLowerCase();
    if (!q) {
        return true;
    }
    const text = [
        connection,
        table.schema ?? '',
        table.name,
        table.note ?? '',
        table.comment ?? '',
        ...table.columns.map((c) => c.name),
        ...models.filter((m) => m.tables.includes(table.id)).map((m) => m.className),
    ].join(' ');
    return text.toLocaleLowerCase().includes(q);
}

// The columns a card keeps when only keys are shown: primary keys, foreign keys, link columns and polymorphic columns.
export function keyColumns(doc: SchemaDocument): Map<string, Set<string>> {
    const keys = new Map(doc.connections.flatMap((c) => c.tables.map((t) => [t.id, new Set([...t.primaryKey, ...t.foreignKeys.flatMap((f) => f.columns)])] as const)));
    for (const link of doc.links) {
        link.from.columns.forEach((c) => keys.get(link.from.table)?.add(c));
        link.to.columns.forEach((c) => keys.get(link.to.table)?.add(c));
    }
    for (const r of doc.relationships) {
        if (r.polymorphic) {
            const own = r.keys?.from.table ?? r.table;
            keys.get(own)?.add(r.polymorphic.typeColumn);
            keys.get(own)?.add(r.polymorphic.idColumn);
        }
    }
    return keys;
}

// How much of a card shows: every column, the key columns, or the table name only.
export type Fold = 'all' | 'keys' | 'none';
export const FOLDS: { value: Fold; label: string }[] = [
    { value: 'keys', label: 'Key columns' },
    { value: 'all', label: 'All columns' },
    { value: 'none', label: 'Table names' },
];

// A card row that holds a note rather than a column: the table's (NOTE) or a column's (NOTE + name).
export const NOTE = '\u0000note:';
export const isNote = (row: string) => row.startsWith(NOTE);

// The rows a card shows, in order, with note rows while notes are on.
export function cardRows(table: Table, fold: Fold, keys: Set<string> | undefined, notes: boolean): string[] {
    const columns = fold === 'none' ? [] : shownColumns(table, fold === 'all', keys);
    if (!notes || fold === 'none') {
        return columns;
    }
    const noted = new Set(table.columns.filter((c) => c.note).map((c) => c.name));
    return [...(table.note ? [NOTE] : []), ...columns.flatMap((c) => (noted.has(c) ? [c, `${NOTE}${c}`] : [c]))];
}

// The column rows a card shows: key columns, and columns the database and the ORM disagree on or only the ORM declares,
// so a folded card never hides drift. With nothing else to show it shows its first three columns, as the Python viewer
// does, so a card is never empty.
export function shownColumns(table: Table, all: boolean, keys: Set<string> | undefined): string[] {
    if (all || !keys) {
        return table.columns.map((c) => c.name);
    }
    const notable = (c: Table['columns'][number]) => !!c.drift?.length || (c.provenance.length === 1 && table.provenance.length === 2);
    const shown = table.columns.filter((c) => keys.has(c.name) || notable(c)).map((c) => c.name);
    return shown.length ? shown : table.columns.slice(0, 3).map((c) => c.name);
}

// rows: every row the card shows, notes included; hidden: the columns folded away.
export const cardHeight = (rows: number, hidden: number) => HEADER_HEIGHT + rows * ROW_HEIGHT + (hidden > 0 && rows > 0 ? MORE_HEIGHT : 0) + 2;

export function relationshipsOf(doc: SchemaDocument, tableId: string): Relationship[] {
    return doc.relationships.filter((r) => r.table === tableId || r.relatedTable === tableId || r.pivot?.table === tableId || (r.through ?? []).includes(tableId));
}

// What a card marks a column as: part of the primary key, a foreign key, or unique on its own.
export function columnMarks(table: Table): Map<string, 'PK' | 'FK' | 'UK'> {
    const marks = new Map<string, 'PK' | 'FK' | 'UK'>();
    for (const i of table.indexes) {
        const column = i.parts.length === 1 ? i.parts[0].column : null;
        if (i.unique && i.backs?.kind !== 'primary_key' && column !== null && !i.partial && !i.expression) {
            marks.set(column, 'UK');
        }
    }
    for (const c of table.constraints) {
        if (c.kind === 'unique' && c.columns.length === 1) {
            marks.set(c.columns[0], 'UK');
        }
    }
    table.foreignKeys.forEach((f) => f.columns.forEach((c) => marks.set(c, 'FK')));
    table.primaryKey.forEach((c) => marks.set(c, 'PK'));
    return marks;
}
