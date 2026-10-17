import { inScope } from './comparison';
import { documentShape } from './document';
import { linkId } from './graph';
import { byList, comparisonId, diagnosticId, differenceId, inferredAssociationId, migrationTrackId, sortedStrings } from './ids';
import { migrationHistory, migrationState } from './migration';
import { CHANGES, DIAGNOSTIC_KINDS, DRIVER_ALIASES, FORMAT, MAJOR, OBJECT_TYPES, VERSION, type Connection, type Coverage, type Diagnostic, type Endpoint, type ForeignKey, type SchemaDocument, type Table } from './types';

export type ValidationOptions = {
    // Validate against exactly this version and reject properties it does not define: what producers and tests do.
    // Without it, readers accept any 2.x minor and ignore what they do not know, so a viewer keeps reading documents
    // from a newer producer.
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
    const strict = options.strict ?? false;
    if (strict && (value as { version: unknown }).version !== VERSION) {
        errors.push(`$.version: strict validation is for version ${VERSION}, got ${JSON.stringify((value as { version: unknown }).version)}`);
    }
    documentShape.check(value, '$', { errors, strict });
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

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const isSorted = (values: readonly string[]) => sameList(values, sortedStrings(values));

function rules(doc: SchemaDocument, errors: string[]): void {
    const tables = doc.connections.flatMap((c) => c.tables);
    const tableById = new Map(tables.map((t) => [t.id, t]));
    const connectionOf = new Map(doc.connections.flatMap((c) => c.tables.map((t) => [t.id, c.id] as const)));
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
        ['diagnostic', doc.diagnostics.map((d) => d.id)],
        ['comparison', doc.comparisons.map((c) => c.id)],
        ['difference', doc.comparisons.flatMap((c) => c.differences.map((d) => d.id))],
        ['migration', doc.migrations.map((m) => m.id)],
        ['inferred-association', doc.inferredAssociations.map((a) => a.id)],
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
        const canonical = connection.driver === null ? undefined : DRIVER_ALIASES[connection.driver];
        if (canonical) {
            errors.push(`Driver ${connection.driver} is spelled ${canonical}: connection ${connection.id}`);
        }
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
            } else if (target && connectionOf.get(target.id) !== connectionOf.get(table.id)) {
                // A constraint lives in one database; only ORM relationships may cross connections.
                errors.push(`Foreign key crosses connections: ${fk.id}`);
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
        link: (id) => links.has(id) || doc.derivedLinks.some((l) => l.id === id),
        comparison: (id) => doc.comparisons.some((c) => c.id === id),
        migration: (id) => doc.migrations.some((m) => m.id === id),
        inferredAssociation: (id) => doc.inferredAssociations.some((a) => a.id === id),
    };
    doc.diagnostics.forEach((d, n) => {
        const { type, id, columns } = d.subject;
        if (d.id !== diagnosticId(d)) {
            errors.push(`Diagnostic id is not ${diagnosticId(d)}: diagnostics[${n}]`);
        }
        if (type === 'column' && !columns?.length) {
            errors.push(`A column subject names its columns: diagnostics[${n}]`);
        }
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

    const connectionById = new Map(doc.connections.map((c) => [c.id, c]));
    comparisonRules(doc, connectionById, tableById, errors);
    migrationRules(doc, connectionById, tableById, errors);
    inferenceRules(doc, tableById, fkById, errors);
}

const sortedById = (items: { id: string }[]) => isSorted(items.map((i) => i.id)) && new Set(items.map((i) => i.id)).size === items.length;

function comparisonRules(doc: SchemaDocument, connections: Map<string, Connection>, tables: Map<string, Table>, errors: string[]): void {
    if (!sortedById(doc.comparisons)) {
        errors.push('Comparisons are sorted by id');
    }
    for (const c of doc.comparisons) {
        const at = `comparison ${c.id}`;
        if (!connections.has(c.baseline.connection) || !connections.has(c.target.connection)) {
            errors.push(`Unknown comparison connection: ${at}`);
            continue;
        }
        if (c.baseline.connection === c.target.connection && c.baseline.schema === c.target.schema) {
            errors.push(`A comparison compares two different scopes: ${at}`);
        }
        if (c.id !== comparisonId(c.baseline, c.target)) {
            errors.push(`Comparison id is not ${comparisonId(c.baseline, c.target)}: ${at}`);
        }
        const order = (d: (typeof c.differences)[number]) => [String(OBJECT_TYPES.indexOf(d.objectType)).padStart(2, '0'), ...d.key];
        const sorted = c.differences.every((d, i) => {
            const prev = c.differences[i - 1];
            if (!prev) {
                return true;
            }
            const byKey = byList(order(prev), order(d));
            return byKey < 0 || (byKey === 0 && CHANGES.indexOf(prev.change) < CHANGES.indexOf(d.change));
        });
        if (!sorted) {
            errors.push(`Differences are sorted by object type, key and change: ${at}`);
        }
        const tenantSchemas = c.baseline.schema !== null && c.target.schema !== null && c.baseline.schema !== c.target.schema ? [c.baseline.schema, c.target.schema] : [];
        const counts = { missing: 0, extra: 0, changed: 0 };
        for (const d of c.differences) {
            const where = `difference ${d.id}`;
            counts[d.change]++;
            if (d.id !== differenceId(c.id, d.objectType, d.key)) {
                errors.push(`Difference id is not ${differenceId(c.id, d.objectType, d.key)}: ${where}`);
            }
            const shape = { missing: [true, false], extra: [false, true], changed: [true, true] }[d.change];
            if ((d.baseline !== null) !== shape[0] || (d.target !== null) !== shape[1]) {
                errors.push(`A ${d.change} difference has ${d.change === 'changed' ? 'both sides' : d.change === 'missing' ? 'only a baseline' : 'only a target'}: ${where}`);
            }
            if ((d.change === 'changed') !== (d.fields.length > 0)) {
                errors.push(`Only a changed difference lists fields, and it lists at least one: ${where}`);
            }
            if (!isSorted(d.fields.map((f) => f.field)) || new Set(d.fields.map((f) => f.field)).size !== d.fields.length) {
                errors.push(`Difference fields are unique and sorted by field: ${where}`);
            }
            if (d.key.some((k) => tenantSchemas.includes(k))) {
                errors.push(`A difference key never contains a compared schema name: ${where}`);
            }
            for (const [scope, ref] of [[c.baseline, d.baseline], [c.target, d.target]] as const) {
                if (ref === null) {
                    continue;
                }
                const table = tables.get(ref.table);
                const connection = connections.get(scope.connection) as Connection;
                if (!table || !connection.tables.includes(table) || !inScope(table, connection, scope.schema)) {
                    errors.push(`A difference side names a table of its own scope: ${where}`);
                    continue;
                }
                const entities = { index: table.indexes, foreignKey: table.foreignKeys, constraint: table.constraints }[d.objectType as 'index'];
                if (entities ? !entities.some((e) => e.id === ref.id) : ref.id !== null) {
                    errors.push(`A difference side's id is its ${d.objectType}'s, of its table: ${where}`);
                }
            }
        }
        const total = c.summary.missing + c.summary.extra + c.summary.changed;
        if (c.omitted > 0 && c.complete) {
            errors.push(`A comparison with omitted differences is incomplete: ${at}`);
        }
        if (total !== c.differences.length + c.omitted || CHANGES.some((k) => c.summary[k] < counts[k])) {
            errors.push(`Comparison summary does not count its differences and omitted ones: ${at}`);
        }
    }
}

function migrationRules(doc: SchemaDocument, connections: Map<string, Connection>, tables: Map<string, Table>, errors: string[]): void {
    if (!sortedById(doc.migrations)) {
        errors.push('Migration tracks are sorted by id');
    }
    for (const m of doc.migrations) {
        const at = `migration ${m.id}`;
        const connection = connections.get(m.connection);
        if (!connection) {
            errors.push(`Unknown migration connection: ${at}`);
            continue;
        }
        if (m.id !== migrationTrackId(m.provider, m.connection, m.schema)) {
            errors.push(`Migration track id is not ${migrationTrackId(m.provider, m.connection, m.schema)}: ${at}`);
        }
        const own = (id: string) => {
            const t = tables.get(id);
            return t !== undefined && connection.tables.includes(t) && inScope(t, connection, m.schema);
        };
        if (m.versionTable !== null && !own(m.versionTable)) {
            errors.push(`The version table is a table of the track's scope: ${at}`);
        }
        if (m.versionTable === null && (m.current === null || m.current.length > 0)) {
            errors.push(`Without a version table no revision is recorded (current is []): ${at}`);
        }
        if (m.history) {
            const expected = migrationHistory(m.history.revisions);
            if (!sortedById(m.history.revisions) || m.history.revisions.some((r, i) => !sameList(r.parents, expected.revisions[i].parents) || !sameList(r.branchLabels, expected.revisions[i].branchLabels))) {
                errors.push(`Revisions are unique and sorted by id, with sorted parents and branch labels: ${at}`);
            }
            if (!sameList(m.history.heads, expected.heads)) {
                errors.push(`History heads are the revisions no revision names as a parent: ${at}`);
            }
            if (!sameList(m.history.missing, expected.missing)) {
                errors.push(`History missing lists the parents not in revisions: ${at}`);
            }
        }
        if (m.current !== null && !sameList(m.current, sortedStrings(m.current))) {
            errors.push(`Current revisions are unique and sorted: ${at}`);
        }
        const state = migrationState(m.history, m.current);
        if (m.status !== state.status || JSON.stringify(m.pending) !== JSON.stringify(state.pending) || !sameList(m.unknownRevisions, state.unknownRevisions)) {
            errors.push(`Migration status, pending and unknownRevisions do not follow the status rules (expected ${state.status}): ${at}`);
        }
        const rowKey = (r: (typeof m.coverage)[number]) => [r.name, r.table ?? ''];
        if (!m.coverage.every((r, i) => i === 0 || byList(rowKey(m.coverage[i - 1]), rowKey(r)) < 0)) {
            errors.push(`Coverage rows are unique and sorted by name and table: ${at}`);
        }
        for (const r of m.coverage) {
            if (r.table !== null && (!own(r.table) || tables.get(r.table)?.name !== r.name)) {
                errors.push(`A coverage row's table is a table of the track's scope with its name: ${at} (${r.name})`);
            }
            if ((r.autogenerate === 'unknown' || r.migrationManaged === 'unknown') && r.certainty !== 'likely') {
                errors.push(`A coverage row with an unknown answer is likely, not certain: ${at} (${r.name})`);
            }
            const evidence = r.evidence.map((e) => `${e.kind}\u0000${e.detail}`);
            if (!sameList(evidence, sortedStrings(evidence))) {
                errors.push(`Coverage evidence is unique and sorted by kind and detail: ${at} (${r.name})`);
            }
        }
    }
}

function inferenceRules(doc: SchemaDocument, tables: Map<string, Table>, fks: Map<string, ForeignKey>, errors: string[]): void {
    if (!sortedById(doc.inferredAssociations)) {
        errors.push('Inferred associations are sorted by id');
    }
    const linkById = new Map(doc.links.map((l) => [l.id, l]));
    const tableOf = new Map([...tables.values()].flatMap((t) => t.foreignKeys.map((f) => [f.id, t.id] as const)));
    const linkOf = (fk: ForeignKey) => {
        const pairs = fk.columns.map((c, i): [string, string] => [c, fk.foreignColumns[i]]).sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0));
        return linkById.get(linkId(tableOf.get(fk.id) as string, fk.foreignTable, pairs));
    };
    const models = new Map(doc.models.map((m) => [m.id, m]));
    for (const a of doc.inferredAssociations) {
        const at = `inferred association ${a.id}`;
        if (a.id !== inferredAssociationId(a.kind, a.foreignKeys, a.via)) {
            errors.push(`Inferred association id is not ${inferredAssociationId(a.kind, a.foreignKeys, a.via)}: ${at}`);
        }
        const association = a.kind === 'association_table';
        if (association !== (a.via !== null) || association !== (a.cardinality === 'many-to-many') || a.foreignKeys.length !== (association ? 2 : 1)) {
            errors.push(`An association-table inference has via, two foreign keys and many-to-many; a foreign-key inference has none of them and one foreign key: ${at}`);
        }
        if (![a.table, a.relatedTable, ...(a.via === null ? [] : [a.via])].every((t) => tables.has(t))) {
            errors.push(`Unknown inferred association table: ${at}`);
        }
        if (!models.get(a.model)?.tables.includes(a.table) || !models.get(a.relatedModel)?.tables.includes(a.relatedTable)) {
            errors.push(`An inferred association's models map its tables: ${at}`);
        }
        if (!isSorted(a.foreignKeys) || !isSorted(a.links) || !isSorted(a.ambiguities)) {
            errors.push(`Inferred association foreign keys, links and ambiguities are unique and sorted: ${at}`);
        }
        const fkLinks: string[] = [];
        for (const id of a.foreignKeys) {
            const fk = fks.get(id);
            const link = fk && linkOf(fk);
            if (!fk || !link) {
                errors.push(`An inferred association's foreign key exists and has a link: ${at}`);
            } else if (link.relationships.length) {
                errors.push(`A declared relationship covers the inferred association's foreign key ${id}: ${at}`);
            } else {
                fkLinks.push(link.id);
            }
        }
        if (!sameList(a.links, sortedStrings(fkLinks)) && fkLinks.length === a.foreignKeys.length) {
            errors.push(`An inferred association lists the links of its foreign keys: ${at}`);
        }
        const resolves = {
            foreign_key: (id: string) => a.foreignKeys.includes(id),
            primary_key: (id: string) => tables.has(id),
            unique_constraint: (id: string) => [...tables.values()].some((t) => t.constraints.some((c) => c.id === id && c.kind === 'unique')),
            unique_index: (id: string) => [...tables.values()].some((t) => t.indexes.some((i) => i.id === id && i.unique)),
            model_mapping: (id: string) => models.has(id),
        };
        if (!a.evidence.every((e) => resolves[e.kind](e.id)) || !a.foreignKeys.every((id) => a.evidence.some((e) => e.kind === 'foreign_key' && e.id === id))) {
            errors.push(`Inferred association evidence names existing entities, including each of its foreign keys: ${at}`);
        }
        const evidence = a.evidence.map((e) => `${e.kind}\u0000${e.id}`);
        if (!sameList(evidence, sortedStrings(evidence))) {
            errors.push(`Inferred association evidence is unique and sorted by kind and id: ${at}`);
        }
    }
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
        if (![...partColumns, ...index.included].every((c) => columns.has(c))) {
            errors.push(`Unknown index column: ${at}`);
        }
        if (index.parts.some((p) => p.expression !== null) && !index.expression) {
            errors.push(`An index with expression parts has expression true: ${at}`);
        }
        if (!index.partial && index.predicate !== null) {
            errors.push(`Only a partial index has a predicate: ${at}`);
        }
        if (index.backs?.kind === 'primary_key' && (!index.unique || index.expression || !sameList(partColumns, table.primaryKey))) {
            errors.push(`An index backing the primary key is unique and has exactly its columns: ${at}`);
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
