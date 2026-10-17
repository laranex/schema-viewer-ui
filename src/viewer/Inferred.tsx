import type { InferredAssociation, SchemaDocument } from '../contract/types';
import { Badge, DiagnosticList } from './Details';
import type { GraphEdge, Lookup } from './graph';
import { AMBIGUITY_TEXT, CONFIDENCE_TEXT, EVIDENCE_TEXT, inferredLabel } from './intelligence';

// Inferred associations: what a foreign key implies between two models that declare no relationship over it. Always
// labelled as an inference, apart from declared ORM relationships and from the physical foreign keys it rests on.

export const NO_ATTRIBUTE = 'No ORM relationship attribute is declared for it: this is an inference from foreign keys, not a relationship. Even high confidence never means one exists.';

export function InferredTag() {
    return (
        <Badge tone="inferred" title="Inferred from foreign keys by a heuristic; no ORM relationship is declared">
            inferred · heuristic
        </Badge>
    );
}

export function ConfidenceBadge({ confidence }: { confidence: InferredAssociation['confidence'] }) {
    return (
        <Badge tone={confidence === 'high' ? 'inferred' : 'heuristic'} title={CONFIDENCE_TEXT[confidence]}>
            {confidence} confidence
        </Badge>
    );
}

// What an entity id in the evidence names, readably.
function evidenceLabel(lookup: Lookup, kind: InferredAssociation['evidence'][number]['kind'], id: string): string {
    if (kind === 'model_mapping') {
        return lookup.models.get(id)?.className ?? id;
    }
    if (kind === 'primary_key') {
        return lookup.label(id);
    }
    for (const t of lookup.tables.values()) {
        const entity = t.foreignKeys.find((f) => f.id === id) ?? t.indexes.find((i) => i.id === id) ?? t.constraints.find((c) => c.id === id);
        if (entity) {
            return `${lookup.label(t.id)} · ${entity.name ?? 'unnamed'}`;
        }
    }
    return id;
}

export function InferredDetails({
    association: a,
    doc,
    lookup,
    edges,
    onSelectTable,
    onSelectEdge,
}: {
    association: InferredAssociation;
    doc: SchemaDocument;
    lookup: Lookup;
    edges: GraphEdge[];
    onSelectTable: (id: string) => void;
    onSelectEdge: (edge: GraphEdge) => void;
}) {
    const tables = [...new Set([a.table, ...(a.via ? [a.via] : []), a.relatedTable])];
    const diagnostics = doc.diagnostics.filter((d) => d.subject.type === 'inferredAssociation' && d.subject.id === a.id);
    return (
        <>
            <span className="tag tag--inferred">INFERRED ASSOCIATION · HEURISTIC</span>
            <h2>{inferredLabel(lookup, a)}</h2>
            <p className="inferred-note">{NO_ATTRIBUTE}</p>
            <div className="badges">
                <Badge>{a.cardinality}</Badge>
                <ConfidenceBadge confidence={a.confidence} />
                <Badge>{a.kind === 'association_table' ? 'association table' : 'foreign key'}</Badge>
            </div>
            <dl>
                <div className="fact">
                    <dt>Model</dt>
                    <dd>{lookup.models.get(a.model)?.className ?? a.model}</dd>
                </div>
                <div className="fact">
                    <dt>Related model</dt>
                    <dd>{lookup.models.get(a.relatedModel)?.className ?? a.relatedModel}</dd>
                </div>
                <div className="fact">
                    <dt>Confidence</dt>
                    <dd>{CONFIDENCE_TEXT[a.confidence]}</dd>
                </div>
            </dl>
            {a.ambiguities.length > 0 && (
                <>
                    <h3>Ambiguities</h3>
                    <ul className="plain">
                        {a.ambiguities.map((x) => (
                            <li key={x}>
                                <code>{x}</code> <span className="muted">{AMBIGUITY_TEXT[x] ?? ''}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            <h3>Supporting foreign keys</h3>
            {a.links.map((id) => {
                const edge = edges.find((e) => e.id === id);
                return (
                    edge && (
                        <button type="button" key={id} className="detail-link" onClick={() => onSelectEdge(edge)}>
                            {edge.label}
                        </button>
                    )
                );
            })}
            <h3>Evidence</h3>
            <ul className="plain evidence-list">
                {a.evidence.map((e) => (
                    <li key={`${e.kind}:${e.id}`}>
                        <strong>{EVIDENCE_TEXT[e.kind]}</strong> <span>{evidenceLabel(lookup, e.kind, e.id)}</span>{' '}
                        {e.confirmed ? (
                            <Badge tone="fact" title="Read from metadata">
                                confirmed
                            </Badge>
                        ) : (
                            <Badge tone="heuristic" title="Not read from the database: the ORM declares it only">
                                unconfirmed
                            </Badge>
                        )}
                    </li>
                ))}
            </ul>
            {diagnostics.length > 0 && (
                <>
                    <h3>Diagnostics</h3>
                    <DiagnosticList diagnostics={diagnostics} />
                </>
            )}
            <h3>Tables</h3>
            {tables.map(
                (id) =>
                    lookup.tables.has(id) && (
                        <button type="button" key={id} className="detail-link" onClick={() => onSelectTable(id)}>
                            {lookup.label(id)}
                            {id === a.via ? ' (association table)' : ''}
                        </button>
                    ),
            )}
        </>
    );
}

// A short entry for an inferred association, in a table's or a foreign key's details.
export function InferredItem({ association: a, lookup, onOpen }: { association: InferredAssociation; lookup: Lookup; onOpen: (id: string) => void }) {
    return (
        <li>
            <button type="button" className="inline-link" onClick={() => onOpen(a.id)}>
                {inferredLabel(lookup, a)}
            </button>{' '}
            <InferredTag /> <Badge>{a.cardinality}</Badge> <ConfidenceBadge confidence={a.confidence} />
            {a.via && <div className="muted">via {lookup.label(a.via)}</div>}
        </li>
    );
}
