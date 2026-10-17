import { useMemo, useState } from 'react';
import type { Model, SchemaDocument, Table } from '../contract/types';
import { relationshipsOf, type GraphEdge, type Lookup } from './graph';

// The Browse tab, after Laravel Schema Viewer's: every table with its models, every relationship, or every column,
// filtered by a box of its own. Choosing a row opens it in Details and on the diagram.

export type BrowseMode = 'tables' | 'relationships' | 'columns';
const MODES: { value: BrowseMode; label: string }[] = [
    { value: 'tables', label: 'Tables & Models' },
    { value: 'relationships', label: 'Relationships' },
    { value: 'columns', label: 'Columns' },
];

const shortClass = (name: string) => name.split(/[\\.]/).pop() ?? name;

export function modelsOf(doc: SchemaDocument, tableId: string): Model[] {
    return doc.models.filter((m) => m.tables.includes(tableId));
}

export function tableSubtitle(doc: SchemaDocument, table: Table): string {
    const models = modelsOf(doc, table.id).map((m) => shortClass(m.className));
    if (models.length) {
        return models.join(', ');
    }
    return table.owner.kind === 'framework' ? 'framework table' : table.owner.kind === 'package' ? (table.owner.package ?? 'package table') : doc.source === 'database' ? '' : 'no model';
}

type Props = {
    doc: SchemaDocument;
    lookup: Lookup;
    tables: { table: Table; connection: { id: string; name: string } }[];
    edges: GraphEdge[];
    issues: Map<string, number>;
    selected: string | null;
    several: boolean;
    onTable: (id: string) => void;
    onEdge: (edge: GraphEdge) => void;
    onColumn: (table: string, column: string) => void;
};

export function Browse({ doc, lookup, tables, edges, issues, selected, several, onTable, onEdge, onColumn }: Props) {
    const [mode, setMode] = useState<BrowseMode>('tables');
    const [filter, setFilter] = useState('');
    const q = filter.trim().toLocaleLowerCase();
    const hit = (...texts: string[]) => !q || texts.some((t) => t.toLocaleLowerCase().includes(q));

    const rows = useMemo(() => {
        if (mode === 'tables') {
            return tables
                .filter(({ table }) => hit(lookup.label(table.id), ...modelsOf(doc, table.id).map((m) => m.className)))
                .map(({ table, connection }) => ({
                    key: table.id,
                    title: lookup.label(table.id),
                    subtitle: tableSubtitle(doc, table),
                    meta: `${table.columns.length} col${relationshipsOf(doc, table.id).length ? ` · ${relationshipsOf(doc, table.id).length} rel` : ''}`,
                    group: connection.name,
                    issues: issues.get(table.id) ?? 0,
                    selected: selected === table.id,
                    open: () => onTable(table.id),
                }));
        }
        if (mode === 'relationships') {
            return doc.relationships
                .filter((r) => hit(r.name, r.type, lookup.models.get(r.model)?.className ?? '', lookup.label(r.table), r.relatedTable ? lookup.label(r.relatedTable) : ''))
                .map((r) => {
                    const edge = edges.find((e) => e.link?.relationships.includes(r.id) || e.derived?.relationship === r.id);
                    const target = r.relatedTable && lookup.tables.has(r.relatedTable) ? r.relatedTable : undefined;
                    return {
                        key: r.id,
                        title: `${shortClass(lookup.models.get(r.model)?.className ?? r.model)}.${r.name}`,
                        subtitle: `${r.type} → ${target ? lookup.label(target) : 'no single target'}`,
                        meta: r.cardinality,
                        group: lookup.label(r.table),
                        issues: 0,
                        selected: false,
                        open: () => (edge ? onEdge(edge) : onTable(r.table)),
                    };
                });
        }
        return tables.flatMap(({ table, connection }) =>
            table.columns
                .filter((c) => hit(c.name, lookup.label(table.id), c.type))
                .map((c) => ({
                    key: `${table.id}.${c.name}`,
                    title: c.name,
                    subtitle: `${lookup.label(table.id)} · ${c.type}${c.nullable ? ' · nullable' : ''}`,
                    meta: table.primaryKey.includes(c.name) ? 'PK' : table.foreignKeys.some((f) => f.columns.includes(c.name)) ? 'FK' : '',
                    group: connection.name,
                    issues: 0,
                    selected: false,
                    open: () => onColumn(table.id, c.name),
                })),
        );
    }, [mode, q, tables, doc, lookup, edges, issues, selected]);

    const noun = mode === 'tables' ? 'tables' : mode === 'relationships' ? 'relationships' : 'columns';
    return (
        <div className="browse">
            <div className="segmented" role="radiogroup" aria-label="Browse">
                {MODES.map((m) => (
                    <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} onClick={() => setMode(m.value)}>
                        {m.label}
                    </button>
                ))}
            </div>
            <label className="filter">
                <span className="sr-only">Filter {noun}</span>
                <input type="search" placeholder={`Filter ${rows.length} ${noun}`} value={filter} onChange={(e) => setFilter(e.target.value)} autoComplete="off" spellCheck={false} />
            </label>
            {rows.length === 0 && <p className="muted empty-note">Nothing matches.</p>}
            <ul className="browse__rows">
                {rows.map((r, i) => (
                    <li key={r.key}>
                        {several && (i === 0 || rows[i - 1].group !== r.group) && <div className="browse__group">{r.group}</div>}
                        <button type="button" className={`browse__row${r.selected ? ' selected' : ''}`} onClick={r.open}>
                            <span className="browse__title">
                                {r.title}
                                {r.subtitle && <small>{r.subtitle}</small>}
                            </span>
                            <span className="browse__meta">
                                {r.meta}
                                {r.issues > 0 && <span className="issue-count" title={`${r.issues} diagnostics`}>{r.issues}</span>}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
