import type { Change, Comparison, Difference, InferredAssociation, JsonValue, MigrationStatus, MigrationTrack, ObjectType, Scope, SchemaDocument } from '../contract/types';
import type { Lookup } from './graph';

// Pure helpers over the comparisons, migration tracks and inferred associations a document stores. The viewer only
// reads and labels these results; the producers compute them with the shared algorithms, which it never calls.

export const scopeKey = (scope: Scope) => JSON.stringify([scope.connection, scope.schema]);

// A scope's readable name: the connection, then the schema, or the default schema the null schema stands for.
export function scopeLabel(lookup: Lookup, scope: Scope): string {
    const connection = lookup.connections.get(scope.connection);
    const name = connection?.name ?? scope.connection;
    if (scope.schema !== null) {
        return `${name} · ${scope.schema}`;
    }
    return connection?.defaultSchema ? `${name} · default schema (${connection.defaultSchema})` : `${name} · default schema`;
}

export const comparisonLabel = (lookup: Lookup, c: Comparison) => `${scopeLabel(lookup, c.baseline)} → ${scopeLabel(lookup, c.target)}`;

// Text before color: every change has a symbol and words, so color is never the only signal.
export const CHANGE_TEXT: Record<Change, { symbol: string; label: string; meaning: string; group: string }> = {
    missing: { symbol: '−', label: 'missing', meaning: 'In the baseline, not in the target', group: 'Missing from the target' },
    extra: { symbol: '+', label: 'extra', meaning: 'In the target only, not in the baseline', group: 'Extra in the target' },
    changed: { symbol: '~', label: 'changed', meaning: 'In both, with different fields', group: 'Changed' },
};

export const OBJECT_TEXT: Record<ObjectType, string> = {
    table: 'table',
    column: 'column',
    primaryKey: 'primary key',
    index: 'index',
    foreignKey: 'foreign key',
    constraint: 'constraint',
};

export const CERTAINTY_TEXT = {
    certain: { label: 'certain', long: 'Certain: compared exactly as read from metadata' },
    likely: { label: 'likely', long: 'Likely: compared through normalized types or SQL text, a heuristic' },
} as const;

// A stored difference value as text: SQL and names as they are, lists joined, defaults as "value (kind)".
export function valueText(value: JsonValue): string {
    if (value === null) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return value.length ? value.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).join(', ') : '(none)';
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 2 && 'kind' in value && 'value' in value && typeof value.value !== 'object') {
            return `${String(value.value)} (${String(value.kind)})`;
        }
        return entries.map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`).join(', ');
    }
    return String(value);
}

// One table's part in one comparison: the side it is on and every difference that names it.
export type TableMark = {
    comparison: Comparison;
    side: 'baseline' | 'target';
    // The table's own difference: missing, extra or changed as a whole.
    table: Difference | null;
    differences: Difference[];
    // Column differences by column name, the last element of their [table, column] key.
    columns: Map<string, Difference>;
    // Index, foreign-key and constraint differences by the entity id on this side.
    entities: Map<string, Difference>;
    likely: number;
};

export function comparisonMarks(comparison: Comparison | undefined): Map<string, TableMark> {
    const marks = new Map<string, TableMark>();
    if (!comparison) {
        return marks;
    }
    for (const d of comparison.differences) {
        for (const side of ['baseline', 'target'] as const) {
            const ref = d[side];
            if (!ref) {
                continue;
            }
            const mark: TableMark = marks.get(ref.table) ?? { comparison, side, table: null, differences: [], columns: new Map(), entities: new Map(), likely: 0 };
            mark.differences.push(d);
            if (d.certainty === 'likely') {
                mark.likely++;
            }
            if (d.objectType === 'table') {
                mark.table = d;
            } else if (d.objectType === 'column') {
                mark.columns.set(d.key[d.key.length - 1], d);
            }
            if (ref.id !== null) {
                mark.entities.set(ref.id, d);
            }
            marks.set(ref.table, mark);
        }
    }
    return marks;
}

// Every comparison's mark for one table: a table may be compared more than once.
export function tableMarks(doc: SchemaDocument, tableId: string): TableMark[] {
    return doc.comparisons.flatMap((c) => {
        const mark = comparisonMarks(c).get(tableId);
        return mark ? [mark] : [];
    });
}

// What a table's card says about it in one comparison, in words.
// short is what a card shows; short + rest is the whole text.
export function markSummary(mark: TableMark): { change: Change; text: string; short: string; rest: string; title: string } {
    const other = mark.side === 'baseline' ? 'target' : 'baseline';
    if (mark.table && mark.table.change !== 'changed') {
        const change = mark.table.change;
        return {
            change,
            text: change === 'missing' ? 'missing in target' : 'extra in target',
            short: change,
            rest: ' in target',
            title: change === 'missing' ? 'Missing: only the baseline has this table; the target does not' : 'Extra: only the target has this table; the baseline does not',
        };
    }
    const n = mark.differences.length;
    const likely = mark.likely ? `, ${mark.likely} likely (heuristic)` : '';
    return { change: 'changed', text: `${n} ${n === 1 ? 'difference' : 'differences'}`, short: String(n), rest: n === 1 ? ' difference' : ' differences', title: `${n} ${n === 1 ? 'difference' : 'differences'} against the ${other}${likely}; this table is on the ${mark.side} side` };
}

// Inferred associations by the stored link they annotate: an inference never adds a link of its own.
export function inferredByLink(doc: SchemaDocument): Map<string, InferredAssociation[]> {
    const map = new Map<string, InferredAssociation[]>();
    for (const a of doc.inferredAssociations) {
        for (const link of a.links) {
            map.set(link, [...(map.get(link) ?? []), a]);
        }
    }
    return map;
}

export const inferredOfTable = (doc: SchemaDocument, tableId: string) => doc.inferredAssociations.filter((a) => a.table === tableId || a.relatedTable === tableId || a.via === tableId);

const shortClass = (name: string) => name.split(/[\\.]/).pop() ?? name;
export const modelName = (lookup: Lookup, id: string) => shortClass(lookup.models.get(id)?.className ?? id);
export const inferredLabel = (lookup: Lookup, a: InferredAssociation) => `${modelName(lookup, a.model)} → ${modelName(lookup, a.relatedModel)}`;

export const CONFIDENCE_TEXT: Record<InferredAssociation['confidence'], string> = {
    high: 'High confidence: no ambiguity and every foreign key confirmed. Still an inference: no ORM relationship is declared.',
    medium: 'Medium confidence: one ambiguity or unconfirmed foreign key lowers it.',
    low: 'Low confidence: several ambiguities or unconfirmed foreign keys.',
};

export const AMBIGUITY_TEXT: Record<string, string> = {
    multiple_foreign_keys: 'Several foreign keys go from this table to the same table',
    self_reference: 'The table references itself',
    multiple_models: 'Several models map one of the tables',
};

export const EVIDENCE_TEXT: Record<InferredAssociation['evidence'][number]['kind'], string> = {
    foreign_key: 'Foreign key',
    primary_key: 'Primary key',
    unique_constraint: 'Unique constraint',
    unique_index: 'Unique index',
    model_mapping: 'Model mapping',
};

// Migration statuses in the contract's words. Revision status is never schema drift: a database can be up to date and
// still differ from another, and a comparison says nothing about revisions.
export const STATUS_TEXT: Record<MigrationStatus, { label: string; tone: 'fact' | 'warning' | 'error' | 'plain'; meaning: string }> = {
    up_to_date: { label: 'Up to date', tone: 'fact', meaning: 'The recorded revisions are exactly the heads of the migration history; nothing is pending.' },
    behind: { label: 'Behind (pending)', tone: 'warning', meaning: 'Pending: revisions of the history that no recorded revision includes yet.' },
    diverged: {
        label: 'Diverged',
        tone: 'error',
        meaning: 'A recorded revision is an ancestor of another recorded revision: the version table overlaps itself, so what is pending cannot be determined.',
    },
    uninitialized: { label: 'Uninitialized', tone: 'warning', meaning: 'The version table records no revision, or the database has none: every revision up to the heads is pending.' },
    unknown: { label: 'Unknown', tone: 'plain', meaning: 'The status could not be determined.' },
};

// Why a track's status is unknown, read from its stored fields in the order the contract's rules apply.
export function unknownReason(track: MigrationTrack): string | null {
    if (track.status !== 'unknown') {
        return null;
    }
    if (track.current === null) {
        return 'The version table could not be read.';
    }
    if (track.history === null) {
        return 'The migration scripts could not be read.';
    }
    if (track.unknownRevisions.length) {
        return 'The database records a revision no migration script defines.';
    }
    return 'The history is partial: a revision that would be pending is missing from the scripts.';
}

export const trackLabel = (lookup: Lookup, t: MigrationTrack) => `${t.provider} · ${scopeLabel(lookup, { connection: t.connection, schema: t.schema })}`;
