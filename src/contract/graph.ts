import { hashId } from './serialize';
import type { DerivedLink, Endpoint, Link, Relationship, SchemaDocument } from './types';

// The framework-neutral graph builder: links and derived links from a document's foreign keys and relationships.
// Producers in other languages implement the same rules (docs/contract.md, "Graph") and are checked against the
// conformance fixtures in contract/conformance/graph.
//
// 1. Every foreign key whose target table is in the document, in the same connection, is a link from its columns to the
//    referenced columns. A foreign key never crosses connections; only relationships may.
// 2. Every relationship's keys are a link the same way. Keys equal to a foreign key's, as unordered column pairs, join
//    that foreign key's link; the relationship never creates or implies a constraint.
// 3. A pivot relationship is two links, both from the pivot table: to the declaring side and to the related side.
// 4. A through relationship is a derived link from its table to its related table, via its intermediate tables.
// 5. Nothing without resolvable endpoints has a link: MorphTo, unresolved relationships, and keys naming a table or
//    column the document does not have.

export type GraphResult = { links: Link[]; derivedLinks: DerivedLink[] };

type Pair = [string, string];

// The link key: the two tables and their column pairs, sorted, so (a, b) → (x, y) and (b, a) → (y, x) are one link.
function keyOf(from: Endpoint, to: Endpoint): { id: string; pairs: Pair[] } {
    const pairs = from.columns.map((c, i): Pair => [c, to.columns[i]]).sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0));
    return { id: linkId(from.table, to.table, pairs), pairs };
}

export const linkId = (fromTable: string, toTable: string, pairs: Pair[]) => hashId('l', ['link', fromTable, toTable, pairs]);
export const derivedLinkId = (relationship: string) => hashId('d', ['derived', relationship]);

export function buildGraph(doc: Pick<SchemaDocument, 'connections' | 'relationships'>): GraphResult {
    const columns = new Map(doc.connections.flatMap((c) => c.tables.map((t) => [t.id, new Set(t.columns.map((col) => col.name))] as const)));
    const connectionOf = new Map(doc.connections.flatMap((c) => c.tables.map((t) => [t.id, c.id] as const)));
    const resolved = (e: Endpoint) => e.columns.length > 0 && e.columns.every((c) => columns.get(e.table)?.has(c));
    const links = new Map<string, Link & { notes: string[] }>();

    const add = (from: Endpoint, to: Endpoint, entry: { foreignKey?: string; relationship?: Relationship }) => {
        if (!resolved(from) || !resolved(to) || from.columns.length !== to.columns.length) {
            return;
        }
        const { id } = keyOf(from, to);
        let link = links.get(id);
        if (!link) {
            link = { id, from, to, foreignKey: null, relationships: [], state: 'relationship', polymorphic: false, note: null, notes: [] };
            links.set(id, link);
        }
        if (entry.foreignKey !== undefined) {
            // Duplicate constraints on the same columns: the smallest id stands for them; the endpoints follow it.
            if (link.foreignKey === null || entry.foreignKey < link.foreignKey) {
                link.foreignKey = entry.foreignKey;
                link.from = from;
                link.to = to;
            }
        }
        const r = entry.relationship;
        if (r && !link.relationships.includes(r.id)) {
            link.relationships.push(r.id);
            link.polymorphic ||= r.polymorphic !== null;
            if (r.note) {
                link.notes.push(`${r.id}\u0000${r.note}`);
            }
        }
    };

    // Foreign keys first, so a link's endpoints follow the constraint's column order.
    for (const connection of doc.connections) {
        for (const table of connection.tables) {
            for (const fk of [...table.foreignKeys].sort((a, b) => (a.id < b.id ? -1 : 1))) {
                if (connectionOf.get(fk.foreignTable) !== connection.id) {
                    continue;
                }
                add({ table: table.id, columns: fk.columns }, { table: fk.foreignTable, columns: fk.foreignColumns }, { foreignKey: fk.id });
            }
        }
    }

    const tables = new Set(columns.keys());
    const derivedLinks: DerivedLink[] = [];
    for (const r of doc.relationships) {
        if (r.through?.length) {
            if (r.relatedTable !== null && tables.has(r.table) && tables.has(r.relatedTable) && r.through.every((t) => tables.has(t))) {
                derivedLinks.push({ id: derivedLinkId(r.id), from: r.table, to: r.relatedTable, via: r.through, relationship: r.id });
            }
        } else if (r.pivot) {
            const p = r.pivot;
            add({ table: p.table, columns: p.parentPivotColumns }, { table: r.table, columns: p.parentColumns }, { relationship: r });
            if (r.relatedTable !== null) {
                add({ table: p.table, columns: p.relatedPivotColumns }, { table: r.relatedTable, columns: p.relatedColumns }, { relationship: r });
            }
        } else if (r.keys) {
            add(r.keys.from, r.keys.to, { relationship: r });
        }
    }

    const result = [...links.values()]
        .map(({ notes, ...link }): Link => {
            link.relationships.sort();
            link.state = link.foreignKey !== null ? (link.relationships.length ? 'both' : 'foreign_key') : 'relationship';
            // The note of the first relationship, by id, that has one.
            link.note = notes.sort()[0]?.split('\u0000')[1] ?? null;
            return link;
        })
        .sort((a, b) => (a.id < b.id ? -1 : 1));
    derivedLinks.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { links: result, derivedLinks };
}
