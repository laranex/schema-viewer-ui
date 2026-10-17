import { buildGraph } from '../contract/graph';
import { VERSION, type Relationship, type SchemaDocument } from '../contract/types';
import { validateDocument } from '../contract/validate';
import { context, selectConnections } from './common';
import type { Exporter, ExportOptions, ExportResult, ExportWarning } from './types';

// The document itself, or a laranex-schema document of some of its connections. A scoped document keeps everything
// that lies wholly inside the chosen connections and nothing that reaches outside them: other connections' tables,
// models, relationships, links, diagnostics, comparisons, migration tracks and inferred associations are left out,
// a relationship that crosses to another connection is left out with a warning, and the links and derived links are
// rebuilt with the shared graph builder. The result is validated (strictly for a 2.0 source) before it is returned.

export function scopeDocument(doc: SchemaDocument, connectionIds: string[]): { document: SchemaDocument; warnings: ExportWarning[] } {
    const ctx = context(doc, { connections: connectionIds });
    const connections = selectConnections(doc, connectionIds);
    const kept = new Set(connections.map((c) => c.id));
    const tables = new Set(connections.flatMap((c) => c.tables.map((t) => t.id)));
    const connectionName = (tableId: string) => ctx.connectionOf.get(tableId)?.name ?? 'an unknown connection';

    const models = doc.models.flatMap((m) => {
        const own = m.tables.filter((t) => tables.has(t));
        if (!own.length) {
            return [];
        }
        if (own.length !== m.tables.length) {
            ctx.warn('lossy_conversion', 'model', m.id, m.className, `Model ${m.className} also maps tables on other connections; only its tables here are kept.`);
        }
        return [own.length === m.tables.length ? m : { ...m, tables: own }];
    });
    const modelIds = new Set(models.map((m) => m.id));

    const within = (r: Relationship) =>
        modelIds.has(r.model) &&
        (r.relatedTable === null || tables.has(r.relatedTable)) &&
        (r.relatedModel === null || modelIds.has(r.relatedModel)) &&
        (!r.pivot || tables.has(r.pivot.table)) &&
        (r.through ?? []).every((t) => tables.has(t)) &&
        (!r.keys || (tables.has(r.keys.from.table) && tables.has(r.keys.to.table)));
    const inside = doc.relationships.filter((r) => {
        if (!tables.has(r.table)) {
            return false;
        }
        if (!within(r)) {
            const outside = [r.relatedTable, r.pivot?.table, ...(r.through ?? []), r.keys?.from.table, r.keys?.to.table].find((t) => t && !tables.has(t));
            ctx.warn('skipped_entity', 'relationship', r.id, r.name, `Relationship ${r.id} reaches ${outside ? `connection ${connectionName(outside)}` : 'outside these connections'}; a document of these connections cannot hold it, so it is left out.`);
            return false;
        }
        return true;
    });
    const relationshipIds = new Set(inside.map((r) => r.id));
    const relationships = inside.map((r) => {
        if (r.inverse !== null && !relationshipIds.has(r.inverse)) {
            ctx.warn('lossy_conversion', 'relationship', r.id, r.name, `The inverse of relationship ${r.id}, ${r.inverse}, is left out, so its inverse is written as null.`);
            return { ...r, inverse: null };
        }
        return r;
    });

    const graph = buildGraph({ connections, relationships });
    const linkIds = new Set([...graph.links.map((l) => l.id), ...graph.derivedLinks.map((l) => l.id)]);
    const indexes = new Set(connections.flatMap((c) => c.tables.flatMap((t) => t.indexes.map((i) => i.id))));
    const foreignKeys = new Set(connections.flatMap((c) => c.tables.flatMap((t) => t.foreignKeys.map((f) => f.id))));
    const constraints = new Set(connections.flatMap((c) => c.tables.flatMap((t) => t.constraints.map((k) => k.id))));
    const comparisons = doc.comparisons.filter((c) => kept.has(c.baseline.connection) && kept.has(c.target.connection));
    const migrations = doc.migrations.filter((m) => kept.has(m.connection));
    const inferredAssociations = doc.inferredAssociations.filter(
        (a) => [a.table, a.relatedTable, ...(a.via === null ? [] : [a.via])].every((t) => tables.has(t)) && modelIds.has(a.model) && modelIds.has(a.relatedModel) && a.links.every((l) => linkIds.has(l)),
    );
    const subjects: Record<string, Set<string>> = {
        connection: kept,
        table: tables,
        column: tables,
        index: indexes,
        foreignKey: foreignKeys,
        constraint: constraints,
        model: modelIds,
        relationship: relationshipIds,
        link: linkIds,
        comparison: new Set(comparisons.map((c) => c.id)),
        migration: new Set(migrations.map((m) => m.id)),
        inferredAssociation: new Set(inferredAssociations.map((a) => a.id)),
    };
    const diagnostics = doc.diagnostics.filter((d) => d.subject.type === 'document' || (d.subject.id !== null && subjects[d.subject.type]?.has(d.subject.id)));

    const scoped: SchemaDocument = { ...doc, connections, models, relationships, links: graph.links, derivedLinks: graph.derivedLinks, diagnostics, comparisons, migrations, inferredAssociations };
    const strict = doc.version === VERSION;
    let result = validateDocument(scoped, { strict });
    if (!result.ok && strict && validateDocument(scoped).ok) {
        ctx.warn('lossy_conversion', 'document', null, null, `The source document is not strictly valid laranex-schema ${VERSION}; neither is this file, though it is valid for 2.x readers.`);
        result = validateDocument(scoped);
    }
    if (!result.ok) {
        throw new Error(`The document of these connections is not valid: ${result.errors.slice(0, 5).join('; ')}`);
    }
    return { document: scoped, warnings: ctx.warnings };
}

function exportJson(doc: SchemaDocument, options: ExportOptions = {}): ExportResult {
    const ids = options.connections;
    const everything = ids === undefined || doc.connections.every((c) => ids.includes(c.id));
    if (everything) {
        selectConnections(doc, ids);
        return { content: `${JSON.stringify(doc, null, 2)}\n`, warnings: [] };
    }
    const { document, warnings } = scopeDocument(doc, ids);
    return { content: `${JSON.stringify(document, null, 2)}\n`, warnings };
}

export const json: Exporter = { id: 'json', label: 'JSON', extension: 'json', mediaType: 'application/json', export: exportJson };
