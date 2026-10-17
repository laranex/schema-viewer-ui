import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { END_SHAPES, lineEnds, type EdgeKind, type LineEnd } from './graph';
import { LABEL_WIDTH, orthogonal, type Route } from './routing';

export type SchemaEdgeData = {
    kind: EdgeKind;
    declaredOnly: boolean;
    polymorphic: boolean;
    crossConnection: boolean;
    // The foreign key an inferred association rests on: annotated, never drawn twice.
    inferred: boolean;
    label: string;
    chip: string;
    route: Route | null;
    showLabel: boolean;
    state: 'selected' | 'related' | 'none';
    // The referencing end can repeat: a crow's foot there, else a single bar (graph.ts lineEnds).
    many: boolean;
};

export type SchemaEdgeType = Edge<SchemaEdgeData, 'schema'>;

// Each line's markers take its color: grey foreign keys, accented relationships, FK + relationship, declared-only and
// inferred keys.
const COLORS = ['fk', 'both', 'orm', 'declared', 'inferred'] as const;
type MarkerColor = (typeof COLORS)[number];
const colorOf = (d: SchemaEdgeData): MarkerColor => (d.inferred ? 'inferred' : d.declaredOnly ? 'declared' : d.kind === 'both' ? 'both' : d.kind === 'foreign_key' ? 'fk' : 'orm');

// A link between tables: a foreign-key constraint (solid), an ORM relationship without one (dashed), both (solid,
// accented), or a relationship through intermediate tables (dotted). While a card it ends on is dragged its route is
// stale, so it runs between the cards' sides instead.
function SchemaEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<SchemaEdgeType>) {
    if (!data) {
        return null;
    }
    const route = data.route ?? { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY, channelX: (sourceX + targetX) / 2, labelX: (sourceX + targetX) / 2, labelY: (sourceY + targetY) / 2 };
    const path = orthogonal(route.sx, route.sy, route.channelX, route.tx, route.ty);
    const ends = lineEnds(data);
    const className = ['edge', `edge--${data.kind}`, data.declaredOnly ? 'declared-only' : '', data.polymorphic ? 'polymorphic' : '', data.crossConnection ? 'cross-connection' : '', data.inferred ? 'inferred' : '', data.state === 'none' ? '' : data.state].filter(Boolean).join(' ');
    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                className={className}
                markerStart={ends.start ? `url(#lsv-${ends.start}-${colorOf(data)})` : undefined}
                markerEnd={ends.end === 'arrow' ? 'url(#lsv-arrow-through)' : `url(#lsv-${ends.end}-${colorOf(data)})`}
                interactionWidth={16}
            />
            {data.showLabel && (
                <EdgeLabelRenderer>
                    <div
                        className={`edge-label edge-label--${data.kind}${data.inferred ? ' edge-label--inferred' : ''}`}
                        style={{ maxWidth: LABEL_WIDTH, transform: `translate(-50%, -50%) translate(${route.labelX}px, ${route.labelY}px)` }}
                    >
                        <span className="edge-label__text">{data.label}</span>
                        <span className="edge-label__chip">{data.crossConnection ? `${data.chip} · cross-connection` : data.chip}</span>
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

export const SchemaEdgeView = memo(SchemaEdge);

// A line end's path in marker units, from graph.ts's END_SHAPES: x grows along the line's direction, so a start mark
// (the referencing table) points its distance outwards and an end mark (the referenced table) inwards; 0 is the card.
const pathOf = (end: LineEnd, sign: 1 | -1) => END_SHAPES[end].map((points) => `M${points.map(([out, across]) => `${sign * out} ${across}`).join(' L')}`).join(' ') + (end === 'arrow' ? ' z' : '');

// Cardinality ends from Laranex Laravel Schema Viewer (MIT, ui/src/components/LinkEdge.tsx): a crow's foot where a key
// can repeat, a bar where it cannot, a double bar at the referenced table, and an arrow for a relationship through other
// tables. One set per line color; images draw the same shapes.
export function EdgeMarkers() {
    return (
        <svg className="edge-markers" aria-hidden="true">
            <defs>
                {COLORS.map((color) => (
                    <g key={color}>
                        {(['many', 'one'] as const).map((end) => (
                            <marker key={end} id={`lsv-${end}-${color}`} viewBox="-2 -8 16 16" refX="0" refY="0" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto">
                                <path d={pathOf(end, 1)} className={`marker-stroke ${color}`} fill="none" />
                            </marker>
                        ))}
                        <marker id={`lsv-parent-${color}`} viewBox="-14 -8 16 16" refX="0" refY="0" markerWidth="16" markerHeight="16" markerUnits="userSpaceOnUse" orient="auto">
                            <path d={pathOf('parent', -1)} className={`marker-stroke ${color}`} fill="none" />
                        </marker>
                    </g>
                ))}
                <marker id="lsv-arrow-through" viewBox="-12 -7 14 14" refX="0" refY="0" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto">
                    <path d={pathOf('arrow', -1)} className="marker orm" />
                </marker>
            </defs>
        </svg>
    );
}
