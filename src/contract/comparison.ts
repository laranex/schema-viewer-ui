import { byCodePoint, byList, comparisonId, diagnosticId, differenceId } from './ids';
import {
    CHANGES,
    OBJECT_TYPES,
    type Change,
    type Column,
    type Comparison,
    type Connection,
    type Constraint,
    type Coverage,
    type Difference,
    type DifferenceRef,
    type Diagnostic,
    type Feature,
    type FeatureCoverage,
    type FieldDifference,
    type ForeignKey,
    type Index,
    type JsonValue,
    type ObjectType,
    type SchemaDocument,
    type Scope,
    type Severity,
    type Table,
} from './types';

// The schema comparison every producer implements (docs/contract.md, "Comparisons"), checked against
// contract/conformance/comparison. Producers compute comparisons; viewers only display the stored result.

export type SeverityOverride = { objectType: ObjectType; change: Change; field?: string | null; severity: Severity };
export type CompareOptions = { overrides?: SeverityOverride[]; limit?: number | null };
type ComparedDocument = Pick<SchemaDocument, 'source' | 'connections'>;

// The features a comparison reads; a side whose coverage does not have them all complete makes it incomplete.
export const COMPARISON_FEATURES: Feature[] = [
    'tables',
    'columns',
    'columnTypes',
    'defaults',
    'comments',
    'primaryKeys',
    'foreignKeys',
    'referentialActions',
    'indexes',
    'indexExpressions',
    'indexPredicates',
    'uniqueConstraints',
    'checkConstraints',
];

// Fields compared on a column whose comparison rests on normalized text: their differences are "likely".
const LIKELY_FIELDS: Record<ObjectType, string[]> = {
    table: [],
    column: ['default', 'generated'],
    primaryKey: [],
    index: ['predicate'],
    foreignKey: [],
    constraint: ['expression'],
};

export function defaultSeverity(objectType: ObjectType, change: Change, field: string | null = null): Severity {
    switch (objectType) {
        case 'table':
            return change === 'changed' ? 'info' : 'error';
        case 'column':
            return change !== 'changed' ? 'error' : field === 'comment' ? 'info' : 'warning';
        case 'primaryKey':
            return 'error';
        default:
            return 'warning';
    }
}

const RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 };
const SEVERITIES: Severity[] = ['error', 'warning', 'info'];

// The fields a changed difference of each object type can list (the comparison algorithm), in code point order:
// exactly the fields a severity override may name.
export const DIFFERENCE_FIELDS: Record<ObjectType, readonly string[]> = {
    table: ['comment'],
    column: ['collation', 'comment', 'default', 'enum', 'generated', 'nullable', 'type'],
    primaryKey: ['columns'],
    index: ['included', 'method', 'name', 'parts', 'predicate', 'unique'],
    foreignKey: ['columns', 'deferrable', 'foreignColumns', 'foreignTable', 'initially', 'name', 'onDelete', 'onUpdate'],
    constraint: ['columns', 'expression', 'name'],
};

const OVERRIDE_KEYS = ['objectType', 'change', 'field', 'severity'];

// Checks severity overrides as a producer reads them from its configuration: an array of
// { objectType, change, field?, severity }. Returns the errors, empty when the overrides are valid.
export function validateSeverityOverrides(overrides: unknown): string[] {
    if (!Array.isArray(overrides)) {
        return ['overrides must be an array'];
    }
    const errors: string[] = [];
    const seen = new Map<string, number>();
    overrides.forEach((o: unknown, i) => {
        const at = `overrides[${i}]`;
        if (typeof o !== 'object' || o === null || Array.isArray(o)) {
            errors.push(`${at} must be an object`);
            return;
        }
        const { objectType, change, field = null, severity } = o as Record<string, unknown>;
        const unknown = Object.keys(o).filter((k) => !OVERRIDE_KEYS.includes(k)).sort(byCodePoint);
        if (unknown.length) {
            errors.push(`${at} has unknown keys: ${unknown.join(', ')}`);
        }
        const typeOk = OBJECT_TYPES.includes(objectType as ObjectType);
        const changeOk = CHANGES.includes(change as Change);
        if (!typeOk) {
            errors.push(`${at}.objectType must be one of ${OBJECT_TYPES.join(', ')}`);
        }
        if (!changeOk) {
            errors.push(`${at}.change must be one of ${CHANGES.join(', ')}`);
        }
        if (!SEVERITIES.includes(severity as Severity)) {
            errors.push(`${at}.severity must be one of ${SEVERITIES.join(', ')}`);
        }
        if (field !== null && typeof field !== 'string') {
            errors.push(`${at}.field must be a string or null`);
        } else if (field !== null && changeOk && change !== 'changed') {
            errors.push(`${at}.field applies only to changed differences, not ${change as string}`);
        } else if (field !== null && typeOk && change === 'changed' && !DIFFERENCE_FIELDS[objectType as ObjectType].includes(field)) {
            errors.push(`${at}.field must be one of ${DIFFERENCE_FIELDS[objectType as ObjectType].join(', ')} for objectType ${objectType as string}`);
        }
        if (typeOk && changeOk && (field === null || typeof field === 'string')) {
            const key = JSON.stringify([objectType, change, field]);
            const first = seen.get(key);
            if (first === undefined) {
                seen.set(key, i);
            } else {
                errors.push(`${at} repeats overrides[${first}]`);
            }
        }
    });
    return errors;
}

function severityOf(objectType: ObjectType, change: Change, field: string | null, overrides: SeverityOverride[]): Severity {
    const match = (f: string | null) => overrides.find((o) => o.objectType === objectType && o.change === change && (o.field ?? null) === f)?.severity;
    return (field !== null ? match(field) : undefined) ?? match(null) ?? defaultSeverity(objectType, change, field);
}

// Base name and arguments of a column type, or null when it cannot be parsed. The same rules as the Python producer's
// reconciliation: synonyms collapse (character varying → varchar, int4 → integer), display widths and signedness drop.
const TYPE_SYNONYMS: Record<string, string> = {
    int: 'integer', int4: 'integer', integer: 'integer', mediumint: 'integer', serial: 'integer',
    bigint: 'bigint', int8: 'bigint', bigserial: 'bigint', smallint: 'smallint', int2: 'smallint',
    smallserial: 'smallint', tinyint: 'tinyint', bool: 'boolean', boolean: 'boolean',
    'character varying': 'varchar', varchar: 'varchar', nvarchar: 'varchar', character: 'char', char: 'char',
    bpchar: 'char', nchar: 'char', text: 'text', clob: 'text', datetime: 'timestamp', timestamp: 'timestamp',
    'timestamp without time zone': 'timestamp', timestamptz: 'timestamptz', 'timestamp with time zone': 'timestamptz',
    'time without time zone': 'time', 'time with time zone': 'timetz', timetz: 'timetz', float: 'double',
    float8: 'double', double: 'double', 'double precision': 'double', real: 'real', float4: 'real',
    numeric: 'numeric', decimal: 'numeric', blob: 'blob', bytea: 'blob', varbinary: 'blob', largebinary: 'blob',
};
const INTEGERS = new Set(['integer', 'bigint', 'smallint', 'tinyint']);

export function normalizeType(text: string | null, timezone: boolean | null = null): string | null {
    if (!text) {
        return null;
    }
    let value = text.trim().toLowerCase().replace(/\s+/g, ' ');
    value = value.replace(/\b(unsigned|zerofill|signed)\b/g, '').trim();
    const match = /^([a-z_][\w ]*?)\s*(\((.*)\))?\s*(\[\])?\s*(with(out)? time zone)?$/.exec(value);
    if (!match) {
        return null;
    }
    let base = (match[5] ? `${match[1]} ${match[5]}` : match[1]).trim();
    base = TYPE_SYNONYMS[base] ?? base;
    if (base === 'timestamp' && timezone) {
        base = 'timestamptz';
    }
    let args = (match[3] ?? '').replace(/\s+/g, '');
    if (base === 'tinyint' && args === '1') {
        base = 'boolean';
        args = '';
    }
    if (INTEGERS.has(base) || (base === 'double' && args === '53')) {
        args = '';
    }
    return `${base}${match[4] ? '[]' : ''}(${args})`;
}

// SQL text compared loosely: lower case, without casts, whitespace, parentheses or identifier quotes, and without the
// side's own schema qualifier, so tenant_a.seq and tenant_b.seq compare equal.
export function normalizeSql(text: string | null, schema: string | null = null, driver: string | null = null): string {
    let value = (text ?? '').toLowerCase();
    if (schema !== null) {
        const s = schema.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        value = value.replace(new RegExp(`(?:"${s}"|\`${s}\`|\\b${s})\\.`, 'g'), '');
    }
    if (driver === 'mariadb') {
        value = value.replaceAll('octet_length(', 'length(');
    }
    value = value.replace(/::[\w .[\]"]+/g, '');
    return value.replace(/[\s()`"]/g, '');
}

const trivialType = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

export const tableLabel = (table: Pick<Table, 'schema' | 'name'>) => (table.schema ? `${table.schema}.${table.name}` : table.name);

export function inScope(table: Table, connection: Connection, schema: string | null): boolean {
    return schema === null ? table.schema === null || table.schema === connection.defaultSchema : table.schema === schema || (table.schema === null && connection.defaultSchema === schema);
}

type Side = {
    scope: Scope;
    connection: Connection;
    // The physical entities: in a combined document, only what the database reported.
    physical: (entity: { provenance: string[] }) => boolean;
    tables: Map<string, Table>;
    nameOf: (tableId: string) => string;
    coverage: Coverage | null;
};

function side(doc: ComparedDocument, scope: Scope): Side {
    const connection = connectionOf(doc, scope);
    const physical = (e: { provenance: string[] }) => doc.source !== 'combined' || e.provenance.includes('database');
    const tables = new Map<string, Table>();
    for (const t of connection.tables) {
        if (inScope(t, connection, scope.schema) && physical(t)) {
            if (tables.has(t.name)) {
                throw new Error(`Table name ${t.name} occurs twice in scope ${JSON.stringify(scope)}`);
            }
            tables.set(t.name, t);
        }
    }
    const all = new Map(connection.tables.map((t) => [t.id, t.name]));
    return {
        scope,
        connection,
        physical,
        tables,
        nameOf: (id) => all.get(id) ?? id,
        coverage: coverageOf(doc, connection),
    };
}

// Why a side's coverage does not support a comparison: no coverage at all; else each compared feature that is not
// complete or not applicable (state partial, unavailable, or unknown when left out), in COMPARISON_FEATURES order;
// then the scope's schema when the coverage did not read it. The gate words its coverage_incomplete gaps alike.
export type CoverageGap = { kind: 'coverage_unknown' } | { kind: 'feature'; feature: Feature; state: FeatureCoverage | 'unknown' } | { kind: 'schema_not_read'; schema: string };

function gapsOf(coverage: Coverage | null, connection: Connection, schema: string | null): CoverageGap[] {
    if (!coverage) {
        return [{ kind: 'coverage_unknown' }];
    }
    const gaps: CoverageGap[] = [];
    for (const feature of COMPARISON_FEATURES) {
        const state = coverage.features[feature];
        if (state !== 'complete' && state !== 'not_applicable') {
            gaps.push({ kind: 'feature', feature, state: state ?? 'unknown' });
        }
    }
    const read = schema ?? connection.defaultSchema;
    if (read !== null && coverage.schemas !== null && !coverage.schemas.includes(read)) {
        gaps.push({ kind: 'schema_not_read', schema: read });
    }
    return gaps;
}

// A gap as messages spell it: "coverage unknown", "{feature} {state}", "schema {schema} not read".
export function coverageGapText(gap: CoverageGap): string {
    return gap.kind === 'coverage_unknown' ? 'coverage unknown' : gap.kind === 'feature' ? `${gap.feature} ${gap.state}` : `schema ${gap.schema} not read`;
}

// The gaps of one side of a comparison: its connection's database coverage, or declared coverage in a declared
// document. Throws for a scope whose connection the document does not have.
export function coverageGaps(doc: ComparedDocument, scope: Scope): CoverageGap[] {
    const connection = connectionOf(doc, scope);
    return gapsOf(coverageOf(doc, connection), connection, scope.schema);
}

// Whether a side's coverage supports a comparison: it has no coverage gaps.
export function scopeCovered(coverage: Coverage | null, connection: Connection, schema: string | null): boolean {
    return gapsOf(coverage, connection, schema).length === 0;
}

function connectionOf(doc: ComparedDocument, scope: Scope): Connection {
    const connection = doc.connections.find((c) => c.id === scope.connection);
    if (!connection) {
        throw new Error(`Unknown connection ${scope.connection}`);
    }
    return connection;
}

const coverageOf = (doc: ComparedDocument, connection: Connection) => (doc.source === 'declared' ? connection.coverage.declared : connection.coverage.database);

type Found = { objectType: ObjectType; key: string[]; change: Change; baseline: DifferenceRef | null; target: DifferenceRef | null; fields: FieldDifference[]; likely: boolean };

// Pairs entities in two passes: first by an identity both sides share (by), then the rest by a second identity (then).
// Equal identities pair in id order. Returns pairs with the pass that matched them, and the unmatched on each side.
function pair<T extends { id: string }>(a: T[], b: T[], passes: ((x: T) => string | null)[]) {
    const pairs: { a: T; b: T; pass: number }[] = [];
    let left = [...a].sort((x, y) => (x.id < y.id ? -1 : 1));
    let right = [...b].sort((x, y) => (x.id < y.id ? -1 : 1));
    passes.forEach((identity, pass) => {
        const rest: T[] = [];
        for (const x of left) {
            const k = identity(x);
            const i = k === null ? -1 : right.findIndex((y) => identity(y) === k);
            if (i < 0) {
                rest.push(x);
            } else {
                pairs.push({ a: x, b: right[i], pass });
                right = right.filter((_, n) => n !== i);
            }
        }
        left = rest;
    });
    return { pairs, missing: left, extra: right };
}

const same = (a: JsonValue, b: JsonValue) => JSON.stringify(a) === JSON.stringify(b);

// Compares the tables of two scopes of one document. Throws when a scope's table names repeat or the overrides are
// invalid (validateSeverityOverrides).
export function compareScopes(doc: ComparedDocument, baseline: Scope, target: Scope, options: CompareOptions = {}): Comparison {
    const invalid = validateSeverityOverrides(options.overrides ?? []);
    if (invalid.length) {
        throw new Error(`Invalid severity overrides: ${invalid.join('; ')}`);
    }
    const A = side(doc, baseline);
    const B = side(doc, target);
    const sameDriver = A.connection.driver !== null && A.connection.driver === B.connection.driver;
    const found: Found[] = [];
    const add = (objectType: ObjectType, key: string[], a: DifferenceRef | null, b: DifferenceRef | null, fields: FieldDifference[] = [], likely = false) => {
        const change: Change = a && b ? 'changed' : a ? 'missing' : 'extra';
        if (change !== 'changed') {
            found.push({ objectType, key, change, baseline: a, target: b, fields: [], likely: false });
        } else if (fields.length) {
            found.push({ objectType, key, change, baseline: a, target: b, fields: fields.sort((x, y) => (x.field < y.field ? -1 : 1)), likely });
        }
    };

    const names = [...new Set([...A.tables.keys(), ...B.tables.keys()])];
    for (const name of names) {
        const ta = A.tables.get(name);
        const tb = B.tables.get(name);
        const ref = (t: Table | undefined, id: string | null = null, suffix = '') => (t ? { table: t.id, id, label: `${tableLabel(t)}${suffix}` } : null);
        if (!ta || !tb) {
            add('table', [name], ref(ta), ref(tb));
            continue;
        }
        add('table', [name], ref(ta), ref(tb), ta.comment === tb.comment ? [] : [{ field: 'comment', baseline: ta.comment, target: tb.comment }]);

        // Columns, by name.
        const ca = new Map(ta.columns.filter(A.physical).map((c) => [c.name, c]));
        const cb = new Map(tb.columns.filter(B.physical).map((c) => [c.name, c]));
        for (const column of [...new Set([...ca.keys(), ...cb.keys()])]) {
            const x = ca.get(column);
            const y = cb.get(column);
            const fields = x && y ? columnFields(x, y, A, B, sameDriver) : { fields: [], likely: false };
            add('column', [name, column], x ? ref(ta, null, `.${column}`) : null, y ? ref(tb, null, `.${column}`) : null, fields.fields, fields.likely);
        }

        // The primary key, by its ordered columns.
        const pa = ta.primaryKey;
        const pb = tb.primaryKey;
        if (pa.length || pb.length) {
            add('primaryKey', [name], pa.length ? ref(ta, null, ' primary key') : null, pb.length ? ref(tb, null, ' primary key') : null, same(pa, pb) ? [] : [{ field: 'columns', baseline: pa, target: pb }]);
        }

        // Indexes, by name, then by key parts and uniqueness. Indexes backing the primary key or a unique constraint
        // in the document are compared as those.
        const compared = (t: Table, s: Side) => t.indexes.filter((i) => s.physical(i) && i.backs?.kind !== 'primary_key' && !(i.backs?.kind === 'unique_constraint' && i.backs.constraint !== null));
        const parts = (i: Index, s: Side) =>
            `${i.parts.map((p) => (p.column !== null ? p.column : `expr:${normalizeSql(p.expression, s.scope.schema, s.connection.driver)}`) + (p.order === 'desc' ? ' desc' : '')).join(',')}${i.expression && !i.parts.some((p) => p.expression !== null) ? ',?' : ''}`;
        const signature = (i: Index, s: Side) => `${i.unique ? 'unique ' : ''}(${parts(i, s)})`;
        const ia = compared(ta, A);
        const ib = compared(tb, B);
        const sigOf = new Map([...ia.map((i) => [i, signature(i, A)] as const), ...ib.map((i) => [i, signature(i, B)] as const)]);
        const indexes = pair<Index>(ia, ib, [(i) => (i.name === null ? null : `name:${i.name}`), (i) => sigOf.get(i) ?? null]);
        const iref = (t: Table, i: Index) => ref(t, i.id, `.${i.name ?? sigOf.get(i)}`);
        for (const { a, b, pass } of indexes.pairs) {
            const f: FieldDifference[] = [];
            if (pass === 1 && a.name !== null && b.name !== null && a.name !== b.name) {
                f.push({ field: 'name', baseline: a.name, target: b.name });
            }
            if (a.unique !== b.unique) {
                f.push({ field: 'unique', baseline: a.unique, target: b.unique });
            }
            const [xa, xb] = [parts(a, A), parts(b, B)];
            if (xa !== xb) {
                f.push({ field: 'parts', baseline: xa, target: xb });
            }
            if (a.method !== null && b.method !== null && a.method.toLowerCase() !== b.method.toLowerCase()) {
                f.push({ field: 'method', baseline: a.method, target: b.method });
            }
            if (a.partial !== b.partial || normalizeSql(a.predicate, A.scope.schema, A.connection.driver) !== normalizeSql(b.predicate, B.scope.schema, B.connection.driver)) {
                f.push({ field: 'predicate', baseline: a.partial ? a.predicate : null, target: b.partial ? b.predicate : null });
            }
            if (!same([...a.included].sort(), [...b.included].sort())) {
                f.push({ field: 'included', baseline: a.included, target: b.included });
            }
            const expressionParts = f.some((x) => x.field === 'parts') && (a.expression || b.expression);
            add('index', [name, pass === 0 ? 'name' : 'parts', pass === 0 ? (a.name as string) : (sigOf.get(a) as string)], iref(ta, a), iref(tb, b), f, expressionParts || f.some((x) => LIKELY_FIELDS.index.includes(x.field)));
        }
        const unmatchedIndex = (i: Index): string[] => (i.name !== null ? [name, 'name', i.name] : [name, 'parts', sigOf.get(i) as string]);
        indexes.missing.forEach((i) => add('index', unmatchedIndex(i), iref(ta, i), null));
        indexes.extra.forEach((i) => add('index', unmatchedIndex(i), null, iref(tb, i)));

        // Foreign keys, by columns, referenced table name and referenced columns, then by name.
        const fsig = (f: ForeignKey, s: Side) => `${f.columns.join(',')}->${s.nameOf(f.foreignTable)}(${f.foreignColumns.join(',')})`;
        const fa = ta.foreignKeys.filter(A.physical);
        const fb = tb.foreignKeys.filter(B.physical);
        const fsigOf = new Map([...fa.map((f) => [f, fsig(f, A)] as const), ...fb.map((f) => [f, fsig(f, B)] as const)]);
        const foreignKeys = pair<ForeignKey>(fa, fb, [(f) => fsigOf.get(f) ?? null, (f) => (f.name === null ? null : `name:${f.name}`)]);
        const fref = (t: Table, f: ForeignKey) => ref(t, f.id, `.${f.name ?? fsigOf.get(f)}`);
        // MySQL and MariaDB treat RESTRICT as NO ACTION, so either side being one makes them equal.
        const restrictIsNoAction = [A, B].some((x) => x.connection.driver === 'mysql' || x.connection.driver === 'mariadb');
        const action = (value: string | null) => {
            const v = value ?? 'NO ACTION';
            return v === 'RESTRICT' && restrictIsNoAction ? 'NO ACTION' : v;
        };
        for (const { a, b, pass } of foreignKeys.pairs) {
            const f: FieldDifference[] = [];
            if (pass === 0 && a.name !== null && b.name !== null && a.name !== b.name) {
                f.push({ field: 'name', baseline: a.name, target: b.name });
            }
            if (pass === 1) {
                if (!same(a.columns, b.columns)) {
                    f.push({ field: 'columns', baseline: a.columns, target: b.columns });
                }
                if (A.nameOf(a.foreignTable) !== B.nameOf(b.foreignTable)) {
                    f.push({ field: 'foreignTable', baseline: A.nameOf(a.foreignTable), target: B.nameOf(b.foreignTable) });
                }
                if (!same(a.foreignColumns, b.foreignColumns)) {
                    f.push({ field: 'foreignColumns', baseline: a.foreignColumns, target: b.foreignColumns });
                }
            }
            for (const field of ['onDelete', 'onUpdate'] as const) {
                if (action(a[field]) !== action(b[field])) {
                    f.push({ field, baseline: a[field], target: b[field] });
                }
            }
            for (const field of ['deferrable', 'initially'] as const) {
                if (a[field] !== null && b[field] !== null && a[field] !== b[field]) {
                    f.push({ field, baseline: a[field], target: b[field] });
                }
            }
            add('foreignKey', pass === 0 ? [name, 'references', fsigOf.get(a) as string] : [name, 'name', a.name as string], fref(ta, a), fref(tb, b), f);
        }
        const unmatchedFk = (f: ForeignKey): string[] => (f.name !== null ? [name, 'name', f.name] : [name, 'references', fsigOf.get(f) as string]);
        foreignKeys.missing.forEach((f) => add('foreignKey', unmatchedFk(f), fref(ta, f), null));
        foreignKeys.extra.forEach((f) => add('foreignKey', unmatchedFk(f), null, fref(tb, f)));

        // Constraints, by kind and name, then by kind and definition (columns, or the check expression).
        const definition = (c: Constraint, s: Side) => (c.kind === 'unique' && c.columns.length ? c.columns.join(',') : normalizeSql(c.expression, s.scope.schema, s.connection.driver));
        const ka = ta.constraints.filter(A.physical);
        const kb = tb.constraints.filter(B.physical);
        const defOf = new Map([...ka.map((c) => [c, definition(c, A)] as const), ...kb.map((c) => [c, definition(c, B)] as const)]);
        const constraints = pair<Constraint>(ka, kb, [(c) => (c.name === null ? null : `${c.kind}:name:${c.name}`), (c) => `${c.kind}:${defOf.get(c)}`]);
        const kref = (t: Table, c: Constraint) => ref(t, c.id, `.${c.name ?? defOf.get(c)}`);
        for (const { a, b, pass } of constraints.pairs) {
            const f: FieldDifference[] = [];
            if (pass === 1 && a.name !== null && b.name !== null && a.name !== b.name) {
                f.push({ field: 'name', baseline: a.name, target: b.name });
            }
            if (pass === 0 && a.kind === 'unique' && !same(a.columns, b.columns)) {
                f.push({ field: 'columns', baseline: a.columns, target: b.columns });
            }
            if (pass === 0 && defOf.get(a) !== defOf.get(b) && (a.kind === 'check' || !a.columns.length)) {
                f.push({ field: 'expression', baseline: a.expression, target: b.expression });
            }
            add('constraint', pass === 0 ? [name, a.kind, 'name', a.name as string] : [name, a.kind, 'definition', defOf.get(a) as string], kref(ta, a), kref(tb, b), f, f.some((x) => LIKELY_FIELDS.constraint.includes(x.field)));
        }
        const unmatchedConstraint = (c: Constraint): string[] => (c.name !== null ? [name, c.kind, 'name', c.name] : [name, c.kind, 'definition', defOf.get(c) as string]);
        constraints.missing.forEach((c) => add('constraint', unmatchedConstraint(c), kref(ta, c), null));
        constraints.extra.forEach((c) => add('constraint', unmatchedConstraint(c), null, kref(tb, c)));
    }

    // Identities that still coincide (unnamed duplicates) get "#2", "#3", … in the order of their entity ids.
    const groups = new Map<string, Found[]>();
    for (const f of found) {
        const k = JSON.stringify([f.objectType, f.key]);
        groups.set(k, [...(groups.get(k) ?? []), f]);
    }
    for (const group of groups.values()) {
        if (group.length > 1) {
            const refId = (f: Found) => (f.baseline ?? f.target)?.id ?? '';
            group.sort((x, y) => (refId(x) < refId(y) ? -1 : refId(x) > refId(y) ? 1 : CHANGES.indexOf(x.change) - CHANGES.indexOf(y.change)));
            group.forEach((f, n) => n > 0 && f.key.push(`#${n + 1}`));
        }
    }

    const overrides = options.overrides ?? [];
    const id = comparisonId(baseline, target);
    const differences: Difference[] = found
        .sort((x, y) => OBJECT_TYPES.indexOf(x.objectType) - OBJECT_TYPES.indexOf(y.objectType) || byList(x.key, y.key) || CHANGES.indexOf(x.change) - CHANGES.indexOf(y.change))
        .map((f) => ({
            id: differenceId(id, f.objectType, f.key),
            change: f.change,
            objectType: f.objectType,
            key: f.key,
            baseline: f.baseline,
            target: f.target,
            fields: f.fields,
            severity:
                f.change === 'changed'
                    ? f.fields.map((x) => severityOf(f.objectType, f.change, x.field, overrides)).reduce((m, s) => (RANK[s] > RANK[m] ? s : m), 'info' as Severity)
                    : severityOf(f.objectType, f.change, null, overrides),
            certainty: f.likely ? 'likely' : 'certain',
        }));
    const summary = { missing: 0, extra: 0, changed: 0 };
    differences.forEach((d) => summary[d.change]++);
    const limit = options.limit ?? null;
    const kept = limit === null ? differences : differences.slice(0, limit);
    const omitted = differences.length - kept.length;
    const complete = omitted === 0 && [A, B].every((s) => gapsOf(s.coverage, s.connection, s.scope.schema).length === 0);
    return { id, baseline, target, complete, omitted, summary, differences: kept };
}

function columnFields(a: Column, b: Column, A: Side, B: Side, sameDriver: boolean): { fields: FieldDifference[]; likely: boolean } {
    const fields: FieldDifference[] = [];
    let likely = false;
    const typeDiffers = sameDriver ? trivialType(a.type) !== trivialType(b.type) : (normalizeType(a.type, a.timezone) ?? trivialType(a.type)) !== (normalizeType(b.type, b.timezone) ?? trivialType(b.type));
    if (typeDiffers) {
        fields.push({ field: 'type', baseline: a.type, target: b.type });
        likely ||= !sameDriver;
    }
    if (a.nullable !== b.nullable) {
        fields.push({ field: 'nullable', baseline: a.nullable, target: b.nullable });
    }
    // Identity, sequence and auto-increment defaults are one kind of value, whatever the sequence or dialect.
    const dflt = (c: Column, s: Side) =>
        c.default?.kind === 'identity' || c.default?.kind === 'sequence' || (c.default === null && c.autoIncrement === true) ? 'auto' : c.default === null ? null : `=${normalizeSql(c.default.value, s.scope.schema, s.connection.driver)}`;
    if (dflt(a, A) !== dflt(b, B)) {
        fields.push({ field: 'default', baseline: a.default, target: b.default });
    }
    if (a.collation !== null && b.collation !== null && a.collation.toLowerCase() !== b.collation.toLowerCase()) {
        fields.push({ field: 'collation', baseline: a.collation, target: b.collation });
    }
    if (!same(a.enum?.values ?? null, b.enum?.values ?? null)) {
        fields.push({ field: 'enum', baseline: a.enum?.values ?? null, target: b.enum?.values ?? null });
    }
    const gen = (c: Column, s: Side) => (c.generated === null ? null : `${c.generated.kind}:${normalizeSql(c.generated.expression, s.scope.schema, s.connection.driver)}`);
    if (gen(a, A) !== gen(b, B)) {
        fields.push({ field: 'generated', baseline: a.generated, target: b.generated });
    }
    if (a.comment !== b.comment) {
        fields.push({ field: 'comment', baseline: a.comment, target: b.comment });
    }
    likely ||= fields.some((f) => LIKELY_FIELDS.column.includes(f.field));
    return { fields, likely };
}

// A comparison as people request it, by connection name. A target schema "*" stands for every schema the target
// connection's inspection read, except the baseline's own scope; "*" in a baseline is an ordinary schema name.
export type RequestedComparison = { baseline: { connection: string; schema: string | null }; target: { connection: string; schema: string | null } };
export type ExpandedComparison = { baseline: Scope; target: Scope; request: RequestedComparison };
export const REQUEST_ERROR_KINDS = ['unknown_connection', 'no_schemas', 'no_match', 'duplicate'] as const;
export type RequestError = { kind: (typeof REQUEST_ERROR_KINDS)[number]; request: RequestedComparison; message: string };

export const WILDCARD = '*';

// null sorts before any string.
const byNullable = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : byCodePoint(a, b));
const byScope = (a: { connection: string; schema: string | null }, b: { connection: string; schema: string | null }) => byCodePoint(a.connection, b.connection) || byNullable(a.schema, b.schema);
// Requests, and pairs of scopes, by baseline connection, baseline schema, target connection and target schema.
export const byRequest = (a: RequestedComparison, b: RequestedComparison) => byScope(a.baseline, b.baseline) || byScope(a.target, b.target);

// A scope as people write it: the connection's name, then ":schema".
export const spellScope = (connection: string, schema: string | null) => (schema === null ? connection : `${connection}:${schema}`);

// Resolves requested comparisons to the scope pairs they stand for (docs/contract.md, "Requested comparisons").
// Never throws; what cannot be resolved is an error, and the rest is still expanded.
export function expandComparisonRequests(doc: ComparedDocument, requests: readonly RequestedComparison[]): { pairs: ExpandedComparison[]; errors: RequestError[] } {
    const byName = new Map(doc.connections.map((c) => [c.name, c]));
    const chosen = new Map<string, ExpandedComparison>();
    const errors: RequestError[] = [];
    const sorted = requests.map((r) => ({ baseline: { connection: r.baseline.connection, schema: r.baseline.schema }, target: { connection: r.target.connection, schema: r.target.schema } })).sort(byRequest);
    sorted.forEach((request, i) => {
        const spelled = `${spellScope(request.baseline.connection, request.baseline.schema)} → ${spellScope(request.target.connection, request.target.schema)}`;
        const error = (kind: RequestError['kind'], message: string) => errors.push({ kind, request, message: `Requested comparison ${spelled} ${message}` });
        if (i > 0 && byRequest(sorted[i - 1], request) === 0) {
            if (i === 1 || byRequest(sorted[i - 2], request) !== 0) {
                error('duplicate', 'is listed more than once.');
            }
            return;
        }
        const baseline = byName.get(request.baseline.connection);
        const target = byName.get(request.target.connection);
        for (const name of new Set([request.baseline.connection, request.target.connection])) {
            if (!byName.has(name)) {
                error('unknown_connection', `names connection ${name}, which the document does not have.`);
            }
        }
        if (!baseline || !target) {
            return;
        }
        const wildcard = request.target.schema === WILDCARD;
        let schemas: (string | null)[] = [request.target.schema];
        if (wildcard) {
            const read = coverageOf(doc, target)?.schemas ?? null;
            if (read === null) {
                error('no_schemas', `cannot be expanded: the inspection of connection ${target.name} lists no schemas.`);
                return;
            }
            const own = (s: string) => target.id === baseline.id && (s === request.baseline.schema || (request.baseline.schema === null && s === target.defaultSchema));
            schemas = [...new Set(read)].sort(byCodePoint).filter((s) => !own(s));
            if (schemas.length === 0) {
                error('no_match', 'matches no schema.');
            }
        }
        for (const schema of schemas) {
            const pair: ExpandedComparison = { baseline: { connection: baseline.id, schema: request.baseline.schema }, target: { connection: target.id, schema }, request };
            const key = JSON.stringify([pair.baseline, pair.target]);
            // A pair named explicitly takes precedence over the same pair from a "*" expansion.
            if (!chosen.has(key) || !wildcard) {
                chosen.set(key, pair);
            }
        }
    });
    const pairs = [...chosen.values()].sort((a, b) => byScope(a.baseline, b.baseline) || byScope(a.target, b.target));
    return { pairs, errors };
}

const scopeName = (doc: ComparedDocument, scope: Scope) => spellScope(doc.connections.find((c) => c.id === scope.connection)?.name ?? scope.connection, scope.schema);

// The comparison_incomplete diagnostic a producer stores beside an incomplete comparison: none when it is complete.
export function comparisonDiagnostics(doc: ComparedDocument, comparison: Comparison): Diagnostic[] {
    if (comparison.complete) {
        return [];
    }
    const reasons: string[] = [];
    if (comparison.omitted > 0) {
        const { missing, extra, changed } = comparison.summary;
        reasons.push(`${comparison.omitted} of ${missing + extra + changed} differences are left out by the limit of ${comparison.differences.length}`);
    }
    for (const [side, scope] of [['baseline', comparison.baseline], ['target', comparison.target]] as const) {
        const gaps = coverageGaps(doc, scope);
        if (gaps.length) {
            reasons.push(`the ${side} ${scopeName(doc, scope)} is not completely covered (${gaps.map(coverageGapText).join(', ')})`);
        }
    }
    const label = `${scopeName(doc, comparison.baseline)}=${scopeName(doc, comparison.target)}`;
    const subject = { type: 'comparison' as const, id: comparison.id, columns: null, label };
    const message = reasons.length ? `Comparison ${label} is incomplete: ${reasons.join('; ')}` : `Comparison ${label} is incomplete`;
    const d = { kind: 'comparison_incomplete', category: 'inspection' as const, severity: 'warning' as const, certainty: 'certain' as const, subject, message };
    return [{ id: diagnosticId(d), ...d }];
}

// Diagnostics in canonical order: category, kind, subject type, subject id (null as ""), message.
const diagnosticKey = (d: Diagnostic) => [d.category, d.kind, d.subject.type, d.subject.id ?? '', d.message];

// The document with these comparisons stored: stored comparisons with the same ids, and every diagnostic whose subject
// is one of them, are replaced; the others are kept. Each new comparison's diagnostics (comparisonDiagnostics) are
// added. Comparisons end sorted by id, diagnostics in canonical order, each diagnostic id once. Throws when two of the
// comparisons have one id.
export function storeComparisons<T extends SchemaDocument>(doc: T, comparisons: readonly Comparison[]): T {
    const ids = new Set(comparisons.map((c) => c.id));
    if (ids.size !== comparisons.length) {
        const repeated = comparisons.find((c, i) => comparisons.findIndex((x) => x.id === c.id) !== i) as Comparison;
        throw new Error(`Comparison ${repeated.id} is listed more than once`);
    }
    const kept = doc.comparisons.filter((c) => !ids.has(c.id));
    const diagnostics = [...doc.diagnostics.filter((d) => !(d.subject.type === 'comparison' && d.subject.id !== null && ids.has(d.subject.id))), ...comparisons.flatMap((c) => comparisonDiagnostics(doc, c))];
    const unique = new Map<string, Diagnostic>();
    for (const d of diagnostics.sort((a, b) => byList(diagnosticKey(a), diagnosticKey(b)))) {
        if (!unique.has(d.id)) {
            unique.set(d.id, d);
        }
    }
    return { ...doc, comparisons: [...kept, ...comparisons].sort((a, b) => byCodePoint(a.id, b.id)), diagnostics: [...unique.values()] };
}
