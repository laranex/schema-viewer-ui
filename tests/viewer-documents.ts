import { readFileSync } from 'node:fs';
import { compareScopes, type SchemaDocument } from '../src/contract';
import { byCodePoint } from '../src/contract/serialize';
import { root } from './helpers';

// Viewer-only test documents, derived from the contract's valid fixtures with the shared producer algorithms (tests
// may call them; the viewer never does). They are committed as JSON in tests/viewer-documents/ for the component and
// browser tests, and a test keeps them current and strictly valid.

const valid = (name: string): SchemaDocument => JSON.parse(readFileSync(root('contract/fixtures/valid', `${name}.json`), 'utf8'));
const sorted = (doc: SchemaDocument): SchemaDocument => ({ ...doc, comparisons: [...doc.comparisons].sort((a, b) => byCodePoint(a.id, b.id)) });

export const VIEWER_DOCUMENTS: Record<string, () => SchemaDocument> = {
    // Both directions of the tenant comparison, so baseline and target can be chosen and swapped.
    'viewer-two-way-comparison': () => {
        const doc = valid('comparison-tenant-schemas');
        const [forward] = doc.comparisons;
        return sorted({ ...doc, comparisons: [forward, compareScopes(doc, forward.target, forward.baseline)] });
    },
    // A complete comparison of two equal tenant schemas: no differences at all, beside migration tracks.
    'viewer-clean-comparison': () => {
        const doc = valid('migrations-alembic');
        const app = doc.connections[0].id;
        return sorted({ ...doc, comparisons: [compareScopes(doc, { connection: app, schema: 'tenant_behind' }, { connection: app, schema: 'tenant_branches' })] });
    },
};
