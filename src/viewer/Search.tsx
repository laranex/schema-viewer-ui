import { forwardRef, useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { SchemaDocument } from '../contract/types';
import type { Lookup } from './graph';
import { Icon } from './ui';

// The header search: tables, columns, models and relationships across every connection. Choosing a result opens it;
// the diagram itself is not filtered, so it keeps its shape.

export type SearchResult =
    | { kind: 'table'; id: string; label: string; detail: string }
    | { kind: 'column'; id: string; column: string; label: string; detail: string }
    | { kind: 'model'; id: string; table: string | null; label: string; detail: string }
    | { kind: 'relationship'; id: string; table: string; label: string; detail: string };

const LIMIT = 40;

export function searchSchema(doc: SchemaDocument, lookup: Lookup, query: string): SearchResult[] {
    const q = query.trim().toLocaleLowerCase();
    if (!q) {
        return [];
    }
    const out: SearchResult[] = [];
    const hit = (text: string) => text.toLocaleLowerCase().includes(q);
    for (const c of doc.connections) {
        for (const t of c.tables) {
            if (hit(lookup.label(t.id)) || hit(t.note ?? '') || hit(t.comment ?? '')) {
                out.push({ kind: 'table', id: t.id, label: lookup.label(t.id), detail: `${c.name}${c.driver ? ` (${c.driver})` : ''} · ${t.columns.length} columns` });
            }
        }
    }
    for (const c of doc.connections) {
        for (const t of c.tables) {
            for (const col of t.columns) {
                if (hit(col.name)) {
                    out.push({ kind: 'column', id: t.id, column: col.name, label: `${lookup.label(t.id)}.${col.name}`, detail: col.type });
                }
            }
        }
    }
    for (const m of doc.models) {
        if (hit(m.className)) {
            const table = m.tables[0] ?? null;
            out.push({ kind: 'model', id: m.id, table, label: m.className, detail: table ? m.tables.map((id) => lookup.label(id)).join(', ') : 'no table' });
        }
    }
    for (const r of doc.relationships) {
        if (hit(r.name) || hit(r.type)) {
            const model = lookup.models.get(r.model);
            out.push({ kind: 'relationship', id: r.id, table: r.table, label: `${model?.className.split(/[\\.]/).pop() ?? r.model}.${r.name}`, detail: `${r.type} · ${r.cardinality} · ${lookup.label(r.table)}${r.relatedTable ? ` → ${lookup.label(r.relatedTable)}` : ''}` });
        }
    }
    return out.slice(0, LIMIT);
}

const KIND_LABEL: Record<SearchResult['kind'], string> = { table: 'Table', column: 'Column', model: 'Model', relationship: 'Relationship' };

export const SearchBox = forwardRef<HTMLInputElement, { doc: SchemaDocument; lookup: Lookup; onPick: (result: SearchResult) => void; placeholder?: string }>(function SearchBox(
    { doc, lookup, onPick, placeholder = 'Search tables, columns, models, relationships' },
    ref,
) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const results = useMemo(() => searchSchema(doc, lookup, query), [doc, lookup, query]);
    const id = useId();

    const pick = (r: SearchResult) => {
        onPick(r);
        setOpen(false);
        setQuery('');
    };
    const keys = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((a) => (results.length ? (a + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0));
        } else if (event.key === 'Enter' && results[active]) {
            event.preventDefault();
            pick(results[active]);
        } else if (event.key === 'Escape') {
            if (query) {
                event.stopPropagation();
                setQuery('');
            }
            setOpen(false);
        }
    };

    return (
        <div className="search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
            <Icon name="search" />
            <input
                ref={ref}
                type="search"
                role="combobox"
                aria-label="Search the schema"
                aria-expanded={open && results.length > 0}
                aria-controls={`${id}-results`}
                aria-activedescendant={open && results[active] ? `${id}-${active}` : undefined}
                aria-autocomplete="list"
                placeholder={placeholder}
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => (setQuery(e.target.value), setActive(0), setOpen(true))}
                onFocus={() => setOpen(true)}
                onKeyDown={keys}
            />
            <kbd aria-hidden="true">/</kbd>
            {open && query.trim() !== '' && (
                <ul id={`${id}-results`} role="listbox" aria-label="Search results" className="search__results">
                    {results.length === 0 && <li className="search__empty">Nothing matches “{query}”.</li>}
                    {results.map((r, i) => (
                        <li
                            key={`${r.kind}:${r.id}:${r.kind === 'column' ? r.column : ''}`}
                            id={`${id}-${i}`}
                            role="option"
                            aria-selected={i === active}
                            className="search__result"
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => pick(r)}
                        >
                            <span className="search__kind">{KIND_LABEL[r.kind]}</span>
                            <span className="search__label">{r.label}</span>
                            <small>{r.detail}</small>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
});
