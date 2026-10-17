import { Handle, Position, useStore, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { Table } from '../contract/types';
import { columnMarks, isNote, NOTE, tableLabel } from './graph';
import { Icon } from './ui';

export type TableNodeData = {
    table: Table;
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
    const { table, subtitle, rows, state, picked, issues, combined, pivot, collapsed, highlighted, onSelect, onFocus, onToggle } = data;
    const picture = useStore(zoomedOut);
    const byName = new Map(table.columns.map((c) => [c.name, c]));
    const marks = columnMarks(table);
    const hidden = table.columns.length - rows.filter((r) => !isNote(r)).length;
    const declaredOnly = (provenance: string[]) => combined && only(provenance, 'declared');
    const classes = ['table-card', state === 'none' ? '' : state, picked ? 'picked' : '', pivot ? 'pivot' : '', declaredOnly(table.provenance) ? 'declared-only' : '', table.drift?.length ? 'drift' : '']
        .filter(Boolean)
        .join(' ');
    return (
        <article className={classes} data-table-id={table.id} data-provenance={table.provenance.join(' ')} onDoubleClick={() => onFocus(table.id)}>
            <Handle type="target" position={Position.Left} className="table-handle" isConnectable={false} />
            <Handle type="source" position={Position.Right} className="table-handle" isConnectable={false} />
            <div className="table-title">
                <button type="button" onClick={(event) => !event.shiftKey && onSelect(table.id)} title={tableLabel(table)}>
                    {tableLabel(table)}
                    <small>
                        {subtitle || ' '}
                        {pivot && <span className="pill-tag">PIVOT</span>}
                    </small>
                </button>
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
                    const flags = [column.drift?.length ? 'drift' : '', declaredOnly(column.provenance) ? 'declared-only' : '', highlighted.has(name) ? 'highlighted' : ''].filter(Boolean);
                    return (
                        <div
                            className={`column${flags.length ? ` ${flags.join(' ')}` : ''}`}
                            data-column={name}
                            key={name}
                            title={`${name}: ${column.type}${column.nullable ? ' · nullable' : ' · required'}${column.drift?.length ? ' · differs from the model' : ''}${flags.includes('declared-only') ? ' · declared only, not in the database' : ''}`}
                        >
                            <span className={`key${mark === 'PK' ? ' pk' : ''}`}>{mark ?? ''}</span>
                            <span className="column-name">
                                {name}
                                {column.nullable && <span className="nullable">?</span>}
                            </span>
                            <span className="type">{column.typeName ?? column.type}</span>
                        </div>
                    );
                })}
            {hidden > 0 && rows.length > 0 && !picture && <div className="table-more">+ {hidden} more columns</div>}
            {hidden > 0 && rows.length > 0 && picture && <div className="table-more" aria-hidden="true" />}
        </article>
    );
}

export const TableNodeView = memo(TableNode);
