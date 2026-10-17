import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { CARD_WIDTH } from './graph';
import { GAP } from './routing';

// Automatic layout with ELK. Arrangements, packed columns and the layout cache are adapted from Laranex Laravel Schema
// Viewer (MIT), ui/src/layout.ts. ELK runs on the page from elkjs's bundled build, loaded on first use: it needs no
// worker, blob URL or eval, so it works under a strict Content-Security-Policy (script-src 'self').

export type Positions = Record<string, { x: number; y: number }>;

// left-right: layers along the relationships, referenced tables left of the tables that point at them;
// snowflake: the most connected tables in the middle; compact: a tight rectangle in name order.
export type Arrangement = 'left-right' | 'snowflake' | 'compact';
export const ARRANGEMENTS: { value: Arrangement; label: string }[] = [
    { value: 'left-right', label: 'Left-right' },
    { value: 'snowflake', label: 'Snowflake' },
    { value: 'compact', label: 'Compact' },
];

export type LayoutRequest = {
    ids: string[];
    heights: Record<string, number>;
    // Directed from the referencing table to the referenced one.
    edges: { id: string; source: string; target: string }[];
    arrangement: Arrangement;
    // The width:height a packed layout aims for: wide on a desktop, tall on a phone.
    aspect: number;
};

type Elk = { layout: (graph: ElkNode) => Promise<ElkNode> };

let engine: Promise<Elk> | null = null;

const elk = () =>
    (engine ??= import('elkjs/lib/elk.bundled.js').then((module) => {
        const ELK = (module.default ?? module) as unknown as new () => Elk;
        return new ELK();
    }));

const KEEP = 24;
const LARGE = 40;
const PACKABLE = 12;
const STACK_GAP = 48;
const cache = new Map<string, Positions>();

export async function autoLayout(request: LayoutRequest): Promise<Positions> {
    const { ids, heights, arrangement, aspect } = request;
    const key = `${arrangement}@${aspect.toFixed(2)}#${ids.map((id) => `${id}:${heights[id] ?? 120}`).join('|')}#${request.edges.map((e) => e.id).join('|')}`;
    const known = cache.get(key);
    if (known) {
        cache.delete(key);
        cache.set(key, known);
        return known;
    }

    const visible = new Set(ids);
    const edges = request.edges
        .filter((e) => e.source !== e.target && visible.has(e.source) && visible.has(e.target))
        // Referenced tables go to the left, so ELK's edges run from target to source.
        .map((e) => ({ id: e.id, sources: [e.target], targets: [e.source] }));
    const children = ids.map((id) => ({ id, width: CARD_WIDTH, height: heights[id] ?? 120 }));
    const placed = (result: ElkNode): Positions => Object.fromEntries((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
    const engine = await elk();

    let positions: Positions;
    if (arrangement === 'snowflake') {
        const stress = placed(await engine.layout({ id: 'root', layoutOptions: { 'elk.algorithm': 'stress', 'elk.stress.desiredEdgeLength': '380' }, children, edges }));
        positions = placed(
            await engine.layout({
                id: 'root',
                layoutOptions: { 'elk.algorithm': 'sporeOverlap', 'elk.spacing.nodeNode': '48' },
                children: children.map((c) => ({ ...c, x: stress[c.id]?.x ?? 0, y: stress[c.id]?.y ?? 0 })),
                edges,
            }),
        );
    } else if (arrangement === 'compact') {
        positions = placed(
            await engine.layout({
                id: 'root',
                layoutOptions: { 'elk.algorithm': 'rectpacking', 'elk.aspectRatio': String(aspect), 'elk.spacing.nodeNode': '48' },
                children: [...children].sort((a, b) => a.id.localeCompare(b.id)),
                edges: [],
            }),
        );
    } else {
        positions = placed(
            await engine.layout({
                id: 'root',
                layoutOptions: {
                    'elk.algorithm': 'layered',
                    'elk.direction': 'RIGHT',
                    'elk.layered.spacing.nodeNodeBetweenLayers': String(GAP),
                    'elk.spacing.nodeNode': '48',
                    'elk.spacing.componentComponent': '90',
                    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
                    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
                },
                children,
                edges,
            }),
        );
        if (ids.length > LARGE || (ids.length >= PACKABLE && tallerThanWide(positions, heights))) {
            positions = packColumns(positions, heights, aspect);
        }
    }

    cache.set(key, positions);
    if (cache.size > KEEP) {
        cache.delete(cache.keys().next().value as string);
    }
    return positions;
}

function tallerThanWide(positions: Positions, heights: Record<string, number>): boolean {
    const boxes = Object.entries(positions);
    const width = Math.max(...boxes.map(([, p]) => p.x)) - Math.min(...boxes.map(([, p]) => p.x)) + CARD_WIDTH;
    const height = Math.max(...boxes.map(([id, p]) => p.y + (heights[id] ?? 120))) - Math.min(...boxes.map(([, p]) => p.y));
    return height > width;
}

// A layered layout of a large schema puts dozens of tables in the column beside a table most others point at, and the
// diagram becomes one tall strip. Packed columns keep the layered order but fill evenly sized columns until the diagram
// is about a screen's shape.
function packColumns(layered: Positions, heights: Record<string, number>, aspect: number): Positions {
    const order = Object.entries(layered)
        .sort(([, a], [, b]) => a.x - b.x || a.y - b.y)
        .map(([id]) => id);
    const heightOf = (id: string) => (heights[id] ?? 120) + STACK_GAP;
    const total = order.reduce((sum, id) => sum + heightOf(id), 0);
    const step = CARD_WIDTH + GAP;
    const columns = Math.max(1, Math.round(Math.sqrt((aspect * total) / step)));
    const target = total / columns;

    const positions: Positions = {};
    let column = 0;
    let y = 0;
    for (const id of order) {
        if (y > 0 && y + heightOf(id) / 2 > target && column < columns - 1) {
            column++;
            y = 0;
        }
        positions[id] = { x: column * step, y };
        y += heightOf(id);
    }
    return positions;
}

export type Region = { connection: string; x: number; y: number; width: number; height: number };

// Room around a connection's tables, its label above them, and the space between two connections.
const REGION_PAD = 48;
const REGION_HEAD = 64;
const REGION_GAP = 160;

// The frame around a connection's cards wherever they are, with room for its label: frames follow dragged tables.
const REGION_LABEL = 240;
export function frameAround(connection: string, boxes: { x: number; y: number; height: number }[]): Region {
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + CARD_WIDTH));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    return { connection, x: minX - REGION_PAD, y: minY - REGION_HEAD - REGION_PAD, width: Math.max(REGION_LABEL, maxX - minX + REGION_PAD * 2), height: maxY - minY + REGION_HEAD + REGION_PAD * 2 };
}

// With every connection on the diagram, each connection is laid out on its own and framed in a labelled region, so
// tables of the same name in two connections never mix. The regions are packed in rows, left to right, wrapping so the
// diagram stays near the screen's shape. Adapted from Laranex Laravel Schema Viewer (MIT), ui/src/layout.ts.
export function packRegions(blocks: { connection: string; positions: Positions }[], heights: Record<string, number>, aspect: number): { positions: Positions; regions: Region[] } {
    const framed = blocks
        .map(({ connection, positions }) => {
            const boxes = Object.entries(positions);
            if (!boxes.length) {
                return null;
            }
            const minX = Math.min(...boxes.map(([, p]) => p.x));
            const minY = Math.min(...boxes.map(([, p]) => p.y));
            const placed: Positions = Object.fromEntries(boxes.map(([id, p]) => [id, { x: p.x - minX + REGION_PAD, y: p.y - minY + REGION_HEAD + REGION_PAD }]));
            return {
                connection,
                placed,
                width: Math.max(...boxes.map(([, p]) => p.x + CARD_WIDTH)) - minX + REGION_PAD * 2,
                height: Math.max(...boxes.map(([id, p]) => p.y + (heights[id] ?? 120))) - minY + REGION_HEAD + REGION_PAD * 2,
            };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
    const area = framed.reduce((sum, b) => sum + b.width * b.height, 0);
    const rowLimit = Math.max(...framed.map((b) => b.width), Math.sqrt(area) * (aspect >= 1 ? 1.7 : 0.6));
    const positions: Positions = {};
    const regions: Region[] = [];
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    for (const block of framed) {
        if (x > 0 && x + block.width > rowLimit) {
            x = 0;
            y += rowHeight + REGION_GAP;
            rowHeight = 0;
        }
        for (const [id, p] of Object.entries(block.placed)) {
            positions[id] = { x: p.x + x, y: p.y + y };
        }
        regions.push({ connection: block.connection, x, y, width: block.width, height: block.height });
        x += block.width + REGION_GAP;
        rowHeight = Math.max(rowHeight, block.height);
    }
    return { positions, regions };
}
