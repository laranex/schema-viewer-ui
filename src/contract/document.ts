import { FEATURES, FORMAT } from './types';
import { array, boolean, integer, json, jsonObject, literal, nullable, object, oneOf, record, ref, string, type JsonSchema, type Shape } from './shape';

// The laranex-schema 1.x document shape. Field names and meaning follow types.ts and docs/contract.md.

export const VERSION_PATTERN = '^1\\.(0|[1-9][0-9]*)$';

const id = () => string({ minLength: 1 });
const ids = () => array(id());
const names = () => array(string({ minLength: 1 }));
const text = () => nullable(string());

const extensions = record(jsonObject());
const provenance = array(oneOf(['database', 'declared']), { minItems: 1, uniqueItems: true });
const driftShape = object({ field: string({ minLength: 1 }), database: json(), declared: json() });

const physical = {
    provenance: ref('Provenance', () => provenance),
    'drift?': array(ref('Drift', () => driftShape)),
    'extensions?': ref('Extensions', () => extensions),
};

const coverage = object({
    complete: boolean(),
    schemas: nullable(names()),
    features: record(oneOf(['complete', 'partial', 'unavailable', 'not_applicable']), FEATURES),
});

const defaultValue = object({
    kind: oneOf(['literal', 'expression', 'sequence', 'identity', 'raw']),
    value: string(),
});

const ormDefault = object({
    kind: oneOf(['scalar', 'callable', 'sequence', 'expression']),
    value: string(),
});

const column = object({
    name: string({ minLength: 1 }),
    type: string(),
    typeName: text(),
    nullable: boolean(),
    autoIncrement: nullable(boolean()),
    timezone: nullable(boolean()),
    collation: text(),
    enum: nullable(object({ name: text(), values: array(string()) })),
    default: nullable(ref('DefaultValue', () => defaultValue)),
    ormDefault: nullable(ref('OrmDefault', () => ormDefault)),
    generated: nullable(object({ kind: nullable(oneOf(['stored', 'virtual'])), expression: string() })),
    comment: text(),
    note: text(),
    ...physical,
});

const indexOptions = object({
    'method?': text(),
    'predicate?': text(),
    'included?': names(),
    'options?': jsonObject(),
});

const indexPart = object({
    column: nullable(string({ minLength: 1 })),
    expression: nullable(string({ minLength: 1 })),
    order: nullable(oneOf(['asc', 'desc'])),
    nulls: nullable(oneOf(['first', 'last'])),
    length: nullable(integer({ minimum: 1 })),
    collation: text(),
    opclass: text(),
});

const index = object({
    id: id(),
    name: text(),
    parts: array(ref('IndexPart', () => indexPart)),
    columns: names(),
    expression: boolean(),
    unique: boolean(),
    primary: boolean(),
    backs: nullable(object({ kind: oneOf(['primary_key', 'unique_constraint']), constraint: nullable(id()) })),
    method: text(),
    partial: boolean(),
    predicate: text(),
    included: names(),
    'dialectOptions?': record(ref('IndexOptions', () => indexOptions)),
    ...physical,
});

const referentialAction = oneOf(['CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION']);

const foreignKey = object({
    id: id(),
    name: text(),
    columns: array(string({ minLength: 1 }), { minItems: 1 }),
    foreignTable: id(),
    foreignColumns: array(string({ minLength: 1 }), { minItems: 1 }),
    onUpdate: nullable(referentialAction),
    onDelete: nullable(referentialAction),
    deferrable: nullable(boolean()),
    initially: nullable(oneOf(['DEFERRED', 'IMMEDIATE'])),
    ...physical,
});

const constraint = object({
    id: id(),
    kind: oneOf(['unique', 'check']),
    name: text(),
    columns: names(),
    expression: text(),
    ...physical,
});

const table = object({
    id: id(),
    name: string({ minLength: 1 }),
    schema: text(),
    comment: text(),
    note: text(),
    owner: object({ kind: oneOf(['application', 'framework', 'package']), package: text() }),
    primaryKey: names(),
    columns: array(ref('Column', () => column)),
    indexes: array(ref('Index', () => index)),
    foreignKeys: array(ref('ForeignKey', () => foreignKey)),
    constraints: array(ref('Constraint', () => constraint)),
    ...physical,
});

const connection = object({
    id: id(),
    name: string({ minLength: 1 }),
    driver: text(),
    defaultSchema: text(),
    coverage: object({ database: nullable(ref('Coverage', () => coverage)), declared: nullable(ref('Coverage', () => coverage)) }),
    tables: array(ref('Table', () => table)),
    'extensions?': ref('Extensions', () => extensions),
});

const source = object({
    file: string({ minLength: 1 }),
    line: nullable(integer({ minimum: 1 })),
});

const model = object({
    id: id(),
    className: string({ minLength: 1 }),
    tables: ids(),
    primaryKey: names(),
    source: nullable(ref('Source', () => source)),
    'extensions?': ref('Extensions', () => extensions),
});

const endpoint = object({
    table: id(),
    columns: array(string({ minLength: 1 }), { minItems: 1 }),
});

const pivot = object({
    table: id(),
    parentColumns: names(),
    parentPivotColumns: names(),
    relatedColumns: names(),
    relatedPivotColumns: names(),
    columns: names(),
});

const relationship = object({
    id: id(),
    name: string({ minLength: 1 }),
    model: id(),
    table: id(),
    relatedModel: nullable(id()),
    relatedTable: nullable(id()),
    type: string({ minLength: 1 }),
    cardinality: oneOf(['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many']),
    collection: boolean(),
    readOnly: boolean(),
    keys: nullable(object({ from: ref('Endpoint', () => endpoint), to: ref('Endpoint', () => endpoint) })),
    pivot: nullable(ref('Pivot', () => pivot)),
    polymorphic: nullable(object({ typeColumn: string({ minLength: 1 }), idColumn: string({ minLength: 1 }), typeValue: text() })),
    through: nullable(ids()),
    join: nullable(object({ primary: text(), secondary: text() })),
    constraints: array(string()),
    inverse: nullable(id()),
    note: text(),
    source: nullable(ref('Source', () => source)),
    'extensions?': ref('Extensions', () => extensions),
});

const link = object({
    id: id(),
    from: ref('Endpoint', () => endpoint),
    to: ref('Endpoint', () => endpoint),
    foreignKey: nullable(id()),
    relationships: ids(),
    state: oneOf(['both', 'relationship', 'foreign_key']),
    polymorphic: boolean(),
    note: text(),
});

const derivedLink = object({
    id: id(),
    from: id(),
    to: id(),
    via: array(id(), { minItems: 1 }),
    relationship: id(),
});

const diagnostic = object({
    kind: string({ minLength: 1 }),
    category: oneOf(['extraction', 'inspection', 'reconciliation', 'drift', 'lint']),
    severity: oneOf(['error', 'warning', 'info']),
    certainty: oneOf(['certain', 'likely']),
    subject: object({
        type: oneOf(['document', 'connection', 'table', 'column', 'index', 'foreignKey', 'constraint', 'model', 'relationship', 'link']),
        id: nullable(id()),
        columns: nullable(names()),
        label: text(),
    }),
    message: string(),
    'extensions?': ref('Extensions', () => extensions),
});

export const documentShape: Shape = object({
    format: literal(FORMAT),
    version: string({ pattern: VERSION_PATTERN }),
    source: oneOf(['declared', 'database', 'combined']),
    generator: object({ name: string({ minLength: 1 }), orm: text() }),
    note: text(),
    connections: array(ref('Connection', () => connection)),
    models: array(ref('Model', () => model)),
    relationships: array(ref('Relationship', () => relationship)),
    links: array(ref('Link', () => link)),
    derivedLinks: array(ref('DerivedLink', () => derivedLink)),
    diagnostics: array(ref('Diagnostic', () => diagnostic)),
    'extensions?': ref('Extensions', () => extensions),
});

const definitions: Record<string, Shape> = {
    Column: column,
    Connection: connection,
    Constraint: constraint,
    Coverage: coverage,
    DefaultValue: defaultValue,
    DerivedLink: derivedLink,
    Diagnostic: diagnostic,
    Drift: driftShape,
    Endpoint: endpoint,
    Extensions: extensions,
    ForeignKey: foreignKey,
    Index: index,
    IndexOptions: indexOptions,
    IndexPart: indexPart,
    Link: link,
    Model: model,
    OrmDefault: ormDefault,
    Pivot: pivot,
    Provenance: provenance,
    Relationship: relationship,
    Source: source,
    Table: table,
};

export const SCHEMA_ID = 'https://laranex.github.io/schema-viewer-ui/laranex-schema/1.0.json';

// The JSON Schema (draft 2020-12) published as schema.json. It checks shape only; validateDocument() also checks the
// references and rules docs/contract.md states.
export function jsonSchema(): JsonSchema {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: SCHEMA_ID,
        title: 'laranex-schema 1.x document',
        ...documentShape.schema,
        $defs: Object.fromEntries(Object.entries(definitions).map(([name, shape]) => [name, shape.schema])),
    };
}
