import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

// A guided tour, after Laranex Laravel Schema Viewer's: the page dims, one region at a time is ringed and explained.
// It starts only when asked (? or the header button), never on its own, so embedding pages are not interrupted.

type Step = { target: string | null; title: string; text: string };

export const TOUR: Step[] = [
    { target: null, title: 'Welcome', text: 'This viewer shows a saved schema snapshot. It never connects to a database. The tour takes a minute; leave it any time with Esc.' },
    { target: '.canvas', title: 'The diagram', text: 'Each card is a table. Drag the background to pan, scroll or pinch to zoom, and drag a card by its title to move it.' },
    { target: '.react-flow__node', title: 'A table', text: 'Click a card for its columns, indexes, constraints, foreign keys, relationships and models. Double-click it to focus on its neighbors; the chevron folds it.' },
    { target: '.search', title: 'Search', text: 'Find any table, column, model or relationship and jump to it. Press / from anywhere.' },
    {
        target: '.toolbar',
        title: 'Tools',
        text: 'Zoom, fit, and switch between panning and box selection. Relationships turns each kind of line on or off: a solid line is a database constraint, a dashed one an ORM relationship without one. Tables and Show fold columns, show notes, hide framework tables and re-arrange.',
    },
    { target: '.tabs', title: 'Side panel', text: 'Browse every table, relationship and column; read the selection in Details; and see Diagnostics, with confirmed facts apart from heuristic advice. Documents with stored comparisons or migration tracks add Compare and Migrations.' },
    {
        target: '.lsv-header .header-download, .lsv-header .header-menu',
        title: 'Downloads',
        text: 'Save a connection as Mermaid, DBML, Markdown or JSON with a preview and notes on what each format leaves out, the diagram as SVG or PNG, or this page as one HTML file that works offline (E).',
    },
    { target: '.lsv-header .actions, .lsv-header .header-menu', title: 'Theme and shortcuts', text: 'Switch between the light and dark theme, and list every shortcut (S).' },
];

type Rect = { x: number; y: number; width: number; height: number };

export function Tour({ open, root, onClose }: { open: boolean; root: RefObject<HTMLElement | null>; onClose: () => void }) {
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const next = useRef<HTMLButtonElement>(null);
    const step = TOUR[index];

    useEffect(() => {
        if (open) {
            setIndex(0);
        }
    }, [open]);

    useLayoutEffect(() => {
        if (!open) {
            return;
        }
        const measure = () => {
            const host = root.current?.getBoundingClientRect();
            const target = step.target ? root.current?.querySelector(step.target)?.getBoundingClientRect() : null;
            setRect(host && target ? { x: target.left - host.left - 6, y: target.top - host.top - 6, width: target.width + 12, height: target.height + 12 } : null);
        };
        measure();
        window.addEventListener('resize', measure);
        next.current?.focus();
        return () => window.removeEventListener('resize', measure);
    }, [open, step, root]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const keys = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
            } else if (event.key === 'ArrowRight') {
                setIndex((i) => Math.min(TOUR.length - 1, i + 1));
            } else if (event.key === 'ArrowLeft') {
                setIndex((i) => Math.max(0, i - 1));
            }
        };
        document.addEventListener('keydown', keys, true);
        return () => document.removeEventListener('keydown', keys, true);
    }, [open, onClose]);

    if (!open) {
        return null;
    }
    const host = root.current?.getBoundingClientRect();
    const width = Math.min(340, (host?.width ?? 400) - 24);
    // The card sits below the ring when there is room, otherwise above it, otherwise in the middle.
    const below = rect && host && rect.y + rect.height + 180 < host.height;
    const above = rect && rect.y > 200;
    const top = rect ? (below ? rect.y + rect.height + 10 : above ? rect.y - 190 : Math.max(12, (host?.height ?? 600) / 2 - 90)) : Math.max(12, (host?.height ?? 600) / 2 - 90);
    const left = rect ? Math.max(12, Math.min((host?.width ?? 800) - width - 12, rect.x)) : Math.max(12, ((host?.width ?? 800) - width) / 2);

    return (
        <div className="tour" role="presentation">
            <div className="tour__shade" onClick={onClose} />
            {rect && <div className="tour__ring" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />}
            <div className="tour__card" role="dialog" aria-modal="true" aria-labelledby="lsv-tour-title" style={{ left, top, width }}>
                <div className="tour__head">
                    <span className="muted">
                        {index + 1} of {TOUR.length}
                    </span>
                    <button type="button" aria-label="End the tour" onClick={onClose}>
                        ✕
                    </button>
                </div>
                <h2 id="lsv-tour-title">{step.title}</h2>
                <p>{step.text}</p>
                <div className="tour__actions">
                    <button type="button" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
                        Back
                    </button>
                    <button ref={next} type="button" className="button primary" onClick={() => (index === TOUR.length - 1 ? onClose() : setIndex((i) => i + 1))}>
                        {index === TOUR.length - 1 ? 'Done' : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
}
