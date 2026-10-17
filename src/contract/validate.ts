import { documentShape } from './document';
import { DIAGNOSTIC_KINDS, FORMAT, MAJOR, type Coverage, type Diagnostic, type Endpoint, type SchemaDocument, type Table } from './types';

export type ValidationOptions = {
    // Reject properties this version does not define. Producers validate strictly; viewers read any 1.x minor and
    // ignore what they do not know.
    strict?: boolean;
};

export type ValidationResult = { ok: true; document: SchemaDocument; errors: [] } | { ok: false; errors: string[] };

const MAX_ERRORS = 100;

export class InvalidDocumentError extends Error {
    readonly errors: string[];

    constructor(errors: string[]) {
        super(`Invalid laranex-schema document: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? `; and ${errors.length - 5} more` : ''}`);
        this.name = 'InvalidDocumentError';
        this.errors = errors;
    }
}

export class UnsupportedDocumentError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedDocumentError';
    }
}

// The format and major version, checked first so a wrong document gets one clear error instead of many.
function supported(value: unknown): string | null {
    const doc = value as { format?: unknown; version?: unknown } | null;
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc) || doc.format !== FORMAT) {
        return `Not a ${FORMAT} document`;
    }
    const major = typeof doc.version === 'string' ? Number(doc.version.split('.')[0]) : NaN;
    if (major !== MAJOR) {
        return `Unsupported ${FORMAT} version ${JSON.stringify(doc.version)}; this reader supports ${MAJOR}.x`;
    }
    return null;
}

export function validateDocument(value: unknown, options: ValidationOptions = {}): ValidationResult {
    const unsupported = supported(value);
    if (unsupported) {
        return { ok: false, errors: [unsupported] };
    }
    const errors: string[] = [];
    documentShape.check(value, '$', { errors, strict: options.strict ?? false });
    if (errors.length === 0) {
        rules(value as SchemaDocument, errors);
    }
    return errors.length ? { ok: false, errors: errors.slice(0, MAX_ERRORS) } : { ok: true, document: value as SchemaDocument, errors: [] };
}

export function assertDocument(value: unknown, options: ValidationOptions = {}): SchemaDocument {
    const unsupported = supported(value);
    if (unsupported) {
        throw new UnsupportedDocumentError(unsupported);
    }
    const result = validateDocument(value, options);
    if (!result.ok) {
        throw new InvalidDocumentError(result.errors);
    }
    return result.document;
}

const duplicates = (values: string[]) => {
    const seen = new Set<string>();
    return [...new Set(values.filter((v) => (seen.has(v) ? true : (seen.add(v), false))))];
};

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

function rules(doc: SchemaDocument, errors: string[]): void {
    const tables = doc.connections.flatMap((c) => c.tables);
    const tableById = new Map(tables.map((t) => [t.id, t]));
    const columnsOf = (id: string) => new Set(tableById.get(id)?.columns.map((c) => c.name) ?? []);
    const foreignKeys = tables.flatMap((t) => t.foreignKeys);
    const indexes = tables.flatMap((t) => t.indexes);
    const constraints = tables.flatMap((t) => t.constraints);
    const fkById = new Map(foreignKeys.map((f) => [f.id, f]));
    const models = new Set(doc.models.map((m) => m.id));
    const relationshipById = new Map(doc.relationships.map((r) => [r.id, r]));
    const links = new Set(doc.links.map((l) => l.id));
    // Entities a diagnostic says could not be resolved may be referred to without existing.
    const unresolved = (kind: string, subjectId: string) => doc.diagnostics.some((d) => d.kind === kind && d.subject.id === subjectId);

    for (const [label, values] of [
        ['connection', doc.connections.map((c) => c.id)],
        ['table', tables.map((t) => t.id)],
        ['index', indexes.map((i) => i.id)],
        ['foreign-key', foreignKeys.map((f) => f.id)],
        ['constraint', constraints.map((c) => c.id)],
        ['model', doc.models.map((m) => m.id)],
        ['relationship', doc.relationships.map((r) => r.id)],
        ['link', [...doc.links.map((l) => l.id), ...doc.derivedLinks.map((l) => l.id)]],
    ] as const) {
        duplicates([...values]).forEach((v) => errors.push(`Duplicate ${label} id: ${v}`));
    }
    duplicates(doc.connections.map((c) => c.name)).forEach((v) => errors.push(`Duplicate connection name: ${v}`));

    // Provenance and coverage must agree with the document's source mode.
    const allowed = doc.source === 'declared' ? ['declared'] : doc.source === 'database' ? ['database'] : ['database', 'declared'];
    const physical = tables.flatMap((t) => [
        { what: `table ${t.id}`, entity: t },
        ...t.columns.map((c) => ({ what: `column ${t.id}.${c.name}`, entity: c })),
        ...t.indexes.map((i) => ({ what: `index ${i.id}`, entity: i })),
        ...t.foreignKeys.map((f) => ({ what: `foreign key ${f.id}`, entity: f })),
        ...t.constraints.map((c) => ({ what: `constraint ${c.id}`, entity: c })),
    ]);
    for (const { what, entity } of physical) {
        if (entity.provenance.some((p) => !allowed.includes(p))) {
            errors.push(`Provenance ${entity.provenance.join('+')} is not possible in a ${doc.source} document: ${what}`);
        }
        if (entity.drift?.length && !(entity.provenance.includes('database') && entity.provenance.includes('declared'))) {
            errors.push(`Drift needs both database and declared provenance: ${what}`);
        }
    }
    for (const connection of doc.connections) {
        const { database, declared } = connection.coverage;
        const needs = { declared: [false, true], database: [true, false], combined: [true, true] }[doc.source];
        if ((database !== null) !== needs[0] || (declared !== null) !== needs[1]) {
            errors.push(`Coverage does not match source ${doc.source}: connection ${connection.id}`);
        }
        for (const [name, coverage] of [['database', database], ['declared', declared]] as [string, Coverage | null][]) {
            if (coverage?.complete && Object.values(coverage.features).some((f) => f === 'partial' || f === 'unavailable')) {
                errors.push(`Coverage is marked complete with partial or unavailable features: connection ${connection.id} (${name})`);
            }
        }
    }

    for (const table of tables) {
        tableRules(table, errors);
        for (const fk of table.foreignKeys) {
            const columns = columnsOf(table.id);
            if (fk.columns.length !== fk.foreignColumns.length) {
                errors.push(`Foreign-key column counts differ: ${fk.id}`);
            }
            if (!fk.columns.every((c) => columns.has(c))) {
                errors.push(`Unknown foreign-key column: ${fk.id}`);
            }
            const target = tableById.get(fk.foreignTable);
            const excused = unresolved(DIAGNOSTIC_KINDS.unresolvedForeignKey, fk.id);
            if (!target && !excused) {
                errors.push(`Unknown foreign-key target table: ${fk.id}`);
            } else if (target && !fk.foreignColumns.every((c) => columnsOf(target.id).has(c)) && !excused) {
                errors.push(`Unknown foreign-key target column: ${fk.id}`);
            }
        }
    }

    for (const model of doc.models) {
        if (!model.tables.every((t) => tableById.has(t))) {
            errors.push(`Unknown model table: ${model.id}`);
        }
    }

    const endpointOk = (e: Endpoint) => tableById.has(e.table) && e.columns.every((c) => columnsOf(e.table).has(c));
    for (const r of doc.relationships) {
        if (!models.has(r.model)) {
            errors.push(`Unknown relationship model: ${r.id}`);
        }
        if (r.relatedModel === null ? !r.polymorphic && !unresolved(DIAGNOSTIC_KINDS.unresolvedRelationship, r.id) : !models.has(r.relatedModel)) {
            errors.push(`Unknown related model: ${r.id}`);
        }
        if (!tableById.has(r.table) || (r.relatedTable !== null && !tableById.has(r.relatedTable))) {
            errors.push(`Unknown relationship table: ${r.id}`);
        }
        if (r.keys && (!endpointOk(r.keys.from) || !endpointOk(r.keys.to) || r.keys.from.columns.length !== r.keys.to.columns.length)) {
            errors.push(`Invalid relationship keys: ${r.id}`);
        }
        if (r.pivot) {
            const p = r.pivot;
            const pivotColumns = columnsOf(p.table);
            const pairs = p.parentColumns.length === p.parentPivotColumns.length && p.relatedColumns.length === p.relatedPivotColumns.length;
            if (!tableById.has(p.table) || !pairs || ![...p.parentPivotColumns, ...p.relatedPivotColumns, ...p.columns].every((c) => pivotColumns.has(c))) {
                errors.push(`Invalid relationship pivot: ${r.id}`);
            }
        }
        if (r.through && !r.through.every((t) => tableById.has(t))) {
            errors.push(`Unknown relationship through table: ${r.id}`);
        }
        if (r.inverse !== null && !relationshipById.has(r.inverse)) {
            errors.push(`Unknown inverse relationship: ${r.id}`);
        }
    }

    for (const link of doc.links) {
        if (!endpointOk(link.from) || !endpointOk(link.to)) {
            errors.push(`Unknown link endpoint: ${link.id}`);
        }
        if (link.foreignKey !== null && !fkById.has(link.foreignKey)) {
            errors.push(`Unknown link foreign key: ${link.id}`);
        }
        if (!link.relationships.every((r) => relationshipById.has(r))) {
            errors.push(`Unknown link relationship: ${link.id}`);
        }
        const state = link.foreignKey !== null ? (link.relationships.length ? 'both' : 'foreign_key') : link.relationships.length ? 'relationship' : null;
        if (state !== link.state) {
            errors.push(`Link state ${link.state} does not match its foreign key and relationships: ${link.id}`);
        }
    }
    for (const link of doc.derivedLinks) {
        if (!tableById.has(link.from) || !tableById.has(link.to) || !link.via.every((t) => tableById.has(t)) || !relationshipById.has(link.relationship)) {
            errors.push(`Unknown derived link reference: ${link.id}`);
        }
    }

    const exists: Record<Diagnostic['subject']['type'], (id: string) => boolean> = {
        document: () => false,
        connection: (id) => doc.connections.some((c) => c.id === id),
        table: (id) => tableById.has(id),
        column: (id) => tableById.has(id),
        index: (id) => indexes.some((i) => i.id === id),
        foreignKey: (id) => fkById.has(id),
        constraint: (id) => constraints.some((c) => c.id === id),
        model: (id) => models.has(id),
        relationship: (id) => relationshipById.has(id),
        link: (id) => links.has(id),
    };
    doc.diagnostics.forEach((d, n) => {
        const { type, id, columns } = d.subject;
        if (type === 'document' && id !== null) {
            errors.push(`A document diagnostic has no subject id: diagnostics[${n}]`);
        }
        // An unresolved subject is named by id but, by definition, not in the document.
        const unresolvedKind = d.kind === DIAGNOSTIC_KINDS.unresolvedForeignKey || d.kind === DIAGNOSTIC_KINDS.unresolvedRelationship;
        if (id !== null && type !== 'document' && !exists[type](id) && !unresolvedKind) {
            errors.push(`Unknown diagnostic subject ${type} ${id}: diagnostics[${n}]`);
        }
        if (type === 'column' && id !== null && tableById.has(id) && !(columns ?? []).every((c) => columnsOf(id).has(c))) {
            errors.push(`Unknown diagnostic subject column: diagnostics[${n}]`);
        }
    });
}

function tableRules(table: Table, errors: string[]): void {
    const names = table.columns.map((c) => c.name);
    const columns = new Set(names);
    duplicates(names).forEach((c) => errors.push(`Duplicate column ${c}: ${table.id}`));
    if (!table.primaryKey.every((c) => columns.has(c))) {
        errors.push(`Unknown primary-key column: ${table.id}`);
    }
    for (const index of table.indexes) {
        const at = `index ${index.id}`;
        if (index.parts.some((p) => (p.column === null) === (p.expression === null))) {
            errors.push(`An index part is exactly one of a column or an expression: ${at}`);
        }
        const partColumns = index.parts.flatMap((p) => (p.column === null ? [] : [p.column]));
        if (!sameList(partColumns, index.columns)) {
            errors.push(`Index columns must list its column parts in order: ${at}`);
        }
        if (![...index.columns, ...index.included].every((c) => columns.has(c))) {
            errors.push(`Unknown index column: ${at}`);
        }
        if (index.parts.some((p) => p.expression !== null) && !index.expression) {
            errors.push(`An index with expression parts has expression true: ${at}`);
        }
        if (!index.partial && index.predicate !== null) {
            errors.push(`Only a partial index has a predicate: ${at}`);
        }
        if (index.primary && (!index.unique || index.backs?.kind !== 'primary_key')) {
            errors.push(`A primary index is unique and backs the primary key: ${at}`);
        }
        if (index.backs?.kind === 'primary_key' && (!index.primary || !sameList(index.columns, table.primaryKey))) {
            errors.push(`An index backing the primary key is primary and has its columns: ${at}`);
        }
        if (index.backs?.kind === 'unique_constraint') {
            const backed = index.backs.constraint === null ? undefined : table.constraints.find((c) => c.id === index.backs?.constraint);
            if (!index.unique || (index.backs.constraint !== null && backed?.kind !== 'unique')) {
                errors.push(`An index backing a unique constraint is unique and names a unique constraint of its table: ${at}`);
            }
        }
    }
    for (const constraint of table.constraints) {
        if (!constraint.columns.every((c) => columns.has(c))) {
            errors.push(`Unknown constraint column: constraint ${constraint.id}`);
        }
        if (constraint.kind === 'unique' && constraint.columns.length === 0 && constraint.expression === null) {
            errors.push(`A unique constraint has columns or an expression: constraint ${constraint.id}`);
        }
    }
}
