import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import type { EdgeKind } from './graph';
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
    // The referencing end can repeat: a crow's foot there, else a single bar.
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
    const className = ['edge', `edge--${data.kind}`, data.declaredOnly ? 'declared-only' : '', data.polymorphic ? 'polymorphic' : '', data.crossConnection ? 'cross-connection' : '', data.inferred ? 'inferred' : '', data.state === 'none' ? '' : data.state].filter(Boolean).join(' ');
    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                className={className}
                markerStart={data.kind === 'through' ? undefined : `url(#lsv-${data.many ? 'many' : 'one'}-${colorOf(data)})`}
                markerEnd={data.kind === 'through' ? 'url(#lsv-arrow-through)' : `url(#lsv-parent-${colorOf(data)})`}
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

// Cardinality ends from Laranex Laravel Schema Viewer (MIT, ui/src/components/LinkEdge.tsx): a crow's foot where a key
// can repeat, a bar where it cannot, a double bar at the referenced table, and an arrow for a relationship through other
// tables. One set per line color.
export function EdgeMarkers() {
    return (
        <svg className="edge-markers" aria-hidden="true">
            <defs>
                {COLORS.map((color) => (
                    <g key={color}>
                        <marker id={`lsv-many-${color}`} viewBox="0 0 14 14" refX="1" refY="7" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                            <path d="M13 7 L1 1 M13 7 L1 7 M13 7 L1 13" className={`marker-stroke ${color}`} fill="none" />
                        </marker>
                        <marker id={`lsv-one-${color}`} viewBox="0 0 14 14" refX="1" refY="7" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                            <path d="M5 1 L5 13" className={`marker-stroke ${color}`} fill="none" />
                        </marker>
                        <marker id={`lsv-parent-${color}`} viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto">
                            <path d="M9 1 L9 13 M5 1 L5 13" className={`marker-stroke ${color}`} fill="none" />
                        </marker>
                    </g>
                ))}
                <marker id="lsv-arrow-through" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M0 0 L10 5 L0 10 z" className="marker orm" />
                </marker>
            </defs>
        </svg>
    );
}
