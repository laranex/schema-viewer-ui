import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import type { EdgeKind } from './graph';
import { LABEL_WIDTH, orthogonal, type Route } from './routing';

export type SchemaEdgeData = {
    kind: EdgeKind;
    declaredOnly: boolean;
    polymorphic: boolean;
    crossConnection: boolean;
    label: string;
    chip: string;
    route: Route | null;
    showLabel: boolean;
    state: 'selected' | 'related' | 'none';
};

export type SchemaEdgeType = Edge<SchemaEdgeData, 'schema'>;

const MARKER: Record<EdgeKind, string> = { both: 'fk', foreign_key: 'fk', relationship: 'orm', through: 'orm' };

// A link between tables: a foreign-key constraint (solid), an ORM relationship without one (dashed), both (solid,
// accented), or a relationship through intermediate tables (dotted). While a card it ends on is dragged its route is
// stale, so it runs between the cards' sides instead.
function SchemaEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<SchemaEdgeType>) {
    if (!data) {
        return null;
    }
    const route = data.route ?? { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY, channelX: (sourceX + targetX) / 2, labelX: (sourceX + targetX) / 2, labelY: (sourceY + targetY) / 2 };
    const path = orthogonal(route.sx, route.sy, route.channelX, route.tx, route.ty);
    const className = ['edge', `edge--${data.kind}`, data.declaredOnly ? 'declared-only' : '', data.polymorphic ? 'polymorphic' : '', data.crossConnection ? 'cross-connection' : '', data.state === 'none' ? '' : data.state].filter(Boolean).join(' ');
    return (
        <>
            <BaseEdge id={id} path={path} className={className} markerEnd={`url(#lsv-arrow-${MARKER[data.kind]})`} interactionWidth={16} />
            {data.showLabel && (
                <EdgeLabelRenderer>
                    <div
                        className={`edge-label edge-label--${data.kind}`}
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

export function EdgeMarkers() {
    return (
        <svg className="edge-markers" aria-hidden="true">
            <defs>
                {['fk', 'orm'].map((kind) => (
                    <marker key={kind} id={`lsv-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" className={`marker ${kind}`} />
                    </marker>
                ))}
            </defs>
        </svg>
    );
}
