import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SchemaDocument } from '../src/contract';
import { mermaid } from '../src/export';
import { boundsOf, toSvg, type ImageEdge } from '../src/viewer/exportImage';
import { edgesFor, END_SHAPES, isUnique, lineEnds, lookup } from '../src/viewer/graph';
import { root } from './helpers';

// One cardinality rule for line ends (graph.ts isUnique and lineEnds): the diagram's crow's feet, SVG and PNG images
// and the Mermaid export agree. The browser test in e2e/parity.spec.ts checks the drawn screen against the saved SVG.

const doc: SchemaDocument = JSON.parse(readFileSync(root('tests/viewer-documents/viewer-cardinality.json'), 'utf8'));
const l = lookup(doc);
const edges = edgesFor(doc, l);
const startOf = (table: string, columns: string[]) => {
    const edge = edges.find((e) => e.link?.from.table === table && e.link.from.columns.join() === columns.join());
    if (!edge) {
        throw new Error(`no line from ${table} (${columns.join(', ')})`);
    }
    return lineEnds(edge);
};

describe('line ends', () => {
    it('are one only where the database enforces uniqueness on the referencing columns, in any order', () => {
        // Composite and nullable, unique as (product_region, product_sku).
        expect(startOf('table:default.sales.order_lines', ['product_sku', 'product_region'])).toEqual({ start: 'one', end: 'parent' });
        // Part of a composite primary key only.
        expect(startOf('table:default.customer_tags', ['tag_id'])).toEqual({ start: 'many', end: 'parent' });
        expect(startOf('table:default.sales.order_lines', ['order_id'])).toEqual({ start: 'many', end: 'parent' });
        // Nullable, with only a partial unique index.
        expect(startOf('table:default.sales.orders', ['customer_id'])).toEqual({ start: 'many', end: 'parent' });
        // A relationship-only link follows the same rule.
        expect(startOf('table:default.sales.orders', ['referrer_email'])).toEqual({ start: 'many', end: 'parent' });
        // A relationship through other tables has only an arrow.
        const through = edges.filter((e) => e.kind === 'through');
        expect(through).toHaveLength(1);
        expect(lineEnds(through[0])).toEqual({ start: null, end: 'arrow' });
    });

    it('ignore partial, expression and prefix-length indexes and expression constraints', () => {
        const part = { collation: null, expression: null, length: null, nulls: null, opclass: null, order: null };
        const index = { backs: null, expression: false, id: 'i', included: [], method: null, name: 'i', partial: false, predicate: null, provenance: ['database' as const], unique: true };
        const table = (indexes: object[], constraints: object[] = []) => ({ primaryKey: [], indexes, constraints }) as never;
        expect(isUnique(table([{ ...index, parts: [{ ...part, column: 'b' }, { ...part, column: 'a' }] }]), ['a', 'b'])).toBe(true);
        expect(isUnique(table([{ ...index, partial: true, parts: [{ ...part, column: 'a' }] }]), ['a'])).toBe(false);
        expect(isUnique(table([{ ...index, parts: [{ ...part, column: 'a', length: 10 }] }]), ['a'])).toBe(false);
        expect(isUnique(table([{ ...index, expression: true, parts: [{ ...part, column: null, expression: 'lower(a)' }] }]), ['a'])).toBe(false);
        expect(isUnique(table([], [{ kind: 'unique', columns: ['a'], expression: 'lower(a)' }]), ['a'])).toBe(false);
        expect(isUnique(table([], [{ kind: 'unique', columns: ['a'], expression: null }]), ['a'])).toBe(true);
        expect(isUnique(table([{ ...index, parts: [{ ...part, column: 'a' }, { ...part, column: 'b' }] }]), ['a'])).toBe(false);
    });

    it('match the Mermaid export, foreign key by foreign key', () => {
        const lines = mermaid.export(doc).content.split('\n');
        const foreignKeyEdges = edges.filter((e) => e.link?.foreignKey);
        expect(foreignKeyEdges).toHaveLength(5);
        for (const edge of foreignKeyEdges) {
            const fk = l.foreignKeys.get(edge.link?.foreignKey as string);
            const line = lines.find((s) => s.endsWith(`: "${fk?.columns.join(', ')}"`) && s.includes(l.label(edge.source).replace('.', '_')));
            expect(line, edge.id).toBeDefined();
            expect(line, edge.id).toContain(lineEnds(edge).start === 'one' ? '--o|' : '--o{');
        }
    });

    it('draw the screen markers’ shapes in images, facing the card', () => {
        const node = (x: number) => ({ x, y: 0, width: 300, height: 100, title: 't', subtitle: '', rows: [], more: 0, declaredOnly: false });
        const nodes = [node(0), node(600)];
        const colors = new Proxy({}, { get: () => '#000' }) as never;
        for (const edge of edges) {
            const ends = lineEnds(edge);
            const image: ImageEdge = { kind: edge.kind, declaredOnly: false, sx: 300, sy: 50, cx: 450, tx: 600, ty: 50, label: null, ...ends };
            const svg = toSvg({ nodes, edges: [image], bounds: boundsOf(nodes) }, colors);
            // At the referencing card (right side of x = 300, the line going +x) a shape's points lie at 300 + out; at
            // the referenced card (x = 600, line arriving going +x) at 600 − out.
            const expected = [
                ...(ends.start ? END_SHAPES[ends.start].map((points) => `M ${points.map(([out, across]) => `${300 + out} ${50 + across}`).join(' L ')}`) : []),
                ...END_SHAPES[ends.end].map((points) => `M ${points.map(([out, across]) => `${600 - out} ${50 + across}`).join(' L ')}${ends.end === 'arrow' ? ' Z' : ''}`),
            ];
            for (const d of expected) {
                expect(svg, edge.id).toContain(`<path d="${d}"`);
            }
        }
    });
});
