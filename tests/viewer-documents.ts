import { readFileSync } from 'node:fs';
import { buildGraph, compareScopes, type Index, type SchemaDocument } from '../src/contract';
import { byCodePoint } from '../src/contract/serialize';
import { root } from './helpers';

// Viewer-only test documents, derived from the contract's valid fixtures with the shared producer algorithms (tests
// may call them; the viewer never does). They are committed as JSON in tests/viewer-documents/ for the component and
// browser tests, and a test keeps them current and strictly valid.

const valid = (name: string): SchemaDocument => JSON.parse(readFileSync(root('contract/fixtures/valid', `${name}.json`), 'utf8'));
const sorted = (doc: SchemaDocument): SchemaDocument => ({ ...doc, comparisons: [...doc.comparisons].sort((a, b) => byCodePoint(a.id, b.id)) });

export const VIEWER_DOCUMENTS: Record<string, () => SchemaDocument> = {
    // Three connections and a relationship through a table on another connection: teams → users through cache's
    // sessions, so showing one connection must draw the intermediate table as a reference.
    'viewer-cross-connection-through': () => {
        const doc = valid('combined-multi-connection');
        const team = doc.relationships.find((r) => r.id === 'App\\Models\\User::team');
        if (!team) {
            throw new Error('combined-multi-connection changed: no User::team relationship');
        }
        const through = {
            ...team,
            id: 'App\\Models\\Team::sessionUsers',
            name: 'sessionUsers',
            model: 'App\\Models\\Team',
            table: 'app:public.teams',
            relatedModel: 'App\\Models\\User',
            relatedTable: 'app:public.users',
            type: 'HasManyThrough',
            cardinality: 'one-to-many' as const,
            collection: true,
            keys: null,
            through: ['cache:sessions'],
            source: null,
        };
        const relationships = [...doc.relationships, through].sort((a, b) => byCodePoint(a.id, b.id));
        return { ...doc, relationships, ...buildGraph({ connections: doc.connections, relationships }) };
    },
    // Every kind of line end: a composite, nullable foreign key unique in another column order (order_lines →
    // products), non-unique ones (customer_tags.tag_id, part of a composite primary key), one whose only unique index
    // is partial (orders.customer_id, made nullable), a relationship-only link, and a relationship through orders.
    'viewer-cardinality': () => {
        const doc = valid('declared-sqlalchemy');
        const index = (table: string, name: string, columns: string[], partial = false): Index => ({
            backs: null,
            expression: false,
            id: `${table}:index:${name}`,
            included: [],
            method: null,
            name,
            partial,
            parts: columns.map((column) => ({ collation: null, column, expression: null, length: null, nulls: null, opclass: null, order: null })),
            predicate: partial ? 'customer_id IS NOT NULL' : null,
            provenance: ['declared'],
            unique: true,
        });
        const added: Record<string, Index[]> = {
            'table:default.sales.order_lines': [index('table:default.sales.order_lines', 'order_lines_product_unique', ['product_region', 'product_sku'])],
            'table:default.sales.orders': [index('table:default.sales.orders', 'orders_customer_open', ['customer_id'], true)],
        };
        const connections = doc.connections.map((c) => ({
            ...c,
            tables: c.tables.map((t) => ({
                ...t,
                columns: t.columns.map((col) => ((t.id === 'table:default.sales.orders' && col.name === 'customer_id') || (t.id === 'table:default.sales.order_lines' && col.name === 'product_sku') ? { ...col, nullable: true } : col)),
                indexes: [...t.indexes, ...(added[t.id] ?? [])].sort((a, b) => byCodePoint(a.id, b.id)),
            })),
        }));
        const orders = doc.relationships.find((r) => r.id === 'relationship:shop.models.Customer.orders');
        if (!orders) {
            throw new Error('declared-sqlalchemy changed: no Customer.orders relationship');
        }
        const lines = {
            ...orders,
            id: 'relationship:shop.models.Customer.lines',
            name: 'lines',
            inverse: null,
            join: { primary: 'customers.id = sales.orders.customer_id', secondary: 'sales.orders.id = sales.order_lines.order_id' },
            keys: null,
            relatedModel: 'model:shop.models.OrderLine',
            relatedTable: 'table:default.sales.order_lines',
            through: ['table:default.sales.orders'],
            readOnly: true,
        };
        const relationships = [...doc.relationships, lines].sort((a, b) => byCodePoint(a.id, b.id));
        return { ...doc, connections, relationships, ...buildGraph({ connections, relationships }) };
    },
    // Both directions of the tenant comparison, so baseline and target can be chosen and swapped.
    'viewer-two-way-comparison': () => {
        const doc = valid('comparison-tenant-schemas');
        const [forward] = doc.comparisons;
        return sorted({ ...doc, comparisons: [forward, compareScopes(doc, forward.target, forward.baseline)] });
    },
    // A complete comparison of two equal tenant schemas: no differences at all, beside migration tracks.
    'viewer-clean-comparison': () => {
        const doc = valid('migrations-alembic');
        const app = doc.connections[0].id;
        return sorted({ ...doc, comparisons: [compareScopes(doc, { connection: app, schema: 'tenant_behind' }, { connection: app, schema: 'tenant_branches' })] });
    },
};
