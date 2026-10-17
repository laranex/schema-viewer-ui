import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '../src/viewer/styles.css';
import './dev.css';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SchemaDocument } from '../src/contract';
import { SchemaViewer } from '../src/viewer/SchemaViewer';
import { large } from './large';

// The development page: every synthetic contract fixture, and a generated large schema, in the viewer.
const fixtures = import.meta.glob<SchemaDocument>('../contract/fixtures/valid/*.json', { eager: true, import: 'default' });
const documents: Record<string, SchemaDocument> = {
    ...Object.fromEntries(Object.entries(fixtures).map(([path, doc]) => [path.replace(/^.*\//, '').replace('.json', ''), doc])),
    'large-200-tables': large(200),
};

function Dev() {
    const [name, setName] = useState(() => new URLSearchParams(location.search).get('fixture') ?? 'combined-eloquent');
    const choose = (next: string) => {
        setName(next);
        history.replaceState(null, '', `?fixture=${next}`);
    };
    return (
        <div className="dev">
            <nav className="dev-bar">
                <strong>Fixture</strong>
                {Object.keys(documents).map((n) => (
                    <button key={n} type="button" className={n === name ? 'on' : ''} onClick={() => choose(n)}>
                        {n}
                    </button>
                ))}
            </nav>
            <SchemaViewer key={name} document={documents[name] ?? documents['combined-eloquent']} editor="vscode://file/{file}:{line}" />
        </div>
    );
}

createRoot(document.getElementById('dev') as HTMLElement).render(
    <StrictMode>
        <Dev />
    </StrictMode>,
);
