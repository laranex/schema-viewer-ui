import { readFileSync } from 'node:fs';
import { buildGraph, compareScopes, type SchemaDocument } from '../src/contract';
import { byCodePoint } from '../src/contract/serialize';
import { root } from './helpers';

// Viewer-only test documents, derived from the contract's valid fixtures with the shared producer algorithms (tests
// may call them; the viewer never does). They are committed as JSON in tests/viewer-documents/ for the component and
// browser tests, and a test keeps them current and strictly valid.

const valid = (name: string): SchemaDocument => JSON.parse(readFileSync(root('contract/fixtures/valid', `${name}.json`), 'utf8'));
const sorted = (doc: SchemaDocument): SchemaDocument => ({ ...doc, comparisons: [...doc.comparisons].sort((a, b) => byCodePoint(a.id, b.id)) });

export const VIEWER_DOCUMENTS: Record<string, () => SchemaDocument> = {
    // Three connections and a relationship through a table on another connection: teams → users through cache's
    // sessions, so showing one connection must draw the intermediate table as a reference.
    'viewer-cross-connection-through': () => {
        const doc = valid('combined-multi-connection');
        const team = doc.relationships.find((r) => r.id === 'App\\Models\\User::team');
        if (!team) {
            throw new Error('combined-multi-connection changed: no User::team relationship');
        }
        const through = {
            ...team,
            id: 'App\\Models\\Team::sessionUsers',
            name: 'sessionUsers',
            model: 'App\\Models\\Team',
            table: 'app:public.teams',
            relatedModel: 'App\\Models\\User',
            relatedTable: 'app:public.users',
            type: 'HasManyThrough',
            cardinality: 'one-to-many' as const,
            collection: true,
            keys: null,
            through: ['cache:sessions'],
            source: null,
        };
        const relationships = [...doc.relationships, through].sort((a, b) => byCodePoint(a.id, b.id));
        return { ...doc, relationships, ...buildGraph({ connections: doc.connections, relationships }) };
    },
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
