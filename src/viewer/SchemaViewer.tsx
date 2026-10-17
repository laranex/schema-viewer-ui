import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow, useViewport, type EdgeChange, type NodeChange } from '@xyflow/react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Diagnostic, SchemaDocument } from '../contract/types';
import type { ViewerChange, ViewerDownload } from '../contract/viewer-config';
import { EdgeDetails, Guide, TableDetails, type DetailContext, type ExtensionRenderers } from './Details';
import { cardHeight, CARD_WIDTH, edgeShown, edgesFor, keyColumns, lookup as buildLookup, matchesTable, neighbors, shownColumns, tableLabel, type GraphEdge } from './graph';
import { ARRANGEMENTS, autoLayout, type Arrangement, type LayoutRequest, type Positions } from './layout';
import { route, type Box } from './routing';
import { EdgeMarkers, SchemaEdgeView, type SchemaEdgeType } from './SchemaEdge';
import { TableNodeView, type TableNodeType } from './TableNode';
import { useTheme, type Theme } from './theme';

export type { ExtensionRenderers } from './Details';
export type { Theme } from './theme';

export type SchemaViewerProps = {
    document: SchemaDocument;
    changes?: ViewerChange[] | null;
    downloads?: ViewerDownload[];
    // An editor URL template with {file} and {line}, for source links.
    editor?: string | null;
    // The connection id to open on; all connections when unset.
    defaultConnection?: string | null;
    extensionRenderers?: ExtensionRenderers;
    title?: ReactNode;
    // Controlled theme; leave unset to follow the system until the theme button is used.
    theme?: Theme;
    onThemeChange?: (theme: Theme) => void;
    // Remember the theme button's choice in localStorage.
    persistTheme?: boolean;
    // Keep the selection in the URL hash (#table=…, #link=…, #focus=…, #connection=…) and open on it.
    deepLinks?: boolean;
    // Where Download JSON points; null hides it. By default it downloads the document shown.
    downloadHref?: string | null;
    status?: ReactNode;
    className?: string;
    // Replaces the ELK layout, for tests and custom placement.
    layout?: (request: LayoutRequest) => Promise<Positions>;
};

type Selection = { kind: 'table' | 'edge'; id: string } | null;

const nodeTypes = { table: TableNodeView };
const edgeTypes = { schema: SchemaEdgeView };

const SUBTITLE: Record<SchemaDocument['source'], string> = {
    declared: 'declared metadata · read-only',
    database: 'database metadata · read-only',
    combined: 'database + declared metadata · read-only',
};

export function SchemaViewer(props: SchemaViewerProps) {
    return (
        <ReactFlowProvider>
            <Viewer {...props} />
        </ReactFlowProvider>
    );
}

const readHash = () => {
    try {
        return new URLSearchParams(globalThis.location?.hash.slice(1) ?? '');
    } catch {
        return new URLSearchParams();
    }
};

function Viewer({
    document: doc,
    changes,
    downloads,
    editor = null,
    defaultConnection = null,
    extensionRenderers = {},
    title = (
        <>
            Laranex <span>Schema Viewer</span>
        </>
    ),
    theme: controlledTheme,
    onThemeChange,
    persistTheme = true,
    deepLinks = true,
    downloadHref,
    status,
    className,
    layout = autoLayout,
}: SchemaViewerProps) {
    const flow = useReactFlow();
    const { theme, toggle } = useTheme(controlledTheme, onThemeChange, persistTheme);
    const canvas = useRef<HTMLElement>(null);
    const search = useRef<HTMLInputElement>(null);
    const searchId = useId();
    const initialHash = useMemo(() => (deepLinks ? readHash() : new URLSearchParams()), [deepLinks]);

    const lookup = useMemo(() => buildLookup(doc), [doc]);
    const edges = useMemo(() => edgesFor(doc, lookup), [doc, lookup]);
    const keys = useMemo(() => keyColumns(doc), [doc]);
    const tables = useMemo(() => doc.connections.flatMap((c) => c.tables.map((table) => ({ table, connection: c }))), [doc]);
    const hasOwned = useMemo(() => tables.some(({ table }) => table.owner.kind !== 'application'), [tables]);
    const issues = useMemo(() => {
        const counts = new Map<string, number>();
        const tableOf = (d: Diagnostic): string | undefined => {
            const id = d.subject.id;
            if (id === null) {
                return undefined;
            }
            if (lookup.tables.has(id)) {
                return id;
            }
            return tables.find(({ table }) => table.indexes.some((i) => i.id === id) || table.foreignKeys.some((f) => f.id === id) || table.constraints.some((c) => c.id === id))?.table.id ?? lookup.relationships.get(id)?.table;
        };
        doc.diagnostics.forEach((d) => {
            const t = tableOf(d);
            if (t) {
                counts.set(t, (counts.get(t) ?? 0) + 1);
            }
        });
        return { counts, tableOf };
    }, [doc, lookup, tables]);

    const [connection, setConnection] = useState(() => initialHash.get('connection') ?? defaultConnection ?? '');
    const [showForeignKeys, setShowForeignKeys] = useState(true);
    const [showOrm, setShowOrm] = useState(true);
    const [allColumns, setAllColumns] = useState(false);
    const [showOwned, setShowOwned] = useState(true);
    const [query, setQuery] = useState('');
    const [focus, setFocus] = useState<string | null>(() => initialHash.get('focus'));
    const [selection, setSelection] = useState<Selection>(() => {
        const table = initialHash.get('table');
        const link = initialHash.get('link');
        return table ? { kind: 'table', id: table } : link ? { kind: 'edge', id: link } : null;
    });
    const [arrangement, setArrangement] = useState<Arrangement>('left-right');
    const [arrangeCount, setArrangeCount] = useState(0);
    const [positions, setPositions] = useState<Positions>({});
    const [dragging, setDragging] = useState<Record<string, { x: number; y: number }>>({});
    const [phase, setPhase] = useState<'arranging' | 'ready' | 'error'>('arranging');
    const [layoutError, setLayoutError] = useState<string | null>(null);

    // The selection, focus and connection in the URL hash, so a view can be shared.
    useEffect(() => {
        if (!deepLinks || typeof history === 'undefined') {
            return;
        }
        const params = new URLSearchParams();
        if (connection) {
            params.set('connection', connection);
        }
        if (focus) {
            params.set('focus', focus);
        }
        if (selection) {
            params.set(selection.kind === 'table' ? 'table' : 'link', selection.id);
        }
        const hash = params.toString();
        if (hash !== location.hash.slice(1)) {
            history.replaceState(null, '', `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`);
        }
    }, [deepLinks, connection, focus, selection]);

    const rows = useMemo(() => new Map(tables.map(({ table }) => [table.id, shownColumns(table, allColumns, keys.get(table.id))])), [tables, allColumns, keys]);
    const heights = useMemo(() => Object.fromEntries(tables.map(({ table }) => [table.id, cardHeight(rows.get(table.id)?.length ?? 0, table.columns.length)])), [tables, rows]);

    // The tables laid out: connection, ownership and focus. Search only hides cards, so the diagram keeps its shape.
    const placed = useMemo(() => {
        const near = focus ? neighbors(focus, edges) : null;
        return tables.filter(({ table, connection: c }) => (!connection || c.id === connection) && (showOwned || table.owner.kind === 'application') && (!near || near.has(table.id)));
    }, [tables, connection, showOwned, focus, edges]);
    const visible = useMemo(() => placed.filter(({ table, connection: c }) => matchesTable(table, c.name, query, doc.models)), [placed, query, doc.models]);
    const visibleIds = useMemo(() => new Set(visible.map(({ table }) => table.id)), [visible]);
    const shownEdges = useMemo(() => edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target) && edgeShown(e, showForeignKeys, showOrm)), [edges, visibleIds, showOrm, showForeignKeys]);

    const fit = useCallback(
        (ids?: string[]) => {
            const nodes = (ids ?? [...visibleIds]).map((id) => ({ id }));
            if (nodes.length) {
                void flow.fitView({ nodes, padding: 0.12, maxZoom: 1.2, minZoom: 0.05 });
            }
        },
        [flow, visibleIds],
    );

    const placedIds = useMemo(() => placed.map(({ table }) => table.id), [placed]);
    const layoutEdges = useMemo(() => edges.map((e) => ({ id: e.id, source: e.source, target: e.target })), [edges]);
    const pendingFit = useRef(false);
    useEffect(() => {
        let cancelled = false;
        setPhase('arranging');
        const box = canvas.current?.getBoundingClientRect();
        const aspect = box && box.height > 0 ? Math.max(0.5, Math.min(2.4, box.width / box.height)) : 1.6;
        layout({ ids: placedIds, heights: Object.fromEntries(placedIds.map((id) => [id, heights[id]])), edges: layoutEdges, arrangement, aspect })
            .then((result) => {
                if (cancelled) {
                    return;
                }
                setPositions(result);
                setDragging({});
                setPhase('ready');
                setLayoutError(null);
                pendingFit.current = true;
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setPhase('error');
                    setLayoutError(error instanceof Error ? error.message : String(error));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [placedIds, heights, layoutEdges, arrangement, arrangeCount, layout]);

    const related = useMemo(() => {
        if (selection?.kind === 'table') {
            return neighbors(selection.id, shownEdges);
        }
        const edge = selection && edges.find((e) => e.id === selection.id);
        return new Set(edge ? [edge.source, edge.target, ...(edge.derived?.via ?? [])] : []);
    }, [selection, shownEdges, edges]);

    const center = useCallback(
        (id: string) => {
            const position = positions[id];
            const box = canvas.current?.getBoundingClientRect();
            if (position && box) {
                const zoom = 0.9;
                void flow.setViewport({ x: box.width / 2 - (position.x + CARD_WIDTH / 2) * zoom, y: 70 - position.y * zoom, zoom });
            }
        },
        [flow, positions],
    );
    const selectTable = useCallback(
        (id: string, centered = false) => {
            setSelection({ kind: 'table', id });
            if (centered) {
                center(id);
            }
        },
        [center],
    );

    // Once laid out: the selected table, or the whole diagram, in view.
    useEffect(() => {
        if (phase !== 'ready' || !pendingFit.current) {
            return;
        }
        pendingFit.current = false;
        const frame = requestAnimationFrame(() => (selection?.kind === 'table' && positions[selection.id] && !focus ? center(selection.id) : fit()));
        return () => cancelAnimationFrame(frame);
        // Only a new layout refits; selecting later does not.
    }, [phase, positions]);

    const combined = doc.source === 'combined';
    const nodeData = useMemo(() => {
        const data = new Map<string, TableNodeType['data']>();
        for (const { table, connection: c } of visible) {
            data.set(table.id, {
                table,
                connection: c.name,
                rows: rows.get(table.id) ?? [],
                state: selection?.kind === 'table' && selection.id === table.id ? 'selected' : related.has(table.id) ? 'related' : 'none',
                issues: issues.counts.get(table.id) ?? 0,
                combined,
                onSelect: (id) => setSelection({ kind: 'table', id }),
            });
        }
        return data;
    }, [visible, rows, selection, related, issues, combined]);

    const nodes = useMemo<TableNodeType[]>(
        () =>
            visible
                .filter(({ table }) => positions[table.id])
                .map(({ table }) => ({
                    id: table.id,
                    type: 'table',
                    position: dragging[table.id] ?? positions[table.id],
                    data: nodeData.get(table.id) as TableNodeType['data'],
                    dragHandle: '.table-title',
                    selected: selection?.kind === 'table' && selection.id === table.id,
                    width: CARD_WIDTH,
                    height: heights[table.id],
                    ariaLabel: `Table ${tableLabel(table)}`,
                })),
        [visible, positions, dragging, nodeData, selection, heights],
    );

    // Routes over settled positions; edges touching a card being dragged float until it is dropped.
    const routes = useMemo(() => {
        const boxes = new Map<string, Box>();
        for (const { table } of visible) {
            const p = positions[table.id];
            if (p) {
                boxes.set(table.id, { id: table.id, x: p.x, y: p.y, width: CARD_WIDTH, height: heights[table.id], rows: rows.get(table.id) ?? [] });
            }
        }
        return route(
            boxes,
            shownEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceColumn: e.sourceColumn, targetColumn: e.targetColumn, labelled: e.kind !== 'foreign_key' || e.id === selection?.id })),
        );
    }, [visible, positions, heights, rows, shownEdges, selection]);

    const flowEdges = useMemo<SchemaEdgeType[]>(
        () =>
            shownEdges
                .filter((e) => positions[e.source] && positions[e.target])
                .map((e) => {
                    const selected = selection?.kind === 'edge' && selection.id === e.id;
                    const near = selection?.kind === 'table' && (e.source === selection.id || e.target === selection.id);
                    return {
                        id: e.id,
                        type: 'schema',
                        source: e.source,
                        target: e.target,
                        selected,
                        ariaLabel: e.label,
                        zIndex: selected ? 1 : 0,
                        data: {
                            kind: e.kind,
                            declaredOnly: e.declaredOnly,
                            polymorphic: e.polymorphic,
                            label: e.label,
                            route: dragging[e.source] || dragging[e.target] ? null : (routes.get(e.id) ?? null),
                            showLabel: e.kind !== 'foreign_key' || selected,
                            state: selected ? 'selected' : near ? 'related' : 'none',
                        },
                    };
                }),
        [shownEdges, positions, selection, dragging, routes],
    );

    const onNodesChange = useCallback((changes: NodeChange<TableNodeType>[]) => {
        for (const change of changes) {
            if (change.type === 'select' && change.selected) {
                setSelection({ kind: 'table', id: change.id });
            } else if (change.type === 'position' && change.position && change.dragging) {
                const { id, position } = change;
                setDragging((d) => ({ ...d, [id]: position }));
            }
        }
    }, []);

    // Dropping a card commits its position, and the routes follow.
    const onNodeDragStop = useCallback((_: unknown, node: TableNodeType) => {
        setPositions((p) => ({ ...p, [node.id]: node.position }));
        setDragging(({ [node.id]: _dropped, ...rest }) => rest);
    }, []);

    const onEdgesChange = useCallback((changes: EdgeChange<SchemaEdgeType>[]) => {
        for (const change of changes) {
            if (change.type === 'select' && change.selected) {
                setSelection({ kind: 'edge', id: change.id });
            }
        }
    }, []);

    const zoomBy = useCallback(
        (factor: number) => {
            const { x, y, zoom } = flow.getViewport();
            const box = canvas.current?.getBoundingClientRect();
            const cx = (box?.width ?? 0) / 2;
            const cy = (box?.height ?? 0) / 2;
            const next = Math.max(0.05, Math.min(2.5, zoom * factor));
            void flow.setViewport({ x: cx - ((cx - x) * next) / zoom, y: cy - ((cy - y) * next) / zoom, zoom: next });
        },
        [flow],
    );

    const onCanvasKey = (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) {
            return;
        }
        const pan: Record<string, [number, number]> = { ArrowLeft: [50, 0], ArrowRight: [-50, 0], ArrowUp: [0, 50], ArrowDown: [0, -50] };
        if (event.key === '+' || event.key === '=') {
            zoomBy(1.2);
        } else if (event.key === '-') {
            zoomBy(1 / 1.2);
        } else if (event.key === '0') {
            fit();
        } else if (pan[event.key]) {
            event.preventDefault();
            const { x, y, zoom } = flow.getViewport();
            void flow.setViewport({ x: x + pan[event.key][0], y: y + pan[event.key][1], zoom });
        }
    };

    // / and Escape work anywhere on the page, but not while typing into another field.
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const listener = (event: globalThis.KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = target?.closest?.('input, select, textarea, [contenteditable="true"]');
            if (event.key === '/' && !typing) {
                event.preventDefault();
                search.current?.focus();
            } else if (event.key === 'Escape') {
                if (target === search.current && search.current?.value) {
                    setQuery('');
                    return;
                }
                if (typing && !root.current?.contains(target)) {
                    return;
                }
                setFocus(null);
                setSelection(null);
            }
        };
        document.addEventListener('keydown', listener);
        return () => document.removeEventListener('keydown', listener);
    }, []);

    // Refit when search changes what is shown; layout changes refit on their own.
    const firstQuery = useRef(true);
    useEffect(() => {
        if (firstQuery.current) {
            firstQuery.current = false;
            return;
        }
        const frame = requestAnimationFrame(() => fit());
        return () => cancelAnimationFrame(frame);
    }, [query]);

    const selectedTable = selection?.kind === 'table' ? lookup.tables.get(selection.id) : undefined;
    const selectedEdge = selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) : undefined;
    const ctx: DetailContext = { doc, lookup, editor, renderers: extensionRenderers };

    const selectSubject = (d: Diagnostic) => {
        const table = issues.tableOf(d);
        if (table) {
            setConnection('');
            selectTable(table, true);
        } else if (d.subject.type === 'link' && d.subject.id) {
            setSelection({ kind: 'edge', id: d.subject.id });
        }
    };

    const foreignKeyCount = tables.reduce((sum, { table }) => sum + table.foreignKeys.length, 0);
    const downloadDocument = () => {
        const url = URL.createObjectURL(new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'schema-viewer.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    };

    const statusText =
        status ??
        (phase === 'error'
            ? `Could not lay out the diagram: ${layoutError}`
            : phase === 'arranging'
              ? `Arranging ${placed.length} tables…`
              : `Saved snapshot · ${doc.source} · ${doc.models.length} models · ${doc.diagnostics.length} diagnostics`);

    return (
        <div ref={root} className={`lsv${className ? ` ${className}` : ''}`} data-theme={theme} data-loaded={phase === 'ready' ? 'true' : phase === 'error' ? 'error' : 'false'}>
            <header className="lsv-header">
                <div className="brand">
                    <span className="brand-mark" aria-hidden="true">
                        L
                    </span>
                    <div>
                        <h1>{title}</h1>
                        <small>{SUBTITLE[doc.source]}</small>
                    </div>
                </div>
                <div className="actions">
                    <button type="button" className="theme" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Switch theme">
                        {theme === 'dark' ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="4" />
                                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                            </svg>
                        )}
                    </button>
                    {downloadHref === undefined ? (
                        <button type="button" className="button primary" onClick={downloadDocument} title="Download JSON snapshot">
                            ↓<span className="button-label"> Download JSON</span>
                        </button>
                    ) : (
                        downloadHref !== null && (
                            <a className="button primary" href={downloadHref} download="schema-viewer.json" title="Download JSON snapshot">
                                ↓<span className="button-label"> Download JSON</span>
                            </a>
                        )
                    )}
                </div>
            </header>
            <div className="layerbar">
                <span className="eyebrow">Layers</span>
                {doc.connections.length > 1 && (
                    <label>
                        Connection
                        <select value={connection} onChange={(e) => (setFocus(null), setConnection(e.target.value))}>
                            <option value="">All connections</option>
                            {doc.connections.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <label>
                    <input type="checkbox" checked={showForeignKeys} onChange={(e) => setShowForeignKeys(e.target.checked)} />
                    <span className="line-key key--foreign_key" />
                    Foreign keys
                </label>
                <label>
                    <input type="checkbox" checked={showOrm} onChange={(e) => setShowOrm(e.target.checked)} />
                    <span className="line-key key--relationship" />
                    ORM relationships
                </label>
                <label>
                    <input type="checkbox" checked={allColumns} onChange={(e) => setAllColumns(e.target.checked)} />
                    All columns
                </label>
                {hasOwned && (
                    <label>
                        <input type="checkbox" checked={showOwned} onChange={(e) => setShowOwned(e.target.checked)} />
                        Framework and package tables
                    </label>
                )}
                <label>
                    Layout
                    <select value={arrangement} onChange={(e) => setArrangement(e.target.value as Arrangement)}>
                        {ARRANGEMENTS.map((a) => (
                            <option key={a.value} value={a.value}>
                                {a.label}
                            </option>
                        ))}
                    </select>
                </label>
                <span className="counts" role="status">
                    {tables.length} tables · {foreignKeyCount} foreign keys · {doc.relationships.length} ORM relationships
                </span>
            </div>
            <main className="lsv-main">
                <aside className="browse" aria-label="Tables">
                    <div className="panel-heading">
                        <h2>Tables</h2>
                        <span className="table-count">{visible.length}</span>
                    </div>
                    <label className="search-label" htmlFor={searchId}>
                        Search tables, columns, models
                    </label>
                    <div className="search">
                        <input id={searchId} ref={search} type="search" placeholder="Search schema…" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
                        <kbd aria-hidden="true">/</kbd>
                    </div>
                    <div className="table-list">
                        {visible.length === 0 && <p className="list-empty">No tables match.</p>}
                        {visible.map(({ table, connection: c }) => (
                            <button type="button" key={table.id} className={selection?.id === table.id ? 'selected' : ''} onClick={() => selectTable(table.id, true)}>
                                {tableLabel(table)}
                                <small>
                                    {doc.connections.length > 1 ? `${c.name} · ` : ''}
                                    {table.columns.length} columns · {table.indexes.length} indexes · {table.foreignKeys.length} foreign keys
                                </small>
                            </button>
                        ))}
                    </div>
                    <p className="browse-foot">Saved snapshot · no database access</p>
                </aside>
                <section ref={canvas} className={`canvas${related.size > 0 ? ' has-selection' : ''}`} tabIndex={0} aria-label="Interactive entity relationship diagram. Drag background to pan, scroll to zoom." onKeyDown={onCanvasKey}>
                    <EdgeMarkers />
                    <ReactFlow
                        nodes={nodes}
                        edges={flowEdges}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeDragStop={onNodeDragStop}
                        colorMode={theme}
                        minZoom={0.05}
                        maxZoom={2.5}
                        nodesConnectable={false}
                        selectionKeyCode={null}
                        multiSelectionKeyCode={null}
                        deleteKeyCode={null}
                        zoomOnDoubleClick={false}
                        onlyRenderVisibleElements={nodes.length > 60}
                    >
                        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--dot)" />
                    </ReactFlow>
                    <div className="canvas-top">
                        <span className="pill">SCHEMA EXPLORER</span>
                        {focus && (
                            <button type="button" className="unfocus" onClick={() => setFocus(null)}>
                                ← Show all tables
                            </button>
                        )}
                    </div>
                    <CanvasTools onZoomIn={() => zoomBy(1.25)} onZoomOut={() => zoomBy(0.8)} onFit={() => fit()} onArrange={() => setArrangeCount((n) => n + 1)} />
                    {visible.length === 0 && (
                        <div className="empty">
                            <strong>No matching tables</strong>
                            <span className="muted">Try another search or connection.</span>
                        </div>
                    )}
                </section>
                <aside className="details" aria-label="Selection details">
                    {selectedTable ? (
                        <TableDetails
                            ctx={ctx}
                            table={selectedTable}
                            edges={edges.filter((e) => e.source === selectedTable.id || e.target === selectedTable.id)}
                            onFocus={() => (setQuery(''), setFocus(selectedTable.id))}
                            onClear={() => setSelection(null)}
                            onSelectEdge={(edge: GraphEdge) => setSelection({ kind: 'edge', id: edge.id })}
                            onSelectTable={(id) => selectTable(id, true)}
                        />
                    ) : selectedEdge ? (
                        <EdgeDetails edge={selectedEdge} ctx={ctx} onSelectTable={(id) => selectTable(id, true)} />
                    ) : (
                        <Guide ctx={ctx} changes={changes} downloads={downloads} onSelectSubject={selectSubject} />
                    )}
                </aside>
            </main>
            <footer className="lsv-footer">
                <span className="status" role="status">
                    {statusText}
                </span>
                <span>Laranex Schema Viewer · MIT</span>
            </footer>
        </div>
    );
}

function CanvasTools({ onZoomIn, onZoomOut, onFit, onArrange }: { onZoomIn: () => void; onZoomOut: () => void; onFit: () => void; onArrange: () => void }) {
    const { zoom } = useViewport();
    return (
        <div className="canvas-tools">
            <button type="button" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out (−)">
                −
            </button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in (+)">
                +
            </button>
            <span className="divider" />
            <button type="button" onClick={onFit} title="Fit to view (0)">
                Fit
            </button>
            <button type="button" onClick={onArrange} title="Reset the layout">
                Arrange
            </button>
        </div>
    );
}
