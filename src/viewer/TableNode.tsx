import { Handle, Position, useStore, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { Table } from '../contract/types';
import { columnMarks, isNote, NOTE, tableLabel } from './graph';
import { CHANGE_TEXT, markSummary, valueText, type TableMark } from './intelligence';
import { Icon } from './ui';

export type TableNodeData = {
    table: Table;
    // The connection's name when the document has several, shown before the table's name.
    connection: string | null;
    // Model names, or what the table is when it has none.
    subtitle: string;
    rows: string[];
    state: 'selected' | 'related' | 'none';
    // One of several tables picked together.
    picked: boolean;
    // How many diagnostics are about the table, for the header badge.
    issues: number;
    // A combined document, where an entity only the ORM declares is not in the database.
    combined: boolean;
    pivot: boolean;
    collapsed: boolean;
    // Columns on the selected table's links, highlighted.
    highlighted: Set<string>;
    // The table's part in the comparison marked on the diagram, if any.
    mark: TableMark | null;
    onSelect: (id: string) => void;
    onFocus: (id: string) => void;
    onToggle: (id: string) => void;
};

export type TableNodeType = Node<TableNodeData, 'table'>;

const only = (provenance: string[], source: string) => provenance.length === 1 && provenance[0] === source;

// At this zoom and below a card draws placeholder bars instead of its rows: text that small cannot be read, and
// large schemas stay responsive. Laranex Laravel Schema Viewer does the same at 40%.
export const PICTURE_ZOOM = 0.4;
const zoomedOut = (s: { transform: [number, number, number] }) => s.transform[2] <= PICTURE_ZOOM;

// One table card. A Shift-click is left to React Flow, which adds the table to the selection. Edges are drawn from routes computed outside the card, so its handles only satisfy React Flow.
function TableNode({ data }: NodeProps<TableNodeType>) {
    const { table, connection, subtitle, rows, state, picked, issues, combined, pivot, collapsed, highlighted, mark: compared, onSelect, onFocus, onToggle } = data;
    const summary = compared ? markSummary(compared) : null;
    const allLikely = !!compared && compared.likely === compared.differences.length;
    const picture = useStore(zoomedOut);
    const byName = new Map(table.columns.map((c) => [c.name, c]));
    const marks = columnMarks(table);
    const hidden = table.columns.length - rows.filter((r) => !isNote(r)).length;
    const declaredOnly = (provenance: string[]) => combined && only(provenance, 'declared');
    const classes = ['table-card', state === 'none' ? '' : state, picked ? 'picked' : '', pivot ? 'pivot' : '', declaredOnly(table.provenance) ? 'declared-only' : '', table.drift?.length ? 'drift' : '', summary ? `cmp cmp--${summary.change}` : '']
        .filter(Boolean)
        .join(' ');
    return (
        <article className={classes} data-table-id={table.id} data-provenance={table.provenance.join(' ')} onDoubleClick={() => onFocus(table.id)}>
            <Handle type="target" position={Position.Left} className="table-handle" isConnectable={false} />
            <Handle type="source" position={Position.Right} className="table-handle" isConnectable={false} />
            <div className="table-title">
                <button type="button" onClick={(event) => !event.shiftKey && onSelect(table.id)} title={connection ? `${connection} · ${tableLabel(table)}` : tableLabel(table)}>
                    {connection && <span className="table-connection">{connection} · </span>}
                    {tableLabel(table)}
                    <small>
                        {subtitle || ' '}
                        {pivot && <span className="pill-tag">PIVOT</span>}
                    </small>
                </button>
                {summary && (
                    <span className={`cmp-chip cmp-chip--${summary.change}${allLikely ? ' cmp-chip--likely' : ''}`} title={summary.title}>
                        {CHANGE_TEXT[summary.change].symbol} {summary.short}
                        <span className="sr-only">{summary.rest}</span>
                        {allLikely ? ' likely' : ''}
                    </span>
                )}
                {issues > 0 && (
                    <span className="issue-count" title={`${issues} diagnostics`}>
                        {issues}
                    </span>
                )}
                <button type="button" className="collapse nodrag" aria-label={collapsed ? `Show the columns of ${table.name}` : `Fold ${table.name}`} aria-expanded={!collapsed} onClick={() => onToggle(table.id)}>
                    <Icon name="chevron" size={14} />
                </button>
            </div>
            {picture &&
                rows.map((name) => (
                    <div className={`column placeholder${isNote(name) ? ' note' : ''}`} key={name} aria-hidden="true">
                        <span className="bar" style={{ width: `${35 + ((name.length * 7) % 45)}%` }} />
                    </div>
                ))}
            {!picture &&
                rows.map((name) => {
                    if (isNote(name)) {
                        const text = name === NOTE ? table.note : byName.get(name.slice(NOTE.length))?.note;
                        return (
                            <div className="note-row" key={name} title={text ?? ''}>
                                {text}
                            </div>
                        );
                    }
                    const column = byName.get(name);
                    if (!column) {
                        return null;
                    }
                    const mark = marks.get(name);
                    const difference = compared?.columns.get(name);
                    const flags = [
                        column.drift?.length ? 'drift' : '',
                        declaredOnly(column.provenance) ? 'declared-only' : '',
                        highlighted.has(name) ? 'highlighted' : '',
                        difference ? `cmp-column cmp-column--${difference.change}${difference.certainty === 'likely' ? ' cmp-column--likely' : ''}` : '',
                    ].filter(Boolean);
                    const comparedText = difference
                        ? ` · ${CHANGE_TEXT[difference.change].label} against the ${compared?.side === 'baseline' ? 'target' : 'baseline'}${difference.fields.length ? `: ${difference.fields.map((f) => `${f.field} ${valueText(f.baseline)} → ${valueText(f.target)}`).join('; ')}` : ''}${difference.certainty === 'likely' ? ' (likely)' : ''}`
                        : '';
                    return (
                        <div
                            className={`column${flags.length ? ` ${flags.join(' ')}` : ''}`}
                            data-column={name}
                            key={name}
                            title={`${name}: ${column.type}${column.nullable ? ' · nullable' : ' · required'}${column.drift?.length ? ' · differs from the model' : ''}${flags.includes('declared-only') ? ' · declared only, not in the database' : ''}${comparedText}`}
                        >
                            <span className={`key${mark === 'PK' ? ' pk' : ''}`}>{mark ?? ''}</span>
                            <span className="column-name">
                                {name}
                                {column.nullable && <span className="nullable">?</span>}
                            </span>
                            <span className="type">{column.typeName ?? column.type}</span>
                            {difference && (
                                <span className={`cmp-mark cmp-mark--${difference.change}${difference.certainty === 'likely' ? ' cmp-mark--likely' : ''}`}>
                                    {CHANGE_TEXT[difference.change].symbol}
                                    <span className="sr-only"> {CHANGE_TEXT[difference.change].label}</span>
                                </span>
                            )}
                        </div>
                    );
                })}
            {hidden > 0 && rows.length > 0 && !picture && <div className="table-more">+ {hidden} more columns</div>}
            {hidden > 0 && rows.length > 0 && picture && <div className="table-more" aria-hidden="true" />}
        </article>
    );
}

export const TableNodeView = memo(TableNode);

// Card geometry of a table from another connection, drawn while one connection is shown.
export const EXTERNAL_HEIGHT = 76;

export type ExternalNodeData = { tableId: string; table: Table; connection: string; driver: string | null; state: 'related' | 'none'; onOpen: (id: string) => void };
export type ExternalNodeType = Node<ExternalNodeData, 'external'>;

// A table on a connection out of view that a relationship in view points at: a reference, not a card. It cannot be
// edited, folded or dragged; opening it shows its own connection with the table selected.
function ExternalNode({ data }: NodeProps<ExternalNodeType>) {
    const { tableId, table, connection, driver, state, onOpen } = data;
    return (
        <div className={`external-node${state === 'related' ? ' related' : ''}`} data-table-id={tableId} data-external="true">
            <Handle type="target" position={Position.Left} className="table-handle" isConnectable={false} />
            <Handle type="source" position={Position.Right} className="table-handle" isConnectable={false} />
            <button type="button" className="nodrag" onClick={() => onOpen(tableId)} title={`Open ${tableLabel(table)} on connection ${connection}`}>
                <span className="external-node__label">On connection {connection}{driver ? ` · ${driver}` : ''}</span>
                <span className="external-node__name">{tableLabel(table)}</span>
                <span className="external-node__hint">Open in its connection</span>
            </button>
        </div>
    );
}

export const ExternalNodeView = memo(ExternalNode);

export type RegionNodeData = { connection: string; driver: string | null; tables: number; diagnostics: number };

// "postgresql · 12 tables · 3 diagnostics", on a frame and in images, as Laravel Schema Viewer shows hints.
export const frameMeta = (driver: string | null, tables: number, diagnostics: number) =>
    `${driver ?? 'unknown driver'} · ${tables} ${tables === 1 ? 'table' : 'tables'}${diagnostics ? ` · ${diagnostics} ${diagnostics === 1 ? 'diagnostic' : 'diagnostics'}` : ''}`;
export type RegionNodeType = Node<RegionNodeData, 'region'>;

// The frame around one connection's tables while every connection is on the diagram, after Laravel Schema Viewer's.
function RegionNode({ data }: NodeProps<RegionNodeType>) {
    return (
        <div className="region-node" data-connection={data.connection}>
            <span className="region-node__label">
                <span className="region-node__name">{data.connection}</span>
                <span className="region-node__meta">{frameMeta(data.driver, data.tables, data.diagnostics)}</span>
            </span>
        </div>
    );
}

export const RegionNodeView = memo(RegionNode);
