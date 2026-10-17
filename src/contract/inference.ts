import { byCodePoint, inferredAssociationId, sortedStrings } from './ids';
import type { ForeignKey, InferenceEvidence, InferredAssociation, Link, Model, SchemaDocument, Table } from './types';

// Association inference every producer implements (docs/contract.md, "Inferred associations"), checked against
// contract/conformance/inference. It reads the stored links: a foreign-key link with no relationship is a foreign key
// no declared relationship covers. Inferences never become relationships or links.

type Key = { kind: 'primary_key' | 'unique_constraint' | 'unique_index'; id: string; columns: string[]; provenance: string[] };

// The column sets a table's rows are unique on: its primary key, its unique constraints, and unique indexes that back
// no constraint entity, are not partial and have no expression parts.
export function candidateKeys(table: Table): Key[] {
    const keys: Key[] = [];
    if (table.primaryKey.length) {
        keys.push({ kind: 'primary_key', id: table.id, columns: table.primaryKey, provenance: table.provenance });
    }
    for (const c of table.constraints) {
        if (c.kind === 'unique' && c.columns.length && c.expression === null) {
            keys.push({ kind: 'unique_constraint', id: c.id, columns: c.columns, provenance: c.provenance });
        }
    }
    for (const i of table.indexes) {
        if (i.unique && !i.partial && !i.expression && i.backs?.kind !== 'primary_key' && !(i.backs?.kind === 'unique_constraint' && i.backs.constraint !== null)) {
            keys.push({ kind: 'unique_index', id: i.id, columns: i.parts.map((p) => p.column as string), provenance: i.provenance });
        }
    }
    return keys;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;
const LEVELS = ['high', 'medium', 'low'] as const;

export function inferAssociations(doc: Pick<SchemaDocument, 'source' | 'connections' | 'models' | 'links'>): InferredAssociation[] {
    const tables = new Map(doc.connections.flatMap((c) => c.tables.map((t) => [t.id, t] as const)));
    const fks = new Map([...tables.values()].flatMap((t) => t.foreignKeys.map((f) => [f.id, f] as const)));
    const modelsOf = (table: string): Model[] => doc.models.filter((m) => m.tables.includes(table)).sort((a, b) => byCodePoint(a.id, b.id));
    const confirmed = (provenance: string[]) => doc.source === 'declared' || provenance.includes('database');
    type Candidate = { link: Link; fk: ForeignKey; from: string; to: string };
    const candidates: Candidate[] = doc.links
        .filter((l) => l.foreignKey !== null && l.relationships.length === 0 && fks.has(l.foreignKey))
        .map((l) => ({ link: l, fk: fks.get(l.foreignKey as string) as ForeignKey, from: l.from.table, to: l.to.table }))
        .sort((a, b) => byCodePoint(a.fk.id, b.fk.id));
    const fkLinksBetween = (from: string, to: string) => doc.links.filter((l) => l.foreignKey !== null && l.from.table === from && l.to.table === to).length;

    const result: InferredAssociation[] = [];
    const build = (parts: Omit<InferredAssociation, 'id' | 'confidence' | 'evidence' | 'ambiguities' | 'model' | 'relatedModel'>, ambiguities: string[], evidence: InferenceEvidence[], used: Candidate[]) => {
        const models = modelsOf(parts.table);
        const related = modelsOf(parts.relatedTable);
        if (models.length > 1 || related.length > 1) {
            ambiguities.push('multiple_models');
        }
        if (parts.table === parts.relatedTable) {
            ambiguities.push('self_reference');
        }
        evidence.push(...[...models, ...related].map((m) => ({ kind: 'model_mapping' as const, id: m.id, confirmed: true })));
        const unconfirmed = used.filter((c) => !confirmed(c.fk.provenance)).length;
        const unique = new Map(evidence.map((e) => [`${e.kind}\u0000${e.id}`, e]));
        result.push({
            id: inferredAssociationId(parts.kind, parts.foreignKeys, parts.via),
            ...parts,
            model: models[0].id,
            relatedModel: related[0].id,
            confidence: LEVELS[Math.min(2, new Set(ambiguities).size + unconfirmed)],
            evidence: [...unique.values()].sort((a, b) => byCodePoint(a.kind, b.kind) || byCodePoint(a.id, b.id)),
            ambiguities: sortedStrings(ambiguities),
        });
    };
    const mapped = (table: string) => modelsOf(table).length > 0;
    const keyEvidence = (k: Key): InferenceEvidence => ({ kind: k.kind, id: k.id, confirmed: confirmed(k.provenance) });
    const fkEvidence = (c: Candidate): InferenceEvidence => ({ kind: 'foreign_key', id: c.fk.id, confirmed: confirmed(c.fk.provenance) });

    // Association tables: an unmapped table with a key made of exactly the columns of two of its uncovered foreign
    // keys is a many-to-many association between the tables they reference.
    const consumed = new Set<string>();
    for (const table of tables.values()) {
        if (mapped(table.id)) {
            continue;
        }
        const own = candidates.filter((c) => c.from === table.id);
        const keys = candidateKeys(table);
        for (let i = 0; i < own.length; i++) {
            for (let j = i + 1; j < own.length; j++) {
                const [a, b] = [own[i], own[j]];
                const columns = [...a.fk.columns, ...b.fk.columns];
                const matching = keys.filter((k) => sameSet(k.columns, columns));
                if (new Set(columns).size !== columns.length || !matching.length || !mapped(a.to) || !mapped(b.to)) {
                    continue;
                }
                consumed.add(a.fk.id).add(b.fk.id);
                build(
                    { kind: 'association_table', table: a.to, relatedTable: b.to, via: table.id, cardinality: 'many-to-many', foreignKeys: sortedStrings([a.fk.id, b.fk.id]), links: sortedStrings([a.link.id, b.link.id]) },
                    [],
                    [fkEvidence(a), fkEvidence(b), ...matching.map(keyEvidence)],
                    [a, b],
                );
            }
        }
    }

    // Every other uncovered foreign key between two mapped tables: many-to-one from the referencing model, or
    // one-to-one when its columns are exactly a key of the referencing table.
    for (const c of candidates) {
        if (consumed.has(c.fk.id) || !mapped(c.from) || !mapped(c.to)) {
            continue;
        }
        const unique = candidateKeys(tables.get(c.from) as Table).filter((k) => sameSet(k.columns, c.fk.columns));
        build(
            { kind: 'foreign_key', table: c.from, relatedTable: c.to, via: null, cardinality: unique.length ? 'one-to-one' : 'many-to-one', foreignKeys: [c.fk.id], links: [c.link.id] },
            fkLinksBetween(c.from, c.to) > 1 ? ['multiple_foreign_keys'] : [],
            [fkEvidence(c), ...unique.map(keyEvidence)],
            [c],
        );
    }
    return result.sort((a, b) => byCodePoint(a.id, b.id));
}
