import { useEffect, useRef } from 'react';

// Every keyboard shortcut, adapted from Laranex Laravel Schema Viewer's list. Shown by S and in the guide.
export const SHORTCUTS: [string[], string][] = [
    [['/'], 'Search tables, columns and models'],
    [['Esc'], 'Clear the search, the selection and focus'],
    [['F', '0'], 'Fit the diagram to the screen'],
    [['+', '−'], 'Zoom in or out'],
    [['←', '→', '↑', '↓'], 'Pan the canvas (when it has focus)'],
    [['Space'], 'Hold to pan: drag anywhere, even over a table'],
    [['Shift click'], 'Add a table to the selection, or take it out; drag one to move them all'],
    [['Shift drag'], 'Draw a box that selects every table it touches'],
    [['Double-click'], 'Focus on a table and its neighbors'],
    [['Shift F'], 'Focus on the selected table, or leave focus'],
    [['C'], 'Show the key columns, every column, or table names only'],
    [['N'], 'Show notes on the cards'],
    [['L'], 'Show relationship names on every edge, or on the selected table only'],
    [['1', '2', '3', '4'], 'Show or hide FK + ORM, FK only, ORM only, and through edges'],
    [['5'], 'Show or hide inferred-association marks on foreign-key edges'],
    [['Y', 'G', 'P'], 'Show or hide your tables, framework tables, package tables'],
    [['[', ']'], 'Previous or next connection, or all of them'],
    [['Shift C'], 'Copy a link to this view'],
    [['A', 'D', 'H', 'W'], 'Open Browse, Details, Diagnostics or Changes'],
    [['X', 'M'], 'Open Compare or Migrations, when the document has them'],
    [['E'], 'Open the Download menu: JSON, PNG or SVG'],
    [['S'], 'Show this list'],
    [['?'], 'Take the tour'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const d = dialog.current;
        if (!d) {
            return;
        }
        if (open && !d.open) {
            d.showModal?.();
        } else if (!open && d.open) {
            d.close();
        }
    }, [open]);
    return (
        <dialog ref={dialog} className="lsv-dialog" aria-labelledby="lsv-shortcuts-title" onClose={onClose} onCancel={onClose}>
            <div className="dialog-head">
                <h2 id="lsv-shortcuts-title">Keyboard shortcuts</h2>
                <button type="button" onClick={onClose} aria-label="Close">
                    ✕
                </button>
            </div>
            <dl className="shortcuts">
                {SHORTCUTS.map(([keys, label]) => (
                    <div key={label} style={{ display: 'contents' }}>
                        <dt>
                            {keys.map((k) => (
                                <kbd key={k}>{k}</kbd>
                            ))}
                        </dt>
                        <dd>{label}</dd>
                    </div>
                ))}
            </dl>
        </dialog>
    );
}
