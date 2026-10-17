import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { Table } from '../contract/types';
import { columnMarks, isNote, NOTE, tableLabel } from './graph';

export type TableNodeData = {
    table: Table;
    connection: string;
    rows: string[];
    state: 'selected' | 'related' | 'none';
    // One of several tables picked together.
    picked: boolean;
    // How many diagnostics are about the table, for the header badge.
    issues: number;
    // A combined document, where an entity only the ORM declares is not in the database.
    combined: boolean;
    onSelect: (id: string) => void;
    onFocus: (id: string) => void;
};

export type TableNodeType = Node<TableNodeData, 'table'>;

const only = (provenance: string[], source: string) => provenance.length === 1 && provenance[0] === source;

// One table card. Edges are drawn from routes computed outside the card, so its handles only satisfy React Flow.
function TableNode({ data }: NodeProps<TableNodeType>) {
    const { table, connection, rows, state, picked, issues, combined, onSelect, onFocus } = data;
    const byName = new Map(table.columns.map((c) => [c.name, c]));
    const marks = columnMarks(table);
    const hidden = table.columns.length - rows.filter((r) => !isNote(r)).length;
    const declaredOnly = (provenance: string[]) => combined && only(provenance, 'declared');
    const classes = ['table-card', state === 'none' ? '' : state, picked ? 'picked' : '', declaredOnly(table.provenance) ? 'declared-only' : '', table.drift?.length ? 'drift' : ''].filter(Boolean).join(' ');
    return (
        <article className={classes} data-table-id={table.id} data-provenance={table.provenance.join(' ')} onDoubleClick={() => onFocus(table.id)}>
            <Handle type="target" position={Position.Left} className="table-handle" isConnectable={false} />
            <Handle type="source" position={Position.Right} className="table-handle" isConnectable={false} />
            <div className="table-title">
                <button type="button" onClick={() => onSelect(table.id)} title={tableLabel(table)}>
                    {tableLabel(table)}
                    <small>
                        {connection}
                        {table.owner.kind !== 'application' ? ` · ${table.owner.package ?? table.owner.kind}` : ''}
                    </small>
                </button>
                {issues > 0 && (
                    <span className="tag issues" title={`${issues} diagnostics`}>
                        !{issues}
                    </span>
                )}
                <span className="tag" title={`${table.columns.length} columns`}>
                    {table.columns.length}
                </span>
            </div>
            {rows.map((name) => {
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
                const flags = [column.drift?.length ? 'drift' : '', declaredOnly(column.provenance) ? 'declared-only' : ''].filter(Boolean);
                return (
                    <div
                        className={`column${flags.length ? ` ${flags.join(' ')}` : ''}`}
                        data-column={name}
                        key={name}
                        title={`${name}: ${column.type}${column.nullable ? ' · nullable' : ' · required'}${column.drift?.length ? ' · differs from the model' : ''}${flags.includes('declared-only') ? ' · declared only, not in the database' : ''}`}
                    >
                        <span className={`key${mark === 'PK' ? ' pk' : ''}`}>{mark ?? ''}</span>
                        <span className="column-name">{name}</span>
                        <span className="type">{column.type}</span>
                    </div>
                );
            })}
            {hidden > 0 && rows.length > 0 && <div className="table-more">+ {hidden} columns · enable All columns to expand</div>}
        </article>
    );
}

export const TableNodeView = memo(TableNode);
