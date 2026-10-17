import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '../viewer/styles.css';
import './standalone.css';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ViewerConfig } from '../contract/viewer-config';
import { validateDocument } from '../contract/validate';
import { SchemaViewer } from '../viewer/SchemaViewer';

// The standalone viewer: Laravel, Python and Node.js hosts serve dist/viewer/ as static files and hand it a
// laranex-schema document in one of three ways, tried in this order:
//   1. <script type="application/json" id="schema-viewer-data">{…}</script>, a document or a ViewerConfig;
//   2. window.__SCHEMA_VIEWER__, a ViewerConfig;
//   3. data-snapshot-url on the mount element (or src on <laranex-schema-viewer>), fetched from the same origin.
// It needs no inline script, eval or worker, so it runs under script-src 'self'.

declare global {
    interface Window {
        __SCHEMA_VIEWER__?: ViewerConfig;
        LaranexSchemaViewer?: { mount: typeof mount };
    }
}

type Source = { config: ViewerConfig; downloadHref?: string } | { missing: string } | { error: string; details?: string[] };

const asConfig = (value: unknown): ViewerConfig => (value && typeof value === 'object' && 'format' in value ? { document: value as ViewerConfig['document'] } : (value as ViewerConfig));

async function load(url: string | null): Promise<Source> {
    let config: ViewerConfig | undefined;
    let downloadHref: string | undefined;
    const inline = document.getElementById('schema-viewer-data');
    try {
        if (inline?.textContent?.trim()) {
            config = asConfig(JSON.parse(inline.textContent));
        } else if (window.__SCHEMA_VIEWER__) {
            config = window.__SCHEMA_VIEWER__;
        } else if (url) {
            const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
            if (!response.ok) {
                return { error: `The snapshot request failed (${response.status}).` };
            }
            config = asConfig(await response.json());
            downloadHref = url;
        }
    } catch (error) {
        return { error: `The snapshot could not be read: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!config) {
        return { error: 'No schema was given to the viewer.' };
    }
    if (config.missing) {
        return { missing: config.missing };
    }
    const result = validateDocument(config.document);
    if (!result.ok) {
        return { error: 'This is not a laranex-schema 2.x document the viewer can read.', details: result.errors };
    }
    return { config: { ...config, document: result.document }, downloadHref };
}

function Message({ title, text, details }: { title: string; text: string; details?: string[] }) {
    return (
        <div className="lsv lsv-message" data-loaded="error">
            <div className="lsv-message__box">
                <span className="tag">SCHEMA VIEWER</span>
                <h2>{title}</h2>
                <p>{text}</p>
                {details && (
                    <ul>
                        {details.slice(0, 20).map((d) => (
                            <li key={d}>
                                <code>{d}</code>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

const roots = new WeakMap<HTMLElement, Root>();

export async function mount(element: HTMLElement, url: string | null = element.dataset.snapshotUrl ?? null): Promise<void> {
    const root = roots.get(element) ?? createRoot(element);
    roots.set(element, root);
    const source = await load(url);
    root.render(
        <StrictMode>
            {'config' in source ? (
                <SchemaViewer
                    document={source.config.document}
                    changes={source.config.changes}
                    downloads={source.config.downloads}
                    editor={source.config.editor}
                    defaultConnection={source.config.defaultConnection}
                    downloadHref={source.downloadHref}
                />
            ) : 'missing' in source ? (
                <Message title="No snapshot yet" text={`Build one first: ${source.missing}`} />
            ) : (
                <Message title="Snapshot unavailable" text={source.error} details={source.details} />
            )}
        </StrictMode>,
    );
}

// <laranex-schema-viewer src="snapshot.json"></laranex-schema-viewer>, for pages that use no framework.
class LaranexSchemaViewerElement extends HTMLElement {
    connectedCallback() {
        if (!this.style.display) {
            this.style.display = 'block';
        }
        void mount(this, this.getAttribute('src'));
    }
}

if (!customElements.get('laranex-schema-viewer')) {
    customElements.define('laranex-schema-viewer', LaranexSchemaViewerElement);
}

window.LaranexSchemaViewer = { mount };

const element = document.getElementById('schema-viewer');
if (element) {
    void mount(element);
}
