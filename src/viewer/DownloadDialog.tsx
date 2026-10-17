import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SchemaDocument } from '../contract/types';
import type { ViewerDownload } from '../contract/viewer-config';
import { EXPORTERS, exportFileName, type Exporter, type ExportResult } from '../export';
import { save } from './exportImage';
import { Icon } from './ui';

// The Download dialog, after Laranex Laravel Schema Viewer's: one connection's database schema as Mermaid, DBML,
// Markdown or JSON (with a preview, its conversion warnings, copy and download), the diagram as an SVG or PNG image
// of the whole diagram or what is on screen, and the whole viewer as one offline HTML page. Everything is made in the
// browser; no schema data leaves the page.

export type ImageArea = 'whole' | 'screen';

type Props = {
    open: boolean;
    onClose: () => void;
    doc: SchemaDocument;
    // The connection id the dialog opens on: the selection's, else the one in view, else the first.
    initialConnection: string;
    // How many tables the diagram shows now.
    shownTables: number;
    // Each returns the message to show once the file is saved.
    onImage: (format: 'svg' | 'png', area: ImageArea) => Promise<string>;
    // null when this page cannot build the offline viewer.
    onOffline: (() => Promise<string>) | null;
    // The whole document as JSON (the host's snapshot URL or the document shown); null hides it.
    onWholeDocument: (() => void) | null;
    downloads: ViewerDownload[];
};

const HINTS: Record<string, string> = {
    mermaid: 'An ER diagram for READMEs and pull requests',
    dbml: 'For dbdiagram.io and other DBML tools',
    markdown: 'A readable reference of every table',
    json: 'This connection as a laranex-schema document',
};

// The preview shows this many characters; the file always has everything.
const PREVIEW_LIMIT = 200_000;

export function DownloadDialog({ open, onClose, doc, initialConnection, shownTables, onImage, onOffline, onWholeDocument, downloads }: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const returnTo = useRef<Element | null>(null);
    const id = useId().replace(/[^a-zA-Z0-9]/g, '');
    const [connection, setConnection] = useState(initialConnection);
    const [format, setFormat] = useState<Exporter>(EXPORTERS[0]);
    const [orm, setOrm] = useState(false);
    const [area, setArea] = useState<ImageArea>('whole');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const d = dialog.current;
        if (!d) {
            return;
        }
        if (open && !d.open) {
            returnTo.current = document.activeElement;
            setConnection(initialConnection);
            setStatus('');
            if (typeof d.showModal === 'function') {
                d.showModal();
            } else {
                d.setAttribute('open', '');
            }
        } else if (!open && d.open) {
            if (typeof d.close === 'function') {
                d.close();
            } else {
                d.removeAttribute('open');
            }
            (returnTo.current as HTMLElement | null)?.focus?.();
        }
    }, [open, initialConnection]);

    const chosen = doc.connections.find((c) => c.id === connection) ?? doc.connections[0];
    const hasOrm = doc.relationships.length > 0 || doc.inferredAssociations.length > 0;
    const ormApplies = hasOrm && (format.id === 'mermaid' || format.id === 'markdown');
    const fileName = chosen ? exportFileName(doc, format.extension, [chosen.id]) : `schema.${format.extension}`;
    const result = useMemo((): ExportResult | { error: string } | null => {
        if (!open || !chosen) {
            return null;
        }
        try {
            return format.export(doc, { connections: [chosen.id], orm: ormApplies && orm });
        } catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }, [open, doc, chosen, format, orm, ormApplies]);

    const run = async (task: () => Promise<string>) => {
        setBusy(true);
        setStatus('Working…');
        try {
            setStatus(await task());
        } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    };
    const download = () => {
        if (result && 'content' in result) {
            save(new Blob([result.content], { type: `${format.mediaType};charset=utf-8` }), fileName);
            setStatus(`Downloaded ${fileName}.`);
        }
    };
    const copy = () => {
        if (!result || !('content' in result)) {
            return;
        }
        if (!navigator.clipboard?.writeText) {
            setStatus('Copying is not available on this page; select the preview and copy it instead.');
            return;
        }
        navigator.clipboard.writeText(result.content).then(
            () => setStatus(`Copied ${format.label} to the clipboard.`),
            () => setStatus('The clipboard refused the text; select the preview and copy it instead.'),
        );
    };
    // Escape closes the dialog itself, also where the browser has no native modal dialog.
    const keys = (event: KeyboardEvent<HTMLDialogElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
        }
    };

    const content = result && 'content' in result ? result.content : '';
    const lines = content ? content.split('\n').length - 1 : 0;
    return (
        <dialog ref={dialog} className="lsv-dialog lsv-download" aria-labelledby={`${id}-title`} onCancel={(e) => (e.preventDefault(), onClose())} onClose={onClose} onKeyDown={keys}>
            <div className="dialog-head">
                <h2 id={`${id}-title`}>Download</h2>
                <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
                    <Icon name="close" />
                </button>
            </div>
            {open && chosen && (
                <div className="download">
                    {doc.connections.length > 1 && (
                        <section className="download__section">
                            <label className="download__heading" htmlFor={`${id}-connection`}>
                                Connection
                            </label>
                            <select id={`${id}-connection`} value={chosen.id} onChange={(e) => setConnection(e.target.value)}>
                                {doc.connections.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} · {c.tables.length} {c.tables.length === 1 ? 'table' : 'tables'}
                                    </option>
                                ))}
                            </select>
                        </section>
                    )}
                    <section className="download__section" aria-labelledby={`${id}-schema`}>
                        <h3 className="download__heading" id={`${id}-schema`}>
                            Database schema of <code>{chosen.name}</code>
                        </h3>
                        {doc.connections.length > 1 && <p className="muted download__note">The connection applies to these files; the image shows the diagram as it is.</p>}
                        <div className="download__formats" role="radiogroup" aria-labelledby={`${id}-schema`}>
                            {EXPORTERS.map((e) => (
                                <label key={e.id} className={`download__format${e === format ? ' checked' : ''}`}>
                                    <input type="radio" name={`${id}-format`} value={e.id} checked={e === format} onChange={() => setFormat(e)} />
                                    <b>{e.label}</b>
                                    <span className="muted">{HINTS[e.id] ?? e.label}</span>
                                </label>
                            ))}
                        </div>
                        {ormApplies && (
                            <label className="download__option">
                                <input type="checkbox" checked={orm} onChange={(e) => setOrm(e.target.checked)} /> Add ORM relationships and inferred associations, labelled as such
                            </label>
                        )}
                        {result && 'error' in result ? (
                            <p className="download__error" role="alert">
                                {result.error}
                            </p>
                        ) : (
                            <>
                                <div className="download__file">
                                    <code>{fileName}</code>
                                    <span className="muted">
                                        {lines} {lines === 1 ? 'line' : 'lines'}
                                    </span>
                                </div>
                                <pre className="download__preview" tabIndex={0} aria-label={`Preview of ${fileName}`}>
                                    {content.length > PREVIEW_LIMIT ? `${content.slice(0, PREVIEW_LIMIT)}\n…` : content}
                                </pre>
                                {content.length > PREVIEW_LIMIT && <p className="muted download__note">The preview is cut short; the file has everything.</p>}
                                {result && result.warnings.length > 0 && (
                                    <details className="download__warnings">
                                        <summary>
                                            <Icon name="warning" size={14} /> {result.warnings.length} {result.warnings.length === 1 ? 'conversion note' : 'conversion notes'}: what {format.label} leaves out or changes
                                        </summary>
                                        <ul>
                                            {result.warnings.map((w, i) => (
                                                <li key={i} data-code={w.code}>
                                                    {w.message}
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                                <div className="download__actions">
                                    <button type="button" onClick={copy}>
                                        Copy
                                    </button>
                                    <button type="button" className="primary" onClick={download}>
                                        <Icon name="download" /> Download {fileName}
                                    </button>
                                </div>
                            </>
                        )}
                    </section>
                    <section className="download__section" aria-labelledby={`${id}-image`}>
                        <h3 className="download__heading" id={`${id}-image`}>
                            Diagram image
                        </h3>
                        <div className="download__image-options">
                            <div className="segmented" role="radiogroup" aria-label="Image area">
                                {(
                                    [
                                        ['whole', 'Whole diagram'],
                                        ['screen', "What's on screen"],
                                    ] as const
                                ).map(([value, label]) => (
                                    <label key={value} className={area === value ? 'checked' : ''}>
                                        <input type="radio" name={`${id}-area`} value={value} checked={area === value} onChange={() => setArea(value)} />
                                        {label}
                                    </label>
                                ))}
                            </div>
                            <span className="muted">
                                as shown: {shownTables} {shownTables === 1 ? 'table' : 'tables'}
                            </span>
                        </div>
                        <div className="download__grid">
                            <button type="button" className="download__item" disabled={busy} onClick={() => void run(() => onImage('svg', area))}>
                                <b>SVG</b>
                                <span className="muted">Sharp at any size, for docs and slides</span>
                            </button>
                            <button type="button" className="download__item" disabled={busy} onClick={() => void run(() => onImage('png', area))}>
                                <b>PNG</b>
                                <span className="muted">A picture for chats and issues</span>
                            </button>
                        </div>
                    </section>
                    {onOffline && (
                        <section className="download__section" aria-labelledby={`${id}-offline`}>
                            <h3 className="download__heading" id={`${id}-offline`}>
                                Use it offline
                            </h3>
                            <button type="button" className="download__item download__item--wide" disabled={busy} onClick={() => void run(onOffline)}>
                                <b>This page as HTML</b>
                                <span className="muted">Opens in any browser, offline, with every connection</span>
                            </button>
                        </section>
                    )}
                    {(onWholeDocument || downloads.length > 0) && (
                        <section className="download__section" aria-labelledby={`${id}-host`}>
                            <h3 className="download__heading" id={`${id}-host`}>
                                From this page
                            </h3>
                            <div className="download__grid">
                                {onWholeDocument && (
                                    <button type="button" className="download__item" onClick={() => (onWholeDocument(), setStatus('Downloaded schema-viewer.json.'))}>
                                        <b>JSON document</b>
                                        <span className="muted">The whole laranex-schema document, every connection</span>
                                    </button>
                                )}
                                {downloads.map((d) => (
                                    <button
                                        key={d.filename}
                                        type="button"
                                        className="download__item"
                                        onClick={() => (save(new Blob([d.content], { type: d.mediaType }), d.filename), setStatus(`Downloaded ${d.filename}.`))}
                                    >
                                        <b>{d.label}</b>
                                        <span className="muted">{d.filename}</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}
                    <p className="download__status" role="status" aria-live="polite">
                        {status}
                    </p>
                </div>
            )}
        </dialog>
    );
}
