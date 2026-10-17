import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, useStoreApi, useViewport, type EdgeChange, type NodeChange } from '@xyflow/react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { Diagnostic, SchemaDocument, Table } from '../contract/types';
import type { ViewerChange, ViewerDownload } from '../contract/viewer-config';
import { Browse, tableSubtitle, type BrowseMode } from './Browse';
import { ComparePanel, FILTER_PARAM, filtersFrom, type CompareFilters } from './Compare';
import { ChangesPanel, declaredKinds, DiagnosticsPanel, EdgeDetails, Overview, TableDetails, type DetailContext, type ExtensionRenderers } from './Details';
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
    lookup as buildLookup,
    neighbors,
    NOTE,
    within,
    type EdgeKind,
    type Fold,
    type GraphEdge,
} from './graph';
import { ARRANGEMENTS, autoLayout, frameAround, packRegions, type Arrangement, type LayoutRequest, type Positions, type Region } from './layout';
import { Resizer } from './Resizer';
import { route, type Box } from './routing';
import { InferredDetails } from './Inferred';
import { comparisonMarks, inferredByLink, inferredLabel, scopeLabel, type TableMark } from './intelligence';
import { MigrationsPanel } from './Migrations';
import { EdgeMarkers, SchemaEdgeView, type SchemaEdgeType } from './SchemaEdge';
import { SearchBox, type SearchResult } from './Search';
import { ShortcutsDialog } from './Shortcuts';
import { EXTERNAL_HEIGHT, ExternalNodeView, RegionNodeView, TableNodeView, type ExternalNodeType, type RegionNodeType, type TableNodeType } from './TableNode';
import { Tour } from './Tour';
import { useTheme, type Theme } from './theme';
import { Icon, Menu, MenuCheck, MenuItem, MenuLabel, MenuRadio, MenuSeparator, TabList, type TabSpec } from './ui';

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
    // Keep the view in the URL hash (#table=…, #link=…, #inferred=…, #focus=…, #depth=…, #connection=…, #view=compare with
    // #comparison=…, #difference=… and the filters #object=…, #change=…, #severity=…, #certainty=…; #view=migrations with
    // #migration=…) and open on it.
    deepLinks?: boolean;
    // Where Download JSON points; null hides it. By default it downloads the document shown.
    downloadHref?: string | null;
    className?: string;
    // Replaces the ELK layout, for tests and custom placement.
    layout?: (request: LayoutRequest) => Promise<Positions>;
};

type Selection = { kind: 'table' | 'edge' | 'inferred'; id: string } | null;
type Owner = Table['owner']['kind'];
type Tab = 'browse' | 'details' | 'diagnostics' | 'changes' | 'compare' | 'migrations';
const SELECTION_PARAM = { table: 'table', edge: 'link', inferred: 'inferred' } as const;

type FlowNode = TableNodeType | ExternalNodeType | RegionNodeType;

const nodeTypes = { table: TableNodeView, external: ExternalNodeView, region: RegionNodeView };
const minimapClass = (node: FlowNode) => node.type ?? '';
const edgeTypes = { schema: SchemaEdgeView };

const KIND_LABEL: Record<EdgeKind, string> = { both: 'FK + relationship', foreign_key: 'FK only', relationship: 'Relationship only', through: 'Through' };
const OWNER_LABEL: Record<Owner, string> = { application: 'Your tables', framework: 'Framework tables', package: 'Package tables' };
const OWNER_KEY: Record<Owner, string> = { application: 'Y', framework: 'G', package: 'P' };
const FOLD_HINT: Record<Fold, string> = { keys: 'Keys and the columns links use', all: 'Every column of every table', none: 'Only table names, for the big picture' };
const ARRANGE_HINT: Record<Arrangement, string> = {
    'left-right': 'Referenced tables to the left',
    snowflake: 'The most connected tables in the middle',
    compact: 'A tight rectangle, in name order',
};

// The viewer switches to its phone layout by its own width, so it works embedded in a narrow column too.
const NARROW = 760;

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

function useWidth(element: RefObject<HTMLElement | null>): number {
    const [width, setWidth] = useState(() => globalThis.innerWidth ?? 1440);
    useEffect(() => {
        const el = element.current;
        if (!el || typeof ResizeObserver === 'undefined') {
            return;
        }
        const observer = new ResizeObserver(([entry]) => entry.contentRect.width && setWidth(entry.contentRect.width));
        observer.observe(el);
        return () => observer.disconnect();
    }, [element]);
    return width;
}

function toggleIn<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (!next.delete(value)) {
        next.add(value);
    }
    return next;
}

function Viewer({
    document: doc,
    changes,
    downloads,
    editor = null,
    defaultConnection = null,
    extensionRenderers = {},
    title = 'Schema Viewer',
    theme: controlledTheme,
    onThemeChange,
    persistTheme = true,
    deepLinks = true,
    downloadHref,
    className,
    layout = autoLayout,
}: SchemaViewerProps) {
    const flow = useReactFlow();
    const store = useStoreApi();
    const { theme, toggle } = useTheme(controlledTheme, onThemeChange, persistTheme);
    const root = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLElement>(null);
    const panel = useRef<HTMLElement>(null);
    const search = useRef<HTMLInputElement>(null);
    // Opens a table from a reference node; set once openTable exists, so the nodes need not change with it.
    const openRef = useRef<(id: string) => void>(() => undefined);
    const panelId = `lsv${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
    const narrow = useWidth(root) < NARROW;
    const initialHash = useMemo(() => (deepLinks ? readHash() : new URLSearchParams()), [deepLinks]);

    const lookup = useMemo(() => buildLookup(doc), [doc]);
    const edges = useMemo(() => edgesFor(doc, lookup), [doc, lookup]);
    const keys = useMemo(() => keyColumns(doc), [doc]);
    const tables = useMemo(() => doc.connections.flatMap((c) => c.tables.map((table) => ({ table, connection: c }))), [doc]);
    const owners = useMemo(() => new Set(tables.map(({ table }) => table.owner.kind)), [tables]);
    const kindsPresent = useMemo(() => new Set(edges.map((e) => e.kind)), [edges]);
    const pivots = useMemo(() => new Set(doc.relationships.flatMap((r) => (r.pivot ? [r.pivot.table] : []))), [doc]);
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

    const [connection, setConnection] = useState(() => {
        const known = (id: string | null | undefined) => (id && doc.connections.some((c) => c.id === id) ? id : null);
        const wanted = known(initialHash.get('connection')) ?? known(defaultConnection) ?? '';
        // A deep-linked table on another connection opens on its own connection.
        const own = lookup.connectionOf.get(initialHash.get('table') ?? '');
        return wanted && own && own !== wanted ? own : wanted;
    });
    const [kinds, setKinds] = useState<Set<EdgeKind>>(() => new Set(EDGE_KINDS));
    const [fold, setFold] = useState<Fold>('keys');
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const [notes, setNotes] = useState(false);
    const [allLabels, setAllLabels] = useState(true);
    const [grid, setGrid] = useState(true);
    const [hiddenOwners, setHiddenOwners] = useState<Set<Owner>>(() => new Set());
    const [focus, setFocus] = useState<{ id: string; depth: number } | null>(() => {
        const id = initialHash.get('focus');
        return id ? { id, depth: Math.max(1, Math.min(3, Number(initialHash.get('depth')) || 1)) } : null;
    });
    const [selection, setSelection] = useState<Selection>(() => {
        const table = initialHash.get('table');
        const link = initialHash.get('link');
        const inferred = initialHash.get('inferred');
        return table ? { kind: 'table', id: table } : link ? { kind: 'edge', id: link } : inferred ? { kind: 'inferred', id: inferred } : null;
    });
    // The comparison shown in Compare and marked on the diagram, the difference chosen in it, and the migration track.
    const [comparisonId, setComparisonId] = useState<string | null>(() => {
        const id = initialHash.get('comparison');
        return doc.comparisons.some((c) => c.id === id) ? id : null;
    });
    const [differenceId, setDifferenceId] = useState<string | null>(() => initialHash.get('difference'));
    const [trackId, setTrackId] = useState<string | null>(() => {
        const id = initialHash.get('migration');
        return doc.migrations.some((t) => t.id === id) ? id : null;
    });
    const [compareFilters, setCompareFilters] = useState<CompareFilters>(() => filtersFrom(initialHash));
    const [overlay, setOverlay] = useState(true);
    const [showInferred, setShowInferred] = useState(true);
    const [browseMode, setBrowseMode] = useState<BrowseMode>('tables');
    const [column, setColumn] = useState<string | null>(null);
    // Tables picked together with Shift: dragged together, listed together.
    const [group, setGroup] = useState<string[]>([]);
    const groupRef = useRef(group);
    groupRef.current = group;
    const [tab, setTab] = useState<Tab>(() => {
        const view = initialHash.get('view');
        if (view === 'compare' && doc.comparisons.length) {
            return 'compare';
        }
        if (view === 'migrations' && doc.migrations.length) {
            return 'migrations';
        }
        return initialHash.get('table') || initialHash.get('link') || initialHash.get('inferred') ? 'details' : 'browse';
    });
    const comparison = doc.comparisons.find((c) => c.id === comparisonId) ?? doc.comparisons[0];
    const marks = useMemo(() => (overlay ? comparisonMarks(comparison) : new Map<string, TableMark>()), [overlay, comparison]);
    const inferredLinks = useMemo(() => inferredByLink(doc), [doc]);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [notice, setNotice] = useState(true);
    const [arrangement, setArrangement] = useState<Arrangement>('left-right');
    const [arrangeCount, setArrangeCount] = useState(0);
    const [positions, setPositions] = useState<Positions>({});
    const [regions, setRegions] = useState<Region[]>([]);
    const [dragging, setDragging] = useState<Record<string, { x: number; y: number }>>({});
    const [phase, setPhase] = useState<'arranging' | 'ready' | 'error'>('arranging');
    const [layoutError, setLayoutError] = useState<string | null>(null);
    const [panMode, setPanMode] = useState(true);
    const [spacePan, setSpacePan] = useState(false);
    const [shortcuts, setShortcuts] = useState(false);
    const [touring, setTouring] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [panelWidth, setPanelWidth] = useState<number | null>(null);
    const [menu, setMenu] = useState<string | null>(null);
    const menuProps = (name: string) => ({ open: menu === name, onOpenChange: (open: boolean) => setMenu(open ? name : null) });

    // On a phone, a deep link to a table, line, association or view opens the sheet on its tab.
    useLayoutEffect(() => {
        const width = root.current?.getBoundingClientRect().width ?? 0;
        if (width > 0 && width < NARROW && ['table', 'link', 'inferred', 'view'].some((key) => initialHash.get(key))) {
            setSheetOpen(true);
        }
        // Only the link the viewer opened on counts.
    }, []);

    // The phone note gives way once the sheet is in use.
    useEffect(() => {
        if (sheetOpen) {
            setNotice(false);
        }
    }, [sheetOpen]);

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
            params.set(SELECTION_PARAM[selection.kind], selection.id);
        }
        if (tab === 'compare' && comparison) {
            params.set('view', 'compare');
        }
        if (tab === 'migrations') {
            params.set('view', 'migrations');
            if (trackId) {
                params.set('migration', trackId);
            }
        }
        // The comparison is kept while it is shown, or marked on the diagram when it is not the first.
        if (comparison && (tab === 'compare' || (overlay && comparison !== doc.comparisons[0]))) {
            params.set('comparison', comparison.id);
            if (differenceId && comparison.differences.some((d) => d.id === differenceId)) {
                params.set('difference', differenceId);
            }
        }
        if (tab === 'compare' && comparison) {
            for (const [key, name] of Object.entries(FILTER_PARAM) as [keyof CompareFilters, string][]) {
                if (compareFilters[key]) {
                    params.set(name, compareFilters[key]);
                }
            }
        }
        const hash = params.toString();
        if (hash !== location.hash.slice(1)) {
            history.replaceState(null, '', `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`);
        }
    }, [deepLinks, connection, focus, selection, tab, comparison, differenceId, trackId, overlay, doc, compareFilters]);

    // A folded card still shows the columns the marked comparison names, as it shows drifted ones.
    const rows = useMemo(
        () =>
            new Map(
                tables.map(({ table }) => {
                    const compared = marks.get(table.id)?.columns;
                    const shown = compared?.size ? new Set([...(keys.get(table.id) ?? []), ...compared.keys()]) : keys.get(table.id);
                    return [table.id, collapsed.has(table.id) ? [] : cardRows(table, fold, shown, notes)];
                }),
            ),
        [tables, fold, keys, notes, collapsed, marks],
    );
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

    // The tables shown: connection, ownership and focus.
    const visible = useMemo(() => {
        const near = focus ? within(focus.id, edges, focus.depth) : null;
        return tables.filter(({ table, connection: c }) => (!connection || c.id === connection) && !hiddenOwners.has(table.owner.kind) && (!near || near.has(table.id)));
    }, [tables, connection, hiddenOwners, focus, edges]);
    const visibleIds = useMemo(() => new Set(visible.map(({ table }) => table.id)), [visible]);
    // With one connection shown, the tables of other connections that its relationships reach: drawn as references,
    // so a cross-connection relationship never silently disappears. Table id to connection id.
    const externals = useMemo(() => {
        const out = new Map<string, string>();
        if (!connection) {
            return out;
        }
        for (const e of edges) {
            if (!kinds.has(e.kind)) {
                continue;
            }
            for (const [here, there] of [
                [e.source, e.target],
                [e.target, e.source],
            ]) {
                const other = lookup.connectionOf.get(there);
                if (visibleIds.has(here) && other !== undefined && other !== connection) {
                    out.set(there, other);
                }
            }
        }
        return out;
    }, [connection, edges, kinds, visibleIds, lookup]);
    const shownEdges = useMemo(() => {
        const drawn = (id: string) => visibleIds.has(id) || externals.has(id);
        return edges.filter((e) => kinds.has(e.kind) && drawn(e.source) && drawn(e.target) && (visibleIds.has(e.source) || visibleIds.has(e.target)));
    }, [edges, visibleIds, externals, kinds]);
    const sizeOf = useCallback((id: string) => (externals.has(id) ? EXTERNAL_HEIGHT : heights[id]), [externals, heights]);
    // With every connection shown, one group per connection with tables in view, each framed in its own region.
    const groups = useMemo(() => {
        if (connection || doc.connections.length < 2) {
            return null;
        }
        const byConnection = doc.connections.map((c) => ({ connection: c.id, ids: visible.filter((v) => v.connection.id === c.id).map((v) => v.table.id) })).filter((g) => g.ids.length > 0);
        return byConnection.length > 1 ? byConnection : null;
    }, [connection, doc, visible]);

    const fit = useCallback(
        (ids?: string[]) => {
            const nodes = (ids ?? [...visibleIds, ...externals.keys()]).map((id) => ({ id }));
            if (nodes.length) {
                void flow.fitView({ nodes, padding: 0.12, maxZoom: 1.2, minZoom: 0.05 });
            }
        },
        [flow, visibleIds, externals],
    );

    const placedIds = useMemo(() => [...visible.map(({ table }) => table.id), ...externals.keys()], [visible, externals]);
    const layoutEdges = useMemo(() => edges.map((e) => ({ id: e.id, source: e.source, target: e.target })), [edges]);
    const pendingFit = useRef(false);
    // Card heights are read when the layout runs, not watched: folding or unfolding one card keeps every position, dragged
    // ones included, as in Laravel Schema Viewer. Folding every card (Columns), notes and comparison marks arrange again.
    const sizeRef = useRef(sizeOf);
    sizeRef.current = sizeOf;
    useEffect(() => {
        let cancelled = false;
        setPhase('arranging');
        const box = canvas.current?.getBoundingClientRect();
        const aspect = box && box.height > 0 ? Math.max(0.5, Math.min(2.4, box.width / box.height)) : 1.6;
        const sizes = Object.fromEntries(placedIds.map((id) => [id, sizeRef.current(id)]));
        const request = (ids: string[]): LayoutRequest => ({ ids, heights: Object.fromEntries(ids.map((id) => [id, sizes[id]])), edges: layoutEdges, arrangement, aspect });
        const arranged = groups
            ? Promise.all(groups.map((g) => layout(request(g.ids)).then((positions) => ({ connection: g.connection, positions })))).then((blocks) => packRegions(blocks, sizes, aspect))
            : layout(request(placedIds)).then((positions) => ({ positions, regions: [] as Region[] }));
        arranged
            .then((result) => {
                if (cancelled) {
                    return;
                }
                setPositions(result.positions);
                setRegions(result.regions);
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
    }, [placedIds, groups, layoutEdges, arrangement, arrangeCount, layout, notes, marks]);

    const related = useMemo(() => {
        if (group.length > 1) {
            return new Set(group);
        }
        if (selection?.kind === 'table') {
            return neighbors(selection.id, shownEdges);
        }
        if (selection?.kind === 'inferred') {
            const a = doc.inferredAssociations.find((x) => x.id === selection.id);
            return new Set(a ? [a.table, a.relatedTable, ...(a.via ? [a.via] : [])] : []);
        }
        const edge = selection && edges.find((e) => e.id === selection.id);
        return new Set(edge ? [edge.source, edge.target, ...(edge.derived?.via ?? [])] : []);
    }, [selection, shownEdges, edges, group, doc]);
    // The links an inferred association rests on, while it is selected.
    const inferredSelected = useMemo(() => new Set(selection?.kind === 'inferred' ? (doc.inferredAssociations.find((a) => a.id === selection.id)?.links ?? []) : []), [selection, doc]);

    // Columns to highlight: those on the selected table's links, the selected link's, or a chosen column.
    const highlighted = useMemo(() => {
        const map = new Map<string, Set<string>>();
        const add = (table: string, columns: string[]) => {
            const set = map.get(table) ?? new Set<string>();
            columns.forEach((c) => set.add(c));
            map.set(table, set);
        };
        const linked =
            selection?.kind === 'table'
                ? shownEdges.filter((e) => e.source === selection.id || e.target === selection.id)
                : selection?.kind === 'edge'
                  ? edges.filter((e) => e.id === selection.id)
                  : edges.filter((e) => inferredSelected.has(e.id));
        for (const e of linked) {
            if (e.link) {
                add(e.link.from.table, e.link.from.columns);
                add(e.link.to.table, e.link.to.columns);
            }
        }
        if (column && selection?.kind === 'table') {
            add(selection.id, [column]);
        }
        return map;
    }, [selection, shownEdges, edges, column, inferredSelected]);

    const center = useCallback(
        (id: string) => {
            const position = positions[id];
            const box = canvas.current?.getBoundingClientRect();
            if (position && box) {
                const zoom = narrow ? 0.7 : 0.9;
                void flow.setViewport({ x: box.width / 2 - (position.x + CARD_WIDTH / 2) * zoom, y: Math.min(70, box.height / 4) - position.y * zoom, zoom }, { duration: 200 });
            }
        },
        [flow, positions, narrow],
    );
    const selectTable = useCallback(
        (id: string, centered = false) => {
            setSelection({ kind: 'table', id });
            setGroup([id]);
            setColumn(null);
            setTab('details');
            if (centered) {
                center(id);
            }
        },
        [center],
    );
    const selectEdge = useCallback((edge: GraphEdge) => {
        setSelection({ kind: 'edge', id: edge.id });
        setGroup([]);
        setColumn(null);
        setTab('details');
    }, []);
    const selectInferred = (id: string) => {
        const a = doc.inferredAssociations.find((x) => x.id === id);
        if (!a) {
            return;
        }
        reveal(a.table);
        setSelection({ kind: 'inferred', id });
        setGroup([]);
        setColumn(null);
        setTab('details');
        if (narrow) {
            setSheetOpen(true);
        }
    };
    const focusOn = useCallback((id: string) => {
        setSelection({ kind: 'table', id });
        setGroup([id]);
        setFocus((f) => ({ id, depth: f?.depth ?? 1 }));
    }, []);
    // A table in another connection, a hidden group, or outside focus is shown before it is opened.
    const reveal = useCallback(
        (id: string) => {
            const entry = tables.find(({ table }) => table.id === id);
            if (!entry) {
                return;
            }
            if (connection && entry.connection.id !== connection) {
                setConnection(entry.connection.id);
            }
            if (hiddenOwners.has(entry.table.owner.kind)) {
                setHiddenOwners((o) => new Set([...o].filter((x) => x !== entry.table.owner.kind)));
            }
            if (focus && !within(focus.id, edges, focus.depth).has(id)) {
                setFocus(null);
            }
        },
        [tables, connection, hiddenOwners, focus, edges],
    );
    const openTable = (id: string, columnName: string | null = null) => {
        reveal(id);
        selectTable(id, true);
        setColumn(columnName);
        if (narrow) {
            setSheetOpen(true);
        }
    };
    openRef.current = (id: string) => openTable(id);
    const pickResult = (r: SearchResult) => {
        if (r.kind === 'table') {
            openTable(r.id);
        } else if (r.kind === 'column') {
            openTable(r.id, r.column);
        } else if (r.kind === 'model') {
            if (r.table) {
                openTable(r.table);
            }
        } else {
            const edge = edges.find((e) => e.link?.relationships.includes(r.id) || e.derived?.relationship === r.id);
            if (edge) {
                reveal(edge.source);
                selectEdge(edge);
                if (narrow) {
                    setSheetOpen(true);
                }
            } else {
                openTable(r.table);
            }
        }
    };

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
    const toggleCard = useCallback((id: string) => setCollapsed((c) => toggleIn(c, id)), []);
    const empty = useMemo(() => new Set<string>(), []);
    const nodeData = useMemo(() => {
        const data = new Map<string, TableNodeType['data']>();
        for (const { table, connection: c } of visible) {
            data.set(table.id, {
                table,
                connection: lookup.qualified ? c.name : null,
                subtitle: tableSubtitle(doc, table),
                rows: rows.get(table.id) ?? [],
                state: selection?.kind === 'table' && selection.id === table.id ? 'selected' : related.has(table.id) ? 'related' : 'none',
                picked: group.length > 1 && picked.has(table.id),
                issues: issues.counts.get(table.id) ?? 0,
                combined,
                pivot: pivots.has(table.id),
                collapsed: collapsed.has(table.id),
                highlighted: highlighted.get(table.id) ?? empty,
                mark: marks.get(table.id) ?? null,
                onSelect: (id) => selectTable(id),
                onFocus: focusOn,
                onToggle: toggleCard,
            });
        }
        return data;
    }, [doc, lookup, visible, rows, selection, related, issues, combined, group, picked, pivots, collapsed, highlighted, marks, empty, selectTable, focusOn, toggleCard]);

    // Each connection's frame, around its cards where they are now, so it follows a dragged table.
    const frames = useMemo(
        () =>
            regions.map((r) => {
                const boxes = visible.flatMap(({ table, connection: c }) => {
                    const p = c.id === r.connection ? (dragging[table.id] ?? positions[table.id]) : undefined;
                    return p ? [{ x: p.x, y: p.y, height: heights[table.id] }] : [];
                });
                return boxes.length ? frameAround(r.connection, boxes) : r;
            }),
        [regions, visible, positions, dragging, heights],
    );

    const openExternal = useCallback((id: string) => openRef.current(id), []);
    const nodes = useMemo<FlowNode[]>(
        () => [
            ...frames.map(
                (r): RegionNodeType => ({
                    id: `lsv-region:${r.connection}`,
                    type: 'region',
                    position: { x: r.x, y: r.y },
                    width: r.width,
                    height: r.height,
                    zIndex: -1,
                    draggable: false,
                    selectable: false,
                    focusable: false,
                    data: {
                        connection: lookup.connections.get(r.connection)?.name ?? r.connection,
                        driver: lookup.connections.get(r.connection)?.driver ?? null,
                        tables: visible.filter((v) => v.connection.id === r.connection).length,
                    },
                }),
            ),
            ...visible
                .filter(({ table }) => positions[table.id])
                .map(
                    ({ table }): TableNodeType => ({
                        id: table.id,
                        type: 'table',
                        position: dragging[table.id] ?? positions[table.id],
                        data: nodeData.get(table.id) as TableNodeType['data'],
                        dragHandle: spacePan ? '.no-drag-while-panning' : '.table-title',
                        selected: picked.has(table.id),
                        width: CARD_WIDTH,
                        height: heights[table.id],
                        ariaLabel: `Table ${lookup.label(table.id)}`,
                    }),
                ),
            ...[...externals]
                .filter(([id]) => positions[id] && lookup.tables.has(id))
                .map(
                    ([id, c]): ExternalNodeType => ({
                        id,
                        type: 'external',
                        position: positions[id],
                        draggable: false,
                        selectable: false,
                        width: CARD_WIDTH,
                        height: EXTERNAL_HEIGHT,
                        ariaLabel: `Table ${lookup.label(id)}, on another connection`,
                        data: {
                            tableId: id,
                            table: lookup.tables.get(id) as Table,
                            connection: lookup.connections.get(c)?.name ?? c,
                            driver: lookup.connections.get(c)?.driver ?? null,
                            state: related.has(id) ? 'related' : 'none',
                            onOpen: openExternal,
                        },
                    }),
                ),
        ],
        [frames, visible, externals, positions, dragging, nodeData, picked, heights, spacePan, lookup, related, openExternal],
    );

    // Routes over settled positions; edges touching a card being dragged float until it is dropped.
    const inferredOn = useCallback((e: GraphEdge) => showInferred && !!e.link && inferredLinks.has(e.link.id), [showInferred, inferredLinks]);
    const labelled = useCallback(
        (e: GraphEdge) =>
            (allLabels ? e.kind !== 'foreign_key' || inferredOn(e) : selection?.kind === 'table' && (e.source === selection.id || e.target === selection.id)) || e.id === selection?.id || inferredSelected.has(e.id),
        [allLabels, selection, inferredOn, inferredSelected],
    );
    const routes = useMemo(() => {
        const boxes = new Map<string, Box>();
        for (const { table } of visible) {
            const p = positions[table.id];
            if (p) {
                boxes.set(table.id, { id: table.id, x: p.x, y: p.y, width: CARD_WIDTH, height: heights[table.id], rows: rows.get(table.id) ?? [] });
            }
        }
        for (const id of externals.keys()) {
            const p = positions[id];
            if (p) {
                boxes.set(id, { id, x: p.x, y: p.y, width: CARD_WIDTH, height: EXTERNAL_HEIGHT, rows: [] });
            }
        }
        return route(
            boxes,
            shownEdges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceColumn: e.sourceColumn, targetColumn: e.targetColumn, labelled: labelled(e) })),
        );
    }, [visible, externals, positions, heights, rows, shownEdges, labelled]);

    const flowEdges = useMemo<SchemaEdgeType[]>(
        () =>
            shownEdges
                .filter((e) => positions[e.source] && positions[e.target])
                .map((e) => {
                    const selected = (selection?.kind === 'edge' && selection.id === e.id) || inferredSelected.has(e.id);
                    const inferred = inferredOn(e) ? (inferredLinks.get(e.link?.id ?? '') ?? []) : [];
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
                            crossConnection: e.crossConnection,
                            inferred: inferred.length > 0,
                            label: inferred.length ? `${inferred.map((a) => inferredLabel(lookup, a)).join(' · ')}` : e.label,
                            chip: inferred.length ? `${e.chip} · inferred` : e.chip,
                            route: dragging[e.source] || dragging[e.target] ? null : (routes.get(e.id) ?? null),
                            showLabel: labelled(e),
                            state: selected ? 'selected' : near ? 'related' : 'none',
                        },
                    };
                }),
        [shownEdges, positions, selection, dragging, routes, labelled, group, picked, inferredOn, inferredLinks, inferredSelected, lookup],
    );

    // React Flow reports selection as separate node and edge changes, and a box selection also picks the edges between
    // the tables it covers. The changes of one gesture are collected and resolved once: tables win over edges, so the
    // two never undo each other.
    const selectionRef = useRef(selection);
    selectionRef.current = selection;
    const pending = useRef<{ added: string[]; removed: string[]; edge: string | null; scheduled: boolean }>({ added: [], removed: [], edge: null, scheduled: false });
    const resolveSelection = useCallback(() => {
        const { added, removed, edge } = pending.current;
        pending.current = { added: [], removed: [], edge: null, scheduled: false };
        const g = groupRef.current;
        const next = [...g.filter((id) => !removed.includes(id)), ...added.filter((id) => !g.includes(id))];
        if (added.length || (removed.length && next.length)) {
            groupRef.current = next;
            setGroup(next);
            setColumn(null);
            setSelection({ kind: 'table', id: added[added.length - 1] ?? next[next.length - 1] });
            setTab('details');
        } else if (edge) {
            groupRef.current = [];
            setGroup([]);
            setColumn(null);
            setSelection({ kind: 'edge', id: edge });
            setTab('details');
        } else if (removed.length && selectionRef.current?.kind === 'table') {
            groupRef.current = [];
            setGroup([]);
            setSelection(null);
        }
    }, []);
    const schedule = useCallback(() => {
        if (!pending.current.scheduled) {
            pending.current.scheduled = true;
            queueMicrotask(resolveSelection);
        }
    }, [resolveSelection]);

    const onNodesChange = useCallback(
        (changes: NodeChange<FlowNode>[]) => {
            for (const change of changes) {
                if (change.type === 'select') {
                    (change.selected ? pending.current.added : pending.current.removed).push(change.id);
                    schedule();
                } else if (change.type === 'position' && change.position && change.dragging) {
                    const { id, position } = change;
                    setDragging((d) => ({ ...d, [id]: position }));
                }
            }
        },
        [schedule],
    );

    const onEdgesChange = useCallback(
        (changes: EdgeChange<SchemaEdgeType>[]) => {
            for (const change of changes) {
                if (change.type === 'select' && change.selected) {
                    pending.current.edge = change.id;
                    schedule();
                }
            }
        },
        [schedule],
    );

    // Back to the hand tool: drop React Flow's selection box, which would otherwise catch the next drag.
    const usePan = (pan: boolean) => {
        setPanMode(pan);
        if (pan) {
            store.setState({ nodesSelectionActive: false, userSelectionActive: false, userSelectionRect: null });
        }
    };

    // Dropping cards commits their positions, and the routes follow.
    const onNodeDragStop = useCallback((_: unknown, _node: FlowNode, moved: FlowNode[]) => {
        setPositions((p) => ({ ...p, ...Object.fromEntries(moved.map((n) => [n.id, n.position])) }));
        setDragging((d) => Object.fromEntries(Object.entries(d).filter(([id]) => !moved.some((n) => n.id === id))));
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

    const stepConnection = (by: number) => {
        const ids = ['', ...doc.connections.map((c) => c.id)];
        setFocus(null);
        setConnection((c) => ids[(ids.indexOf(c) + by + ids.length) % ids.length]);
    };
    const copyLink = () => {
        void navigator.clipboard?.writeText(location.href).then(
            () => setToast('Link copied'),
            () => setToast('Could not copy the link'),
        );
    };
    const openTab = (next: Tab) => {
        setTab(next);
        if (narrow) {
            setSheetOpen(true);
        }
    };

    // What the diagram shows, as an image model: cards where they are and edges along their routes.
    const imageModel = (): ImageModel => {
        const imageNodes = visible
            .filter(({ table }) => positions[table.id])
            .map(({ table }) => {
                const p = dragging[table.id] ?? positions[table.id];
                const marks = columnMarks(table);
                const byName = new Map(table.columns.map((col) => [col.name, col]));
                const shown = rows.get(table.id) ?? [];
                return {
                    x: p.x,
                    y: p.y,
                    width: CARD_WIDTH,
                    height: heights[table.id],
                    title: lookup.label(table.id),
                    subtitle: tableSubtitle(doc, table),
                    rows: shown.map((r) => {
                        if (isNote(r)) {
                            return { note: true, key: '', name: (r === NOTE ? table.note : byName.get(r.slice(NOTE.length))?.note) ?? '', type: '', flag: null };
                        }
                        const col = byName.get(r);
                        const flag = col?.drift?.length ? ('drift' as const) : combined && col?.provenance.length === 1 && col.provenance[0] === 'declared' ? ('declared-only' as const) : null;
                        return { note: false, key: marks.get(r) ?? '', name: `${r}${col?.nullable ? '?' : ''}`, type: col?.typeName ?? col?.type ?? '', flag };
                    }),
                    more: table.columns.length - shown.filter((r) => !isNote(r)).length,
                    declaredOnly: combined && table.provenance.length === 1 && table.provenance[0] === 'declared',
                };
            });
        const referenceNodes = [...externals]
            .filter(([id]) => positions[id] && lookup.tables.has(id))
            .map(([id, c]) => ({
                x: positions[id].x,
                y: positions[id].y,
                width: CARD_WIDTH,
                height: EXTERNAL_HEIGHT,
                title: lookup.label(id),
                subtitle: `On connection ${lookup.connections.get(c)?.name ?? c}`,
                rows: [],
                more: 0,
                declaredOnly: false,
                external: true,
            }));
        const imageFrames = frames.map((r) => ({
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            title: lookup.connections.get(r.connection)?.name ?? r.connection,
            meta: `${lookup.connections.get(r.connection)?.driver ?? 'unknown driver'} · ${visible.filter((v) => v.connection.id === r.connection).length} tables`,
        }));
        const allNodes = [...imageNodes, ...referenceNodes];
        const imageEdges = shownEdges.flatMap((e) => {
            const r = routes.get(e.id);
            return r ? [{ kind: e.kind, declaredOnly: e.declaredOnly, sx: r.sx, sy: r.sy, cx: r.channelX, tx: r.tx, ty: r.ty, label: labelled(e) ? { x: r.labelX, y: r.labelY, text: e.label } : null }] : [];
        });
        return { nodes: allNodes, edges: imageEdges, frames: imageFrames, bounds: boundsOf([...allNodes, ...imageFrames]) };
    };
    const exportImage = async (format: 'png' | 'svg', area: 'all' | 'visible') => {
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
    const downloadDocument = () => {
        if (downloadHref) {
            const a = document.createElement('a');
            a.href = downloadHref;
            a.download = 'schema-viewer.json';
            a.click();
            return;
        }
        save(new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' }), 'schema-viewer.json');
    };

    // Shortcuts work while the viewer has focus or nothing else does, and never while typing.
    const actions = useRef<Record<string, () => void>>({});
    actions.current = {
        f: () => fit(),
        '0': () => fit(),
        '+': () => zoomBy(1.2),
        '=': () => zoomBy(1.2),
        '-': () => zoomBy(1 / 1.2),
        c: () => (setFold((f) => FOLDS[(FOLDS.findIndex((x) => x.value === f) + 1) % FOLDS.length].value), setCollapsed(new Set()), setArrangeCount((n) => n + 1)),
        C: copyLink,
        F: () => (focus ? setFocus(null) : selection?.kind === 'table' && focusOn(selection.id)),
        n: () => setNotes((n) => !n),
        l: () => setAllLabels((l) => !l),
        '1': () => setKinds((k) => toggleIn(k, 'both')),
        '2': () => setKinds((k) => toggleIn(k, 'foreign_key')),
        '3': () => setKinds((k) => toggleIn(k, 'relationship')),
        '4': () => setKinds((k) => toggleIn(k, 'through')),
        '5': () => setShowInferred((v) => !v),
        y: () => setHiddenOwners((o) => toggleIn(o, 'application')),
        g: () => setHiddenOwners((o) => toggleIn(o, 'framework')),
        p: () => setHiddenOwners((o) => toggleIn(o, 'package')),
        '[': () => stepConnection(-1),
        ']': () => stepConnection(1),
        a: () => openTab('browse'),
        d: () => openTab('details'),
        h: () => openTab('diagnostics'),
        w: () => {
            if (changes?.length) {
                openTab('changes');
            }
        },
        x: () => {
            if (doc.comparisons.length) {
                openTab('compare');
            }
        },
        m: () => {
            if (doc.migrations.length) {
                openTab('migrations');
            }
        },
        s: () => setShortcuts(true),
        e: () => setMenu(narrow ? 'more' : 'download'),
        '?': () => setTouring(true),
    };
    useEffect(() => {
        const down = (event: globalThis.KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = !!target?.closest?.('input, select, textarea, [contenteditable="true"]');
            const ours = !(target instanceof Element) || target === document.body || !!root.current?.contains(target);
            if (event.key === 'Escape') {
                if (ours && !typing) {
                    setMenu(null);
                    setFocus(null);
                    setSelection(null);
                    setGroup([]);
                    setColumn(null);
                    setSheetOpen(false);
                }
                return;
            }
            if (typing || !ours || event.metaKey || event.ctrlKey || event.altKey) {
                return;
            }
            if (event.key === '/') {
                event.preventDefault();
                search.current?.focus();
            } else if (event.key === ' ' && !target?.closest?.('button, [role="menuitem"], [role="tab"]')) {
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

    const selectedTable = selection?.kind === 'table' ? lookup.tables.get(selection.id) : undefined;
    const selectedEdge = selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) : undefined;
    const selectedInferred = selection?.kind === 'inferred' ? doc.inferredAssociations.find((a) => a.id === selection.id) : undefined;
    const showComparison = (comparisonId: string, difference: string | null) => {
        setComparisonId(comparisonId);
        setDifferenceId(difference);
        openTab('compare');
    };
    const showTrack = (id: string) => {
        setTrackId(id);
        openTab('migrations');
    };
    const showInferredList = () => {
        setBrowseMode('inferred');
        openTab('browse');
    };
    const declares = useMemo(() => declaredKinds(doc), [doc]);
    const ctx: DetailContext = { doc, lookup, editor, renderers: extensionRenderers, declares };
    const panning = panMode || spacePan || narrow;
    const statusText = phase === 'error' ? `Could not lay out the diagram: ${layoutError}` : phase === 'arranging' ? `Arranging ${visible.length} tables…` : null;

    const tabs: TabSpec<Tab>[] = [
        { value: 'browse', label: 'Browse', icon: 'tables' },
        { value: 'details', label: 'Details', icon: 'details' },
        { value: 'diagnostics', label: 'Diagnostics', icon: 'warning', count: doc.diagnostics.length, tone: 'warning' },
        ...(changes && changes.length ? [{ value: 'changes' as const, label: 'Changes', icon: 'changes' as const, count: changes.length }] : []),
        ...(doc.comparisons.length
            ? [
                  {
                      value: 'compare' as const,
                      label: 'Compare',
                      icon: 'compare' as const,
                      badge: comparison && !comparison.complete && (
                          <>
                              <span className="tab__count tab__count--warning" aria-hidden="true" title="Incomplete comparison">
                                  !
                              </span>
                              <span className="sr-only">{' (incomplete)'}</span>
                          </>
                      ),
                  },
              ]
            : []),
        ...(doc.migrations.length ? [{ value: 'migrations' as const, label: 'Migrations', icon: 'migrations' as const }] : []),
    ];

    const downloadMenu = (
        <>
            <MenuLabel>Snapshot</MenuLabel>
            {downloadHref !== null && <MenuItem onSelect={downloadDocument}>JSON document</MenuItem>}
            {(downloads ?? []).map((d) => (
                <MenuItem key={d.filename} onSelect={() => save(new Blob([d.content], { type: d.mediaType }), d.filename)}>
                    {d.label}
                </MenuItem>
            ))}
            <MenuSeparator />
            <MenuLabel>Image</MenuLabel>
            <MenuItem onSelect={() => void exportImage('png', 'all')}>PNG · whole diagram</MenuItem>
            <MenuItem onSelect={() => void exportImage('png', 'visible')}>PNG · visible area</MenuItem>
            <MenuItem onSelect={() => void exportImage('svg', 'all')}>SVG · whole diagram</MenuItem>
            <MenuItem onSelect={() => void exportImage('svg', 'visible')}>SVG · visible area</MenuItem>
        </>
    );

    const panelBody = (
        <div className="panel__body" role="tabpanel" id={`${panelId}-panel-${tab}`} aria-labelledby={`${panelId}-tab-${tab}`}>
            {tab === 'browse' && (
                <Browse
                    doc={doc}
                    lookup={lookup}
                    tables={visible}
                    edges={shownEdges}
                    issues={issues.counts}
                    selected={selection?.kind === 'table' ? selection.id : null}
                    several={doc.connections.length > 1}
                    onTable={(id) => openTable(id)}
                    onEdge={(edge) => selectEdge(edge)}
                    onColumn={(table, name) => openTable(table, name)}
                    onInferred={selectInferred}
                    selectedInferred={selection?.kind === 'inferred' ? selection.id : null}
                    mode={browseMode}
                    onMode={setBrowseMode}
                />
            )}
            {tab === 'details' &&
                (group.length > 1 ? (
                    <>
                        <h2>{group.length} tables</h2>
                        <p className="muted">Drag one to move them together. Shift-click a table to add or remove it.</p>
                        <ul className="picked-list">
                            {group.map((id) => {
                                const t = lookup.tables.get(id);
                                return (
                                    t && (
                                        <li key={id}>
                                            <button type="button" className="link-button" onClick={() => selectTable(id, true)}>
                                                {lookup.label(id)}
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
                        onClear={() => (setSelection(null), setGroup([]), setColumn(null))}
                        onCopyLink={copyLink}
                        onSelectEdge={selectEdge}
                        onSelectTable={(id) => openTable(id)}
                        onCompare={showComparison}
                        onInferred={selectInferred}
                        onMigration={showTrack}
                    />
                ) : selectedEdge ? (
                    <EdgeDetails edge={selectedEdge} ctx={ctx} onSelectTable={(id) => openTable(id)} onInferred={selectInferred} />
                ) : selectedInferred ? (
                    <InferredDetails association={selectedInferred} doc={doc} lookup={lookup} edges={edges} onSelectTable={(id) => openTable(id)} onSelectEdge={selectEdge} />
                ) : (
                    <Overview
                        ctx={ctx}
                        onShortcuts={() => setShortcuts(true)}
                        onTour={() => setTouring(true)}
                        onCompare={() => openTab('compare')}
                        onMigrations={() => openTab('migrations')}
                        onInferred={showInferredList}
                    />
                ))}
            {tab === 'diagnostics' && (
                <DiagnosticsPanel
                    doc={doc}
                    lookup={lookup}
                    tableOf={issues.tableOf}
                    onShow={(id) => openTable(id)}
                    onSubject={{ comparison: (id) => showComparison(id, null), migration: showTrack, inferredAssociation: selectInferred }}
                />
            )}
            {tab === 'changes' && changes && <ChangesPanel changes={changes} />}
            {tab === 'compare' && comparison && (
                <ComparePanel
                    doc={doc}
                    lookup={lookup}
                    comparison={comparison}
                    difference={differenceId}
                    overlay={overlay}
                    onOverlay={setOverlay}
                    onComparison={(id) => (setComparisonId(id), setDifferenceId(null))}
                    onDifference={setDifferenceId}
                    onShowTable={(id, name) => openTable(id, name)}
                    filters={compareFilters}
                    onFilters={setCompareFilters}
                />
            )}
            {tab === 'migrations' && <MigrationsPanel doc={doc} lookup={lookup} selected={trackId} onSelect={setTrackId} onShowTable={(id) => openTable(id)} />}
        </div>
    );

    const sheetTitle = selectedTable ? lookup.label(selectedTable.id) : selectedEdge ? selectedEdge.label : selectedInferred ? `${inferredLabel(lookup, selectedInferred)} (inferred)` : 'Tap a table or a line';

    return (
        <div
            ref={root}
            className={`lsv${narrow ? ' narrow' : ''}${panMode ? ' pan-mode' : ''}${spacePan ? ' space-pan' : ''}${className ? ` ${className}` : ''}`}
            data-theme={theme}
            data-loaded={phase === 'ready' ? 'true' : phase === 'error' ? 'error' : 'false'}
            style={panelWidth !== null ? ({ '--lsv-panel': `${panelWidth}px` } as CSSProperties) : undefined}
        >
            <header className="lsv-header">
                <div className="brand">
                    <span className="brand-mark" aria-hidden="true">
                        L
                    </span>
                    {!narrow && <h1>{title}</h1>}
                </div>
                <SearchBox ref={search} doc={doc} lookup={lookup} onPick={pickResult} placeholder={narrow ? 'Search the schema' : undefined} />
                {narrow ? (
                    <Menu label="More" trigger={<Icon name="more" />} placement="below" align="end" className="header-menu icon-only" {...menuProps('more')}>
                        {doc.connections.length > 1 && (
                            <>
                                <MenuLabel>Connection</MenuLabel>
                                <MenuRadio checked={connection === ''} onSelect={() => (setFocus(null), setConnection(''))}>
                                    All connections
                                </MenuRadio>
                                {doc.connections.map((c) => (
                                    <MenuRadio key={c.id} checked={connection === c.id} onSelect={() => (setFocus(null), setConnection(c.id))} hint={c.driver ?? undefined}>
                                        {c.name}
                                    </MenuRadio>
                                ))}
                                <MenuSeparator />
                            </>
                        )}
                        {downloadMenu}
                        <MenuSeparator />
                        <MenuItem onSelect={toggle}>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</MenuItem>
                        <MenuItem onSelect={() => setShortcuts(true)}>Shortcuts</MenuItem>
                        <MenuItem onSelect={() => setTouring(true)}>Take the tour</MenuItem>
                    </Menu>
                ) : (
                    <div className="actions">
                        {doc.connections.length > 1 && (
                            <select className="connection" value={connection} onChange={(e) => (setFocus(null), setConnection(e.target.value))} aria-label="Connection">
                                <option value="">All connections</option>
                                {doc.connections.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.driver ? `${c.name} · ${c.driver}` : c.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <Menu
                            label="Download"
                            trigger={
                                <>
                                    <Icon name="download" /> Download
                                </>
                            }
                            placement="below"
                            align="end"
                            className="header-menu"
                            {...menuProps('download')}
                        >
                            {downloadMenu}
                        </Menu>
                        <button type="button" className="icon-button" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Switch theme">
                            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
                        </button>
                        <button type="button" className="header-button" onClick={() => setShortcuts(true)} title="Keyboard shortcuts (S)">
                            <Icon name="keyboard" /> Shortcuts
                        </button>
                    </div>
                )}
            </header>
            <main className="lsv-main">
                <section ref={canvas} className={`canvas${related.size > 0 ? ' has-selection' : ''}`} tabIndex={0} aria-label="Interactive entity relationship diagram" onKeyDown={onCanvasKey}>
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
                        nodesDraggable={!spacePan && !narrow}
                        nodeDragThreshold={3}
                        panOnDrag={panning ? true : [1, 2]}
                        selectionOnDrag={!panning}
                        selectionKeyCode="Shift"
                        multiSelectionKeyCode="Shift"
                        deleteKeyCode={null}
                        zoomOnDoubleClick={false}
                        onlyRenderVisibleElements={nodes.length > 60}
                    >
                        {grid && <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--dot)" />}
                        {!narrow && <MiniMap pannable zoomable ariaLabel="Overview map" nodeBorderRadius={4} className="minimap" nodeClassName={minimapClass} />}
                    </ReactFlow>
                    {focus && (
                        <div className="canvas-top">
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
                        </div>
                    )}
                    {overlay && comparison && !(narrow && notice) && (
                        <div className={`canvas-note${focus ? ' below-focus' : ''}${comparison.complete ? '' : ' incomplete'}`} role="note" aria-label="Comparison marks">
                            <span className="canvas-note__marks" aria-hidden="true">
                                − + ~
                            </span>
                            <span className="canvas-note__text">
                                {scopeLabel(lookup, comparison.baseline)} → {scopeLabel(lookup, comparison.target)}
                                {!comparison.complete && (
                                    <strong>
                                        {' '}
                                        · incomplete{comparison.omitted > 0 ? `, ${comparison.omitted} differences not marked` : ''}
                                    </strong>
                                )}
                            </span>
                            <button type="button" className="link-button" onClick={() => openTab('compare')}>
                                Compare
                            </button>
                        </div>
                    )}
                    {narrow && notice && (
                        <div className="notice" role="note">
                            <p>
                                <b>Easier on a larger screen.</b> On a phone you can browse every table and its details; the diagram itself is best on a desktop or tablet.
                            </p>
                            <button type="button" className="icon-button" aria-label="Close the note" onClick={() => setNotice(false)}>
                                <Icon name="close" />
                            </button>
                        </div>
                    )}
                    <div className="toolbar" role="toolbar" aria-label="Diagram">
                        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out" title="Zoom out (−)">
                            <Icon name="minus" />
                        </button>
                        {!narrow && <ZoomLabel />}
                        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (+)">
                            <Icon name="plus" />
                        </button>
                        <button type="button" onClick={() => fit()} aria-label="Fit to view" title="Fit to view (F)">
                            <Icon name="fit" />
                        </button>
                        {!narrow && (
                            <>
                                <button type="button" onClick={() => usePan(!panMode)} aria-pressed={panMode} aria-label="Pan mode" title="Pan mode: drag the background to move the diagram">
                                    <Icon name="hand" />
                                </button>
                                <button type="button" onClick={() => usePan(!panMode)} aria-pressed={!panMode} aria-label="Select mode" title="Select mode: drag the background to select tables">
                                    <Icon name="select" />
                                </button>
                            </>
                        )}
                        <span className="divider" />
                        <Menu label="Relationships" trigger={<ToolLabel icon="relationships" text="Relationships" narrow={narrow} />} {...menuProps('relationships')}>
                            <MenuLabel>Relationships</MenuLabel>
                            {EDGE_KINDS.filter((k) => kindsPresent.has(k)).map((k) => (
                                <MenuCheck key={k} checked={kinds.has(k)} onChange={() => setKinds((s) => toggleIn(s, k))} shortcut={String(EDGE_KINDS.indexOf(k) + 1)}>
                                    <span className={`line-key key--${k}`} /> {KIND_LABEL[k]}
                                </MenuCheck>
                            ))}
                            {doc.inferredAssociations.length > 0 && (
                                <>
                                    <MenuSeparator />
                                    <MenuCheck checked={showInferred} onChange={() => setShowInferred((v) => !v)} shortcut="5" hint="Marks the foreign keys they rest on; never a new line">
                                        <span className="line-key key--inferred" /> Inferred associations
                                    </MenuCheck>
                                </>
                            )}
                        </Menu>
                        <Menu label="Tables" trigger={<ToolLabel icon="tables" text="Tables" narrow={narrow} />} {...menuProps('tables')}>
                            <MenuLabel>Tables</MenuLabel>
                            {(['application', 'framework', 'package'] as Owner[])
                                .filter((o) => owners.has(o))
                                .map((o) => (
                                    <MenuCheck key={o} checked={!hiddenOwners.has(o)} onChange={() => setHiddenOwners((s) => toggleIn(s, o))} shortcut={OWNER_KEY[o]}>
                                        {OWNER_LABEL[o]}
                                    </MenuCheck>
                                ))}
                            <MenuSeparator />
                            <MenuLabel>Arrange</MenuLabel>
                            {ARRANGEMENTS.map((a) => (
                                <MenuRadio key={a.value} checked={arrangement === a.value} onSelect={() => setArrangement(a.value)} hint={ARRANGE_HINT[a.value]}>
                                    {a.label}
                                </MenuRadio>
                            ))}
                            <MenuItem onSelect={() => setArrangeCount((n) => n + 1)}>Arrange again</MenuItem>
                        </Menu>
                        <Menu label="Show" trigger={<ToolLabel icon="eye" text="Show" narrow={narrow} />} {...menuProps('show')}>
                            <MenuLabel>Show</MenuLabel>
                            <MenuCheck checked={allLabels} onChange={() => setAllLabels((l) => !l)} shortcut="L">
                                Relationship names
                            </MenuCheck>
                            <MenuCheck checked={notes} onChange={() => setNotes((n) => !n)} shortcut="N">
                                Notes
                            </MenuCheck>
                            <MenuCheck checked={grid} onChange={() => setGrid((g) => !g)}>
                                Grid
                            </MenuCheck>
                            {doc.comparisons.length > 0 && (
                                <MenuCheck checked={overlay} onChange={() => setOverlay((o) => !o)} hint="Missing, extra and changed marks of the comparison in Compare">
                                    Comparison marks
                                </MenuCheck>
                            )}
                            <MenuSeparator />
                            <MenuLabel>
                                Columns <kbd>C</kbd>
                            </MenuLabel>
                            {FOLDS.map((f) => (
                                <MenuRadio key={f.value} checked={fold === f.value} onSelect={() => (setFold(f.value), setCollapsed(new Set()), setArrangeCount((n) => n + 1))} hint={FOLD_HINT[f.value]}>
                                    {f.value === 'all' ? 'All' : f.value === 'keys' ? 'Keys' : 'Names'}
                                </MenuRadio>
                            ))}
                        </Menu>
                        <span className="divider" />
                        <button type="button" onClick={() => setTouring(true)} aria-label="Take the tour" title="Take the tour (?)">
                            <Icon name="help" />
                        </button>
                    </div>
                    {visible.length === 0 && phase === 'ready' && (
                        <div className="empty">
                            <strong>No tables to show</strong>
                            <span className="muted">Every table is hidden by the connection or the Tables menu.</span>
                        </div>
                    )}
                    {statusText && (
                        <div className="status" role="status">
                            {statusText}
                        </div>
                    )}
                    {toast && (
                        <div className="toast" role="status">
                            {toast}
                        </div>
                    )}
                </section>
                {!narrow && (
                    <>
                        <Resizer side="right" label="Resize the side panel" width={() => panelWidth ?? panel.current?.getBoundingClientRect().width ?? 380} onResize={setPanelWidth} onReset={() => setPanelWidth(null)} />
                        <aside ref={panel} className="panel" aria-label="Side panel">
                            <TabList tabs={tabs} value={tab} onChange={setTab} label="Side panel" className="tabs" idPrefix={panelId} />
                            {panelBody}
                        </aside>
                    </>
                )}
                {narrow && (
                    <aside ref={panel} className={`sheet${sheetOpen ? ' open' : ''}`} aria-label="Side panel">
                        <div className="sheet-bar">
                            <span className="sheet-bar__grip" aria-hidden="true" />
                            <button type="button" className="sheet-bar__main" aria-expanded={sheetOpen} onClick={() => setSheetOpen(!sheetOpen)}>
                                {sheetTitle}
                            </button>
                            {doc.diagnostics.length > 0 && !(sheetOpen && tab === 'diagnostics') && (
                                <button type="button" className="sheet-bar__issues" onClick={() => openTab('diagnostics')} aria-label={`${doc.diagnostics.length} diagnostics`}>
                                    <Icon name="warning" size={14} /> {doc.diagnostics.length}
                                </button>
                            )}
                            <button type="button" className="sheet-bar__action" onClick={() => (sheetOpen ? setSheetOpen(false) : openTab(selection ? 'details' : tab === 'compare' || tab === 'migrations' ? tab : 'browse'))}>
                                {sheetOpen ? 'Close' : selection ? 'Details' : tab === 'compare' ? 'Compare' : tab === 'migrations' ? 'Migrations' : 'Browse'}
                            </button>
                        </div>
                        {sheetOpen && (
                            <>
                                <TabList tabs={tabs} value={tab} onChange={setTab} label="Side panel" className="tabs" idPrefix={panelId} />
                                {panelBody}
                            </>
                        )}
                    </aside>
                )}
            </main>
            <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
            <Tour open={touring} root={root} onClose={() => setTouring(false)} />
        </div>
    );
}

function ToolLabel({ icon, text, narrow }: { icon: 'relationships' | 'tables' | 'eye'; text: string; narrow: boolean }) {
    return (
        <>
            <Icon name={icon} />
            {!narrow && (
                <>
                    {text} <Icon name="chevron" size={12} />
                </>
            )}
        </>
    );
}

function ZoomLabel() {
    const { zoom } = useViewport();
    return <span className="zoom-label">{Math.round(zoom * 100)}%</span>;
}
