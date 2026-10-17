import { buildGraph } from '../../src/contract/graph';
import { diagnosticId } from '../../src/contract/ids';
import { inferAssociations } from '../../src/contract/inference';
import type {
    Column,
    Connection,
    Constraint,
    Coverage,
    Diagnostic,
    ForeignKey,
    Index,
    IndexPart,
    Model,
    Provenance,
    Relationship,
    SchemaDocument,
    SourceMode,
    Table,
} from '../../src/contract/types';

// Builders for the synthetic contract fixtures. Every name in them is invented; none comes from a real application.

export const column = (name: string, type: string, options: Partial<Column> = {}): Column => ({
    name,
    type,
    typeName: type.replace(/\(.*$/, '').toLowerCase(),
    nullable: false,
    autoIncrement: false,
    timezone: null,
    collation: null,
    enum: null,
    default: null,
    ormDefault: null,
    generated: null,
    comment: null,
    note: null,
    provenance: ['database'],
    ...options,
});

export const part = (key: string | { expression: string }, options: Partial<IndexPart> = {}): IndexPart => ({
    column: typeof key === 'string' ? key : null,
    expression: typeof key === 'string' ? null : key.expression,
    order: null,
    nulls: null,
    length: null,
    collation: null,
    opclass: null,
    ...options,
});

export const index = (tableId: string, name: string | null, parts: IndexPart[], options: Partial<Index> = {}): Index => ({
    id: `${tableId}:index:${name ?? parts.map((p) => p.column ?? p.expression).join(',')}`,
    name,
    parts,
    expression: parts.some((p) => p.expression !== null),
    unique: false,
    backs: null,
    method: null,
    partial: false,
    predicate: null,
    included: [],
    provenance: ['database'],
    ...options,
});

export const primaryIndex = (tableId: string, name: string | null, columns: string[], options: Partial<Index> = {}): Index =>
    index(tableId, name, columns.map((c) => part(c)), { unique: true, backs: { kind: 'primary_key', constraint: null }, ...options });

export const foreignKey = (tableId: string, name: string, columns: string[], foreignTable: string, foreignColumns: string[], options: Partial<ForeignKey> = {}): ForeignKey => ({
    id: `${tableId}:fk:${name}`,
    name,
    columns,
    foreignTable,
    foreignColumns,
    onUpdate: null,
    onDelete: null,
    deferrable: null,
    initially: null,
    provenance: ['database'],
    ...options,
});

export const constraint = (tableId: string, kind: 'unique' | 'check', name: string, columns: string[], expression: string | null = null, options: Partial<Constraint> = {}): Constraint => ({
    id: `${tableId}:constraint:${name}`,
    kind,
    name,
    columns,
    expression,
    provenance: ['database'],
    ...options,
});

export const table = (id: string, name: string, columns: Column[], options: Partial<Table> = {}): Table => ({
    id,
    name,
    schema: null,
    comment: null,
    note: null,
    owner: { kind: 'application', package: null },
    primaryKey: columns.filter((c) => c.name === 'id').map((c) => c.name),
    columns,
    indexes: [],
    foreignKeys: [],
    constraints: [],
    provenance: ['database'],
    ...options,
});

export const coverage = (features: Coverage['features'], schemas: string[] | null = null): Coverage => ({
    complete: Object.values(features).every((f) => f === 'complete' || f === 'not_applicable'),
    schemas,
    features,
});

export const connection = (name: string, driver: string | null, tables: Table[], options: Partial<Connection> = {}): Connection => ({
    id: `connection:${name}`,
    name,
    driver,
    defaultSchema: null,
    coverage: { database: null, declared: null },
    tables,
    ...options,
});

export const model = (id: string, className: string, tables: string[], options: Partial<Model> = {}): Model => ({
    id,
    className,
    tables,
    primaryKey: ['id'],
    source: null,
    ...options,
});

export const relationship = (id: string, name: string, options: Partial<Relationship> & Pick<Relationship, 'model' | 'table' | 'type' | 'cardinality'>): Relationship => ({
    id,
    name,
    relatedModel: null,
    relatedTable: null,
    collection: options.cardinality === 'one-to-many' || options.cardinality === 'many-to-many',
    readOnly: false,
    keys: null,
    pivot: null,
    polymorphic: null,
    through: null,
    join: null,
    constraints: [],
    inverse: null,
    note: null,
    source: null,
    ...options,
});

export const diagnostic = (
    kind: string,
    category: Diagnostic['category'],
    subject: Partial<Diagnostic['subject']> & Pick<Diagnostic['subject'], 'type'>,
    message: string,
    options: Partial<Omit<Diagnostic, 'id'>> = {},
): Diagnostic => {
    const d = { kind, category, severity: 'warning' as const, certainty: 'certain' as const, subject: { id: null, columns: null, label: null, ...subject }, message, ...options };
    return { id: diagnosticId(d), ...d };
};

// A document with its links built by the shared graph builder and its inferred associations by the shared inference.
export function document(source: SourceMode, generator: SchemaDocument['generator'], parts: Partial<SchemaDocument> & Pick<SchemaDocument, 'connections'>): SchemaDocument {
    const base: SchemaDocument = {
        format: 'laranex-schema',
        version: '2.0',
        source,
        generator,
        note: null,
        models: [],
        relationships: [],
        links: [],
        derivedLinks: [],
        diagnostics: [],
        comparisons: [],
        migrations: [],
        inferredAssociations: [],
        ...parts,
    };
    // The array order docs/contract.md specifies.
    const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const key = (d: Diagnostic) => [d.category, d.kind, d.subject.type, d.subject.id ?? '', d.message];
    base.connections = base.connections.map((c) => ({ ...c, tables: byId(c.tables) }));
    base.models = byId(base.models);
    base.relationships = byId(base.relationships);
    base.comparisons = byId(base.comparisons);
    base.migrations = byId(base.migrations);
    base.diagnostics = [...base.diagnostics].sort((a, b) => {
        const [x, y] = [key(a), key(b)];
        const i = x.findIndex((v, n) => v !== y[n]);
        return i < 0 ? 0 : x[i] < y[i] ? -1 : 1;
    });
    const graph = { ...base, ...buildGraph(base) };
    return { ...graph, inferredAssociations: inferAssociations(graph) };
}

export const both: Provenance = ['database', 'declared'];
export const declared: Provenance = ['declared'];
