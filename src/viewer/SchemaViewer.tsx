import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow, useViewport, type EdgeChange, type NodeChange } from '@xyflow/react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Diagnostic, SchemaDocument, Table } from '../contract/types';
import type { ViewerChange, ViewerDownload } from '../contract/viewer-config';
import { EdgeDetails, Guide, TableDetails, type DetailContext, type ExtensionRenderers } from './Details';
import { boundsOf, clip, colorsOf, save, toCanvas, toPngBlob, toSvg, type ImageModel } from './exportImage';
import {
    cardHeight,
    cardRows,
    CARD_WIDTH,
    columnMarks,
    EDGE_KINDS,
    edgesFor,
    FOLDS,
    isNote,
    keyColumns,
    NOTE,
    lookup as buildLookup,
    matchesTable,
    neighbors,
    tableLabel,
    within,
    type EdgeKind,
    type Fold,
    type GraphEdge,
} from './graph';
import { ARRANGEMENTS, autoLayout, type Arrangement, type LayoutRequest, type Positions } from './layout';
import { Resizer } from './Resizer';
import { route, type Box } from './routing';
import { EdgeMarkers, SchemaEdgeView, type SchemaEdgeType } from './SchemaEdge';
import { ShortcutsDialog } from './Shortcuts';
import { TableNodeView, type TableNodeType } from './TableNode';
import { Tour } from './Tour';
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
    // Keep the view in the URL hash (#table=…, #link=…, #focus=…, #depth=…, #connection=…) and open on it.
    deepLinks?: boolean;
    // Where Download JSON points; null hides it. By default it downloads the document shown.
    downloadHref?: string | null;
    status?: ReactNode;
    className?: string;
    // Replaces the ELK layout, for tests and custom placement.
    layout?: (request: LayoutRequest) => Promise<Positions>;
};

type Selection = { kind: 'table' | 'edge'; id: string } | null;
type Owner = Table['owner']['kind'];

const nodeTypes = { table: TableNodeView };
const edgeTypes = { schema: SchemaEdgeView };

const SUBTITLE: Record<SchemaDocument['source'], string> = {
    declared: 'declared metadata · read-only',
    database: 'database metadata · read-only',
    combined: 'database + declared metadata · read-only',
};

const KIND_LABEL: Record<EdgeKind, string> = { both: 'FK + ORM', foreign_key: 'FK only', relationship: 'ORM only', through: 'Through' };

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
    const root = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLElement>(null);
    const search = useRef<HTMLInputElement>(null);
    const searchId = useId();
    const initialHash = useMemo(() => (deepLinks ? readHash() : new URLSearchParams()), [deepLinks]);

    const lookup = useMemo(() => buildLookup(doc), [doc]);
    const edges = useMemo(() => edgesFor(doc, lookup), [doc, lookup]);
    const keys = useMemo(() => keyColumns(doc), [doc]);
    const tables = useMemo(() => doc.connections.flatMap((c) => c.tables.map((table) => ({ table, connection: c }))), [doc]);
    const owners = useMemo(() => new Set(tables.map(({ table }) => table.owner.kind)), [tables]);
    const kindsPresent = useMemo(() => new Set(edges.map((e) => e.kind)), [edges]);
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
    const [kinds, setKinds] = useState<Set<EdgeKind>>(() => new Set(EDGE_KINDS));
    const [fold, setFold] = useState<Fold>('keys');
    const [notes, setNotes] = useState(false);
    const [allLabels, setAllLabels] = useState(true);
    const [hiddenOwners, setHiddenOwners] = useState<Set<Owner>>(() => new Set());
    const [query, setQuery] = useState('');
    const [focus, setFocus] = useState<{ id: string; depth: number } | null>(() => {
        const id = initialHash.get('focus');
        return id ? { id, depth: Math.max(1, Math.min(3, Number(initialHash.get('depth')) || 1)) } : null;
    });
    const [selection, setSelection] = useState<Selection>(() => {
        const table = initialHash.get('table');
        const link = initialHash.get('link');
        return table ? { kind: 'table', id: table } : link ? { kind: 'edge', id: link } : null;
    });
    // Tables picked together with Shift: dragged together, listed together.
    const [group, setGroup] = useState<string[]>([]);
    const groupRef = useRef(group);
    groupRef.current = group;
    const [arrangement, setArrangement] = useState<Arrangement>('left-right');
    const [arrangeCount, setArrangeCount] = useState(0);
    const [positions, setPositions] = useState<Positions>({});
    const [dragging, setDragging] = useState<Record<string, { x: number; y: number }>>({});
    const [phase, setPhase] = useState<'arranging' | 'ready' | 'error'>('arranging');
    const [layoutError, setLayoutError] = useState<string | null>(null);
    const [panMode, setPanMode] = useState(true);
    const [spacePan, setSpacePan] = useState(false);
    const [shortcuts, setShortcuts] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [exportOpen, setExportOpen] = useState(false);
    const [touring, setTouring] = useState(false);
    // Side panel widths once the user resizes them; until then the stylesheet's responsive defaults apply.
    const [panels, setPanels] = useState<{ left: number | null; right: number | null }>({ left: null, right: null });
    const browse = useRef<HTMLElement>(null);
    const details = useRef<HTMLElement>(null);

    useEffect(() => {
        if (!toast) {
            return;
        }
        const timer = setTimeout(() => setToast(null), 1800);
        return () => clearTimeout(timer);
    }, [toast]);

    // The view in the URL hash, so it can be shared.
    useEffect(() => {
        if (!deepLinks || typeof history === 'undefined') {
            return;
        }
        const params = new URLSearchParams();
        if (connection) {
            params.set('connection', connection);
        }
        if (focus) {
            params.set('focus', focus.id);
            if (focus.depth > 1) {
                params.set('depth', String(focus.depth));
            }
        }
        if (selection) {
            params.set(selection.kind === 'table' ? 'table' : 'link', selection.id);
        }
        const hash = params.toString();
        if (hash !== location.hash.slice(1)) {
            history.replaceState(null, '', `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`);
        }
    }, [deepLinks, connection, focus, selection]);

    const rows = useMemo(() => new Map(tables.map(({ table }) => [table.id, cardRows(table, fold, keys.get(table.id), notes)])), [tables, fold, keys, notes]);
    const heights = useMemo(
        () =>
            Object.fromEntries(
                tables.map(({ table }) => {
                    const shown = rows.get(table.id) ?? [];
                    return [table.id, cardHeight(shown.length, table.columns.length - shown.filter((r) => !isNote(r)).length)];
                }),
            ),
        [tables, rows],
    );

    // The tables laid out: connection, ownership and focus. Search only hides cards, so the diagram keeps its shape.
    const placed = useMemo(() => {
        const near = focus ? within(focus.id, edges, focus.depth) : null;
        return tables.filter(({ table, connection: c }) => (!connection || c.id === connection) && !hiddenOwners.has(table.owner.kind) && (!near || near.has(table.id)));
    }, [tables, connection, hiddenOwners, focus, edges]);
    const visible = useMemo(() => placed.filter(({ table, connection: c }) => matchesTable(table, c.name, query, doc.models)), [placed, query, doc.models]);
    const visibleIds = useMemo(() => new Set(visible.map(({ table }) => table.id)), [visible]);
    const shownEdges = useMemo(() => edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target) && kinds.has(e.kind)), [edges, visibleIds, kinds]);

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
        if (group.length > 1) {
            return new Set(group);
        }
        if (selection?.kind === 'table') {
            return neighbors(selection.id, shownEdges);
        }
        const edge = selection && edges.find((e) => e.id === selection.id);
        return new Set(edge ? [edge.source, edge.target, ...(edge.derived?.via ?? [])] : []);
    }, [selection, shownEdges, edges, group]);

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
            setGroup([id]);
            if (centered) {
                center(id);
            }
        },
        [center],
    );
    const focusOn = useCallback((id: string) => {
        setQuery('');
        setSelection({ kind: 'table', id });
        setGroup([id]);
        setFocus((f) => ({ id, depth: f?.depth ?? 1 }));
    }, []);

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
    const picked = useMemo(() => new Set(group), [group]);
    const nodeData = useMemo(() => {
        const data = new Map<string, TableNodeType['data']>();
        for (const { table, connection: c } of visible) {
            data.set(table.id, {
                table,
                connection: c.name,
                rows: rows.get(table.id) ?? [],
                state: selection?.kind === 'table' && selection.id === table.id ? 'selected' : related.has(table.id) ? 'related' : 'none',
                picked: group.length > 1 && picked.has(table.id),
                issues: issues.counts.get(table.id) ?? 0,
                combined,
                onSelect: (id) => selectTable(id),
                onFocus: focusOn,
            });
        }
        return data;
    }, [visible, rows, selection, related, issues, combined, group, picked, selectTable, focusOn]);

    const nodes = useMemo<TableNodeType[]>(
        () =>
            visible
                .filter(({ table }) => positions[table.id])
                .map(({ table }) => ({
                    id: table.id,
                    type: 'table',
                    position: dragging[table.id] ?? positions[table.id],
                    data: nodeData.get(table.id) as TableNodeType['data'],
                    dragHandle: spacePan ? '.no-drag-while-panning' : '.table-title',
                    selected: picked.has(table.id),
                    width: CARD_WIDTH,
                    height: heights[table.id],
                    ariaLabel: `Table ${tableLabel(table)}`,
                })),
        [visible, positions, dragging, nodeData, picked, heights, spacePan],
    );

    // Routes over settled positions; edges touching a card being dragged float until it is dropped.
    const labelled = useCallback(
        (e: GraphEdge) => (allLabels ? e.kind !== 'foreign_key' : selection?.kind === 'table' && (e.source === selection.id || e.target === selection.id)) || e.id === selection?.id,
        [allLabels, selection],
    );
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
            shownEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceColumn: e.sourceColumn, targetColumn: e.targetColumn, labelled: labelled(e) })),
        );
    }, [visible, positions, heights, rows, shownEdges, labelled]);

    const flowEdges = useMemo<SchemaEdgeType[]>(
        () =>
            shownEdges
                .filter((e) => positions[e.source] && positions[e.target])
                .map((e) => {
                    const selected = selection?.kind === 'edge' && selection.id === e.id;
                    const near = (selection?.kind === 'table' && (e.source === selection.id || e.target === selection.id)) || (group.length > 1 && picked.has(e.source) && picked.has(e.target));
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
                            showLabel: labelled(e),
                            state: selected ? 'selected' : near ? 'related' : 'none',
                        },
                    };
                }),
        [shownEdges, positions, selection, dragging, routes, labelled, group, picked],
    );

    const onNodesChange = useCallback((changes: NodeChange<TableNodeType>[]) => {
        const added: string[] = [];
        const removed: string[] = [];
        for (const change of changes) {
            if (change.type === 'select') {
                (change.selected ? added : removed).push(change.id);
            } else if (change.type === 'position' && change.position && change.dragging) {
                const { id, position } = change;
                setDragging((d) => ({ ...d, [id]: position }));
            }
        }
        if (added.length || removed.length) {
            const g = groupRef.current;
            const next = [...g.filter((id) => !removed.includes(id)), ...added.filter((id) => !g.includes(id))];
            groupRef.current = next;
            setGroup(next);
            setSelection(next.length ? { kind: 'table', id: next[next.length - 1] } : (s) => (s?.kind === 'edge' ? s : null));
        }
    }, []);

    // Dropping cards commits their positions, and the routes follow.
    const onNodeDragStop = useCallback((_: unknown, _node: TableNodeType, moved: TableNodeType[]) => {
        setPositions((p) => ({ ...p, ...Object.fromEntries(moved.map((n) => [n.id, n.position])) }));
        setDragging((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !moved.some((n) => n.id === id))));
    }, []);

    const onEdgesChange = useCallback((changes: EdgeChange<SchemaEdgeType>[]) => {
        for (const change of changes) {
            if (change.type === 'select' && change.selected) {
                setSelection({ kind: 'edge', id: change.id });
                setGroup([]);
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
        if (pan[event.key]) {
            event.preventDefault();
            const { x, y, zoom } = flow.getViewport();
            void flow.setViewport({ x: x + pan[event.key][0], y: y + pan[event.key][1], zoom });
        }
    };

    const toggleIn = <T,>(set: Set<T>, value: T) => {
        const next = new Set(set);
        if (!next.delete(value)) {
            next.add(value);
        }
        return next;
    };
    const stepConnection = (by: number) => {
        const ids = ['', ...doc.connections.map((c) => c.id)];
        setFocus(null);
        setConnection((c) => ids[(ids.indexOf(c) + by + ids.length) % ids.length]);
    };
    // What the diagram shows, as an image model: cards where they are and edges along their routes.
    const imageModel = (): ImageModel => {
        const imageNodes = visible
            .filter(({ table }) => positions[table.id])
            .map(({ table, connection: c }) => {
                const p = dragging[table.id] ?? positions[table.id];
                const marks = columnMarks(table);
                const byName = new Map(table.columns.map((col) => [col.name, col]));
                const shown = rows.get(table.id) ?? [];
                return {
                    x: p.x,
                    y: p.y,
                    width: CARD_WIDTH,
                    height: heights[table.id],
                    title: tableLabel(table),
                    subtitle: `${c.name}${table.owner.kind !== 'application' ? ` · ${table.owner.package ?? table.owner.kind}` : ''}`,
                    rows: shown.map((r) => {
                        if (isNote(r)) {
                            return { note: true, key: '', name: (r === NOTE ? table.note : byName.get(r.slice(NOTE.length))?.note) ?? '', type: '', flag: null };
                        }
                        const col = byName.get(r);
                        const flag = col?.drift?.length ? ('drift' as const) : combined && col?.provenance.length === 1 && col.provenance[0] === 'declared' ? ('declared-only' as const) : null;
                        return { note: false, key: marks.get(r) ?? '', name: r, type: col?.type ?? '', flag };
                    }),
                    more: table.columns.length - shown.filter((r) => !isNote(r)).length,
                    declaredOnly: combined && table.provenance.length === 1 && table.provenance[0] === 'declared',
                };
            });
        const imageEdges = shownEdges.flatMap((e) => {
            const r = routes.get(e.id);
            return r ? [{ kind: e.kind, declaredOnly: e.declaredOnly, sx: r.sx, sy: r.sy, cx: r.channelX, tx: r.tx, ty: r.ty, label: labelled(e) ? { x: r.labelX, y: r.labelY, text: e.label } : null }] : [];
        });
        return { nodes: imageNodes, edges: imageEdges, bounds: boundsOf(imageNodes) };
    };
    const exportImage = async (format: 'png' | 'svg', area: 'all' | 'visible') => {
        setExportOpen(false);
        try {
            let model = imageModel();
            if (area === 'visible') {
                const box = canvas.current?.getBoundingClientRect();
                const { x, y, zoom } = flow.getViewport();
                if (box) {
                    model = clip(model, { x: -x / zoom, y: -y / zoom, width: box.width / zoom, height: box.height / zoom });
                }
            }
            const colors = colorsOf(root.current as HTMLElement);
            const name = `schema-${area === 'all' ? 'diagram' : 'view'}.${format}`;
            if (format === 'svg') {
                save(new Blob([toSvg(model, colors)], { type: 'image/svg+xml' }), name);
            } else {
                await document.fonts?.ready;
                save(await toPngBlob(toCanvas(model, colors)), name);
            }
            setToast(`Saved ${name}`);
        } catch (error) {
            setToast(error instanceof Error ? error.message : 'The image could not be made.');
        }
    };
    const copyLink = () => {
        void navigator.clipboard?.writeText(location.href).then(
            () => setToast('Link copied'),
            () => setToast('Could not copy the link'),
        );
    };

    // Shortcuts work while the viewer has focus or nothing else does, and never while typing.
    const actions = useRef<Record<string, () => void>>({});
    actions.current = {
        f: () => fit(),
        '0': () => fit(),
        '+': () => zoomBy(1.2),
        '=': () => zoomBy(1.2),
        '-': () => zoomBy(1 / 1.2),
        c: () => setFold((f) => FOLDS[(FOLDS.findIndex((x) => x.value === f) + 1) % FOLDS.length].value),
        C: copyLink,
        F: () => (focus ? setFocus(null) : selection?.kind === 'table' && focusOn(selection.id)),
        n: () => setNotes((n) => !n),
        l: () => setAllLabels((l) => !l),
        '1': () => setKinds((k) => toggleIn(k, 'both')),
        '2': () => setKinds((k) => toggleIn(k, 'foreign_key')),
        '3': () => setKinds((k) => toggleIn(k, 'relationship')),
        '4': () => setKinds((k) => toggleIn(k, 'through')),
        y: () => setHiddenOwners((o) => toggleIn(o, 'application')),
        g: () => setHiddenOwners((o) => toggleIn(o, 'framework')),
        p: () => setHiddenOwners((o) => toggleIn(o, 'package')),
        '[': () => stepConnection(-1),
        ']': () => stepConnection(1),
        s: () => setShortcuts(true),
        e: () => setExportOpen((o) => !o),
        '?': () => setTouring(true),
    };
    useEffect(() => {
        const down = (event: globalThis.KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = !!target?.closest?.('input, select, textarea, [contenteditable="true"]');
            const ours = !(target instanceof Element) || target === document.body || !!root.current?.contains(target);
            if (event.key === 'Escape') {
                setExportOpen(false);
                if (target === search.current && search.current?.value) {
                    setQuery('');
                    return;
                }
                if (ours) {
                    setFocus(null);
                    setSelection(null);
                    setGroup([]);
                }
                return;
            }
            if (typing || !ours || event.metaKey || event.ctrlKey || event.altKey) {
                return;
            }
            if (event.key === '/') {
                event.preventDefault();
                search.current?.focus();
            } else if (event.key === ' ' && !target?.closest?.('button')) {
                event.preventDefault();
                setSpacePan(true);
            } else if (actions.current[event.key]) {
                event.preventDefault();
                actions.current[event.key]();
            }
        };
        const up = (event: globalThis.KeyboardEvent) => event.key === ' ' && setSpacePan(false);
        document.addEventListener('keydown', down);
        document.addEventListener('keyup', up);
        return () => {
            document.removeEventListener('keydown', down);
            document.removeEventListener('keyup', up);
        };
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
    const panning = panMode || spacePan;
    const ownerLabel: Record<Owner, string> = { application: 'Your tables', framework: 'Framework tables', package: 'Package tables' };

    return (
        <div
            ref={root}
            className={`lsv${panMode ? ' pan-mode' : ''}${spacePan ? ' space-pan' : ''}${className ? ` ${className}` : ''}`}
            data-theme={theme}
            data-loaded={phase === 'ready' ? 'true' : phase === 'error' ? 'error' : 'false'}
        >
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
                    <button type="button" className="theme" onClick={() => setTouring(true)} aria-label="Take the tour" title="Take the tour (?)">
                        ?
                    </button>
                    <button type="button" className="theme" onClick={() => setShortcuts(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (S)">
                        ⌨
                    </button>
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
                {EDGE_KINDS.filter((k) => kindsPresent.has(k)).map((k) => (
                    <label key={k} title={`Shortcut ${EDGE_KINDS.indexOf(k) + 1}`}>
                        <input type="checkbox" checked={kinds.has(k)} onChange={() => setKinds((s) => toggleIn(s, k))} />
                        <span className={`line-key key--${k}`} />
                        {KIND_LABEL[k]}
                    </label>
                ))}
                <label>
                    Columns
                    <select value={fold} onChange={(e) => setFold(e.target.value as Fold)} title="Shortcut C">
                        {FOLDS.map((f) => (
                            <option key={f.value} value={f.value}>
                                {f.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label title="Shortcut N">
                    <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
                    Notes
                </label>
                <label title="Shortcut L">
                    <input type="checkbox" checked={allLabels} onChange={(e) => setAllLabels(e.target.checked)} />
                    Names
                </label>
                {owners.size > 1 &&
                    (['application', 'framework', 'package'] as Owner[])
                        .filter((o) => owners.has(o))
                        .map((o) => (
                            <label key={o}>
                                <input type="checkbox" checked={!hiddenOwners.has(o)} onChange={() => setHiddenOwners((s) => toggleIn(s, o))} />
                                {ownerLabel[o]}
                            </label>
                        ))}
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
            <main
                className="lsv-main"
                style={{
                    ...(panels.left !== null ? { ['--lsv-left' as string]: `${panels.left}px` } : {}),
                    ...(panels.right !== null ? { ['--lsv-right' as string]: `${panels.right}px` } : {}),
                }}
            >
                <aside ref={browse} className="browse" aria-label="Tables">
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
                            <button type="button" key={table.id} className={selection?.id === table.id || (group.length > 1 && picked.has(table.id)) ? 'selected' : ''} onClick={() => selectTable(table.id, true)}>
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
                        nodesDraggable={!spacePan}
                        nodeDragThreshold={3}
                        panOnDrag={panning ? true : [1, 2]}
                        selectionOnDrag={!panning}
                        selectionKeyCode="Shift"
                        multiSelectionKeyCode="Shift"
                        deleteKeyCode={null}
                        zoomOnDoubleClick={false}
                        onlyRenderVisibleElements={nodes.length > 60}
                    >
                        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--dot)" />
                    </ReactFlow>
                    <div className="canvas-top">
                        <span className="pill">SCHEMA EXPLORER</span>
                        {focus && (
                            <>
                                <button type="button" className="unfocus" onClick={() => setFocus(null)}>
                                    ← Show all tables
                                </button>
                                <label className="focus-depth">
                                    Depth
                                    <select value={focus.depth} onChange={(e) => setFocus({ ...focus, depth: Number(e.target.value) })}>
                                        {[1, 2, 3].map((d) => (
                                            <option key={d} value={d}>
                                                {d}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </>
                        )}
                    </div>
                    <CanvasTools
                        panMode={panMode}
                        onPanMode={() => setPanMode((p) => !p)}
                        onZoomIn={() => zoomBy(1.25)}
                        onZoomOut={() => zoomBy(0.8)}
                        onFit={() => fit()}
                        onArrange={() => setArrangeCount((n) => n + 1)}
                        onExport={() => setExportOpen((o) => !o)}
                        exportOpen={exportOpen}
                    />
                    {exportOpen && (
                        <div className="export-menu" role="menu" aria-label="Export the diagram">
                            {(
                                [
                                    ['png', 'all', 'PNG · whole diagram'],
                                    ['png', 'visible', 'PNG · visible area'],
                                    ['svg', 'all', 'SVG · whole diagram'],
                                    ['svg', 'visible', 'SVG · visible area'],
                                ] as const
                            ).map(([format, area, label]) => (
                                <button type="button" role="menuitem" key={label} onClick={() => void exportImage(format, area)}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                    {visible.length === 0 && (
                        <div className="empty">
                            <strong>No matching tables</strong>
                            <span className="muted">Try another search or connection.</span>
                        </div>
                    )}
                    {toast && (
                        <div className="toast" role="status">
                            {toast}
                        </div>
                    )}
                </section>
                <aside ref={details} className="details" aria-label="Selection details">
                    {group.length > 1 ? (
                        <>
                            <span className="tag">SELECTION</span>
                            <h2>{group.length} tables</h2>
                            <p className="muted">Drag one to move them together. Shift-click a table to add or remove it.</p>
                            <ul className="picked-list">
                                {group.map((id) => {
                                    const t = lookup.tables.get(id);
                                    return (
                                        t && (
                                            <li key={id}>
                                                <button type="button" className="detail-link" onClick={() => selectTable(id, true)}>
                                                    {tableLabel(t)}
                                                </button>
                                            </li>
                                        )
                                    );
                                })}
                            </ul>
                        </>
                    ) : selectedTable ? (
                        <TableDetails
                            ctx={ctx}
                            table={selectedTable}
                            edges={edges.filter((e) => e.source === selectedTable.id || e.target === selectedTable.id)}
                            onFocus={() => focusOn(selectedTable.id)}
                            onClear={() => (setSelection(null), setGroup([]))}
                            onSelectEdge={(edge: GraphEdge) => (setSelection({ kind: 'edge', id: edge.id }), setGroup([]))}
                            onSelectTable={(id) => selectTable(id, true)}
                        />
                    ) : selectedEdge ? (
                        <EdgeDetails edge={selectedEdge} ctx={ctx} onSelectTable={(id) => selectTable(id, true)} />
                    ) : (
                        <Guide ctx={ctx} changes={changes} downloads={downloads} onSelectSubject={selectSubject} onShortcuts={() => setShortcuts(true)} />
                    )}
                </aside>
                <Resizer
                        side="left"
                        label="Resize the tables panel"
                        width={() => panels.left ?? browse.current?.getBoundingClientRect().width ?? 250}
                        onResize={(left) => setPanels((p) => ({ ...p, left }))}
                        onReset={() => setPanels((p) => ({ ...p, left: null }))}
                    />
                <Resizer
                        side="right"
                        label="Resize the details panel"
                        width={() => panels.right ?? details.current?.getBoundingClientRect().width ?? 340}
                        onResize={(right) => setPanels((p) => ({ ...p, right }))}
                        onReset={() => setPanels((p) => ({ ...p, right: null }))}
                    />
            </main>
            <footer className="lsv-footer">
                <span className="status" role="status">
                    {statusText}
                </span>
                <span>Laranex Schema Viewer · MIT</span>
            </footer>
            <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
            <Tour open={touring} root={root} onClose={() => setTouring(false)} />
        </div>
    );
}

function CanvasTools({
    panMode,
    onPanMode,
    onZoomIn,
    onZoomOut,
    onFit,
    onArrange,
    onExport,
    exportOpen,
}: {
    panMode: boolean;
    onExport: () => void;
    exportOpen: boolean;
    onPanMode: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFit: () => void;
    onArrange: () => void;
}) {
    const { zoom } = useViewport();
    return (
        <div className="canvas-tools">
            <button type="button" onClick={onPanMode} aria-pressed={!panMode} title={panMode ? 'Select mode: drag the background to select tables' : 'Pan mode: drag the background to move the diagram'}>
                {panMode ? '✥' : '⬚'}
            </button>
            <span className="divider" />
            <button type="button" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out (−)">
                −
            </button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in (+)">
                +
            </button>
            <span className="divider" />
            <button type="button" onClick={onFit} title="Fit to view (F)">
                Fit
            </button>
            <button type="button" onClick={onArrange} title="Reset the layout">
                Arrange
            </button>
            <button type="button" onClick={onExport} aria-expanded={exportOpen} aria-haspopup="menu" title="Export an image (E)">
                Export
            </button>
        </div>
    );
}
