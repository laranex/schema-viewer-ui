import type { ReactNode } from 'react';
import type { Constraint, Coverage, Diagnostic, Extensions, ForeignKey, Index, JsonValue, Provenance, Relationship, SchemaDocument, Source, Table } from '../contract/types';
import type { ViewerChange, ViewerDownload } from '../contract/viewer-config';
import { relationshipsOf, tableLabel, type GraphEdge, type Lookup } from './graph';

// Renders one extension namespace richly; the viewer falls back to a generic rendering for the rest.
export type ExtensionRenderers = Record<string, (value: Extensions[string]) => ReactNode>;

export type DetailContext = {
    doc: SchemaDocument;
    lookup: Lookup;
    editor: string | null;
    renderers: ExtensionRenderers;
};

const SOURCE_TEXT: Record<SchemaDocument['source'], string> = {
    declared: 'ORM-declared metadata only: no database was inspected.',
    database: 'Database introspection only: no ORM metadata.',
    combined: 'Database introspection enriched with ORM metadata. The database is authoritative where it was inspected.',
};

export function Badge({ tone = 'plain', children, title }: { tone?: string; children: ReactNode; title?: string }) {
    return (
        <span className={`badge badge--${tone}`} title={title}>
            {children}
        </span>
    );
}

export function ProvenanceBadge({ provenance, doc }: { provenance: Provenance; doc: SchemaDocument }) {
    if (doc.source !== 'combined') {
        return null;
    }
    if (provenance.length === 2) {
        return (
            <Badge tone="both" title="Inspected in the database and declared by the ORM">
                database + declared
            </Badge>
        );
    }
    return provenance[0] === 'declared' ? (
        <Badge tone="declared" title="Declared by the ORM only; not found in the database">
            declared only
        </Badge>
    ) : (
        <Badge tone="database" title="Found in the database; the ORM does not declare it">
            database only
        </Badge>
    );
}

function SourceLink({ source, editor }: { source: Source | null; editor: string | null }) {
    if (!source) {
        return null;
    }
    const text = `${source.file}${source.line ? `:${source.line}` : ''}`;
    if (!editor) {
        return <code className="source">{text}</code>;
    }
    const href = editor.replace('{file}', encodeURIComponent(source.file)).replace('{line}', String(source.line ?? 1));
    return (
        <a className="source" href={href} title="Open in your editor">
            {text}
        </a>
    );
}

function Value({ value }: { value: JsonValue }) {
    if (value === null) {
        return <span className="muted">null</span>;
    }
    if (Array.isArray(value)) {
        return value.every((v) => typeof v !== 'object' || v === null) ? (
            <span className="chips">
                {value.map((v, i) => (
                    <code key={i}>{String(v)}</code>
                ))}
            </span>
        ) : (
            <pre>{JSON.stringify(value, null, 2)}</pre>
        );
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        return entries.length && entries.every(([, v]) => typeof v !== 'object' || v === null) ? (
            <dl className="kv">
                {entries.map(([k, v]) => (
                    <div key={k} className="fact">
                        <dt>{k}</dt>
                        <dd>{String(v)}</dd>
                    </div>
                ))}
            </dl>
        ) : (
            <pre>{JSON.stringify(value, null, 2)}</pre>
        );
    }
    return <code>{String(value)}</code>;
}

export function ExtensionsView({ extensions, renderers }: { extensions: Extensions | undefined; renderers: ExtensionRenderers }) {
    if (!extensions || Object.keys(extensions).length === 0) {
        return null;
    }
    return (
        <div className="extensions">
            {Object.entries(extensions).map(([namespace, value]) => (
                <section key={namespace} aria-label={`${namespace} extension`}>
                    <h4>{namespace}</h4>
                    {renderers[namespace] ? (
                        renderers[namespace](value)
                    ) : (
                        <dl className="kv">
                            {Object.entries(value).map(([k, v]) => (
                                <div key={k} className="fact">
                                    <dt>{k}</dt>
                                    <dd>
                                        <Value value={v} />
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </section>
            ))}
        </div>
    );
}

function Section({ title, count, children, open = false }: { title: string; count?: number; children: ReactNode; open?: boolean }) {
    return (
        <details open={open}>
            <summary>
                {title}
                {count !== undefined && <span className="count">{count}</span>}
            </summary>
            {children}
        </details>
    );
}

function DiagnosticBody({ diagnostic }: { diagnostic: Diagnostic }) {
    return (
        <>
            <div className="badges">
                <Badge tone={diagnostic.severity}>{diagnostic.severity}</Badge>
                <Badge tone={diagnostic.certainty === 'certain' ? 'fact' : 'heuristic'} title={diagnostic.certainty === 'certain' ? 'A confirmed fact read from metadata' : 'A heuristic recommendation, inferred'}>
                    {diagnostic.certainty === 'certain' ? 'fact' : 'heuristic'}
                </Badge>
                <Badge>{diagnostic.category}</Badge>
                <code>{diagnostic.kind}</code>
            </div>
            <p>{diagnostic.message}</p>
            {diagnostic.subject.label && <small className="muted">{diagnostic.subject.label}</small>}
        </>
    );
}

export function DiagnosticItem({ diagnostic }: { diagnostic: Diagnostic }) {
    return (
        <li className={`diagnostic diagnostic--${diagnostic.severity}`}>
            <DiagnosticBody diagnostic={diagnostic} />
        </li>
    );
}

export function DiagnosticList({ diagnostics }: { diagnostics: Diagnostic[] }) {
    // Confirmed facts first, then heuristic recommendations, each by severity.
    const rank = { error: 0, warning: 1, info: 2 } as const;
    const ordered = [...diagnostics].sort((a, b) => (a.certainty === b.certainty ? rank[a.severity] - rank[b.severity] : a.certainty === 'certain' ? -1 : 1));
    return (
        <ul className="diagnostics">
            {ordered.map((d, i) => (
                <DiagnosticItem key={i} diagnostic={d} />
            ))}
        </ul>
    );
}

function CoverageView({ coverage, name }: { coverage: Coverage; name: string }) {
    const gaps = Object.entries(coverage.features).filter(([, v]) => v === 'partial' || v === 'unavailable');
    return (
        <div className="coverage">
            <div className="badges">
                <Badge tone={name}>{name}</Badge>
                <Badge tone={coverage.complete ? 'fact' : 'warning'}>{coverage.complete ? 'complete' : 'incomplete'}</Badge>
                {coverage.schemas && <small className="muted">schemas: {coverage.schemas.join(', ')}</small>}
            </div>
            {gaps.length > 0 && (
                <ul className="gaps">
                    {gaps.map(([feature, state]) => (
                        <li key={feature}>
                            <code>{feature}</code> <span className="muted">{state}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function download(item: ViewerDownload) {
    const url = URL.createObjectURL(new Blob([item.content], { type: item.mediaType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = item.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function Guide({ ctx, changes, downloads, onSelectSubject }: { ctx: DetailContext; changes?: ViewerChange[] | null; downloads?: ViewerDownload[]; onSelectSubject: (d: Diagnostic) => void }) {
    const { doc } = ctx;
    const facts = doc.diagnostics.filter((d) => d.certainty === 'certain').length;
    const states = new Set(doc.links.map((l) => l.state));
    return (
        <>
            <span className="tag">GUIDE</span>
            <h2>Schema details</h2>
            <p className="muted">Select a table or a connection to inspect its definition.</p>
            <div className="source-mode">
                <Badge tone={doc.source}>{doc.source}</Badge>
                <span className="muted">{SOURCE_TEXT[doc.source]}</span>
            </div>
            {doc.note && <p className="note">{doc.note}</p>}
            <h3>Legend</h3>
            <ul className="legend">
                {states.has('both') && (
                    <li>
                        <span className="line-key key--both" />
                        Foreign key and ORM relationship
                    </li>
                )}
                <li>
                    <span className="line-key key--foreign_key" />
                    Foreign-key constraint ({doc.source === 'declared' ? 'declared' : 'database'})
                </li>
                {states.has('relationship') && (
                    <li>
                        <span className="line-key key--relationship" />
                        Declared ORM relationship, no constraint
                    </li>
                )}
                {doc.derivedLinks.length > 0 && (
                    <li>
                        <span className="line-key key--through" />
                        ORM relationship through other tables
                    </li>
                )}
                {doc.source === 'combined' && (
                    <li>
                        <span className="line-key key--declared" />
                        Declared by the ORM, not in the database
                    </li>
                )}
            </ul>
            <h3>Shortcuts</h3>
            <dl className="shortcuts">
                <dt>
                    <kbd>/</kbd>
                </dt>
                <dd>Search</dd>
                <dt>
                    <kbd>Esc</kbd>
                </dt>
                <dd>Clear selection and focus</dd>
                <dt>
                    <kbd>+</kbd>
                    <kbd>−</kbd>
                </dt>
                <dd>Zoom</dd>
                <dt>
                    <kbd>0</kbd>
                </dt>
                <dd>Fit to view</dd>
                <dt>
                    <kbd>←</kbd>
                    <kbd>→</kbd>
                </dt>
                <dd>Pan the canvas</dd>
            </dl>
            <Section title="Coverage" count={doc.connections.length}>
                {doc.connections.map((c) => (
                    <div key={c.id} className="connection-coverage">
                        <strong>{c.name}</strong> <span className="muted">{c.driver ?? 'unknown driver'}</span>
                        {c.coverage.database && <CoverageView coverage={c.coverage.database} name="database" />}
                        {c.coverage.declared && <CoverageView coverage={c.coverage.declared} name="declared" />}
                    </div>
                ))}
            </Section>
            {doc.diagnostics.length > 0 && (
                <Section title={`Diagnostics · ${facts} facts, ${doc.diagnostics.length - facts} heuristics`} count={doc.diagnostics.length} open>
                    <ul className="diagnostics">
                        {[...doc.diagnostics]
                            .sort((a, b) => (a.certainty === b.certainty ? 0 : a.certainty === 'certain' ? -1 : 1))
                            .map((d, i) => (
                                <li key={i} className={`diagnostic diagnostic--${d.severity}`}>
                                    <button type="button" className="diagnostic-link" onClick={() => onSelectSubject(d)}>
                                        <DiagnosticBody diagnostic={d} />
                                    </button>
                                </li>
                            ))}
                    </ul>
                </Section>
            )}
            {changes && changes.length > 0 && (
                <Section title="Changes since the previous build" count={changes.length}>
                    <ul className="changes">
                        {changes.map((c, i) => (
                            <li key={i}>
                                <Badge tone={c.change}>{c.change}</Badge> <code>{c.type}</code> {c.label ?? c.subject ?? ''}
                                {c.message && <p className="muted">{c.message}</p>}
                            </li>
                        ))}
                    </ul>
                </Section>
            )}
            {downloads && downloads.length > 0 && (
                <>
                    <h3>Downloads</h3>
                    {downloads.map((item) => (
                        <button type="button" key={item.filename} className="detail-link" onClick={() => download(item)}>
                            ↓ {item.label}
                        </button>
                    ))}
                </>
            )}
        </>
    );
}

function IndexItem({ index, ctx }: { index: Index; ctx: DetailContext }) {
    const parts = index.parts.map((p, i) => (
        <code key={i} className={p.expression ? 'expression' : ''}>
            {p.column ?? p.expression}
            {p.length ? `(${p.length})` : ''}
            {p.order === 'desc' ? ' DESC' : ''}
            {p.nulls ? ` NULLS ${p.nulls.toUpperCase()}` : ''}
            {p.collation ? ` COLLATE ${p.collation}` : ''}
            {p.opclass ? ` ${p.opclass}` : ''}
        </code>
    ));
    const unknownExpression = index.expression && !index.parts.some((p) => p.expression);
    return (
        <li className="index">
            <div className="index-head">
                <strong>{index.name ?? 'unnamed index'}</strong>
                <span className="badges">
                    {index.primary && <Badge tone="pk">primary</Badge>}
                    {index.unique && !index.primary && <Badge tone="unique">unique</Badge>}
                    {index.backs?.kind === 'unique_constraint' && <Badge title="Enforces a unique constraint">constraint</Badge>}
                    {index.parts.length + (unknownExpression ? 1 : 0) > 1 && <Badge>composite</Badge>}
                    {index.partial && <Badge tone="partial">partial</Badge>}
                    {index.expression && <Badge tone="expression">expression</Badge>}
                    {index.method && <Badge>{index.method}</Badge>}
                    <ProvenanceBadge provenance={index.provenance} doc={ctx.doc} />
                </span>
            </div>
            <div className="parts">
                {parts}
                {unknownExpression && <span className="muted">expression not reported</span>}
            </div>
            {index.partial && (
                <div className="index-extra">
                    WHERE <code>{index.predicate ?? 'not reported'}</code>
                </div>
            )}
            {index.included.length > 0 && <div className="index-extra">INCLUDE {index.included.map((c) => <code key={c}>{c}</code>)}</div>}
            {index.dialectOptions && (
                <div className="index-extra">
                    {Object.entries(index.dialectOptions).map(([dialect, o]) => (
                        <div key={dialect}>
                            <Badge>{dialect}</Badge>
                            {o.method && <> {o.method}</>}
                            {o.predicate && (
                                <>
                                    {' '}
                                    WHERE <code>{o.predicate}</code>
                                </>
                            )}
                            {o.included?.length ? <> INCLUDE {o.included.join(', ')}</> : null}
                            {o.options && Object.entries(o.options).map(([k, v]) => <code key={k}> {k}={JSON.stringify(v)}</code>)}
                        </div>
                    ))}
                </div>
            )}
            {index.drift && <DriftView drift={index.drift} />}
            <ExtensionsView extensions={index.extensions} renderers={ctx.renderers} />
        </li>
    );
}

function DriftView({ drift }: { drift: NonNullable<Table['drift']> }) {
    return (
        <ul className="drift-list">
            {drift.map((d) => (
                <li key={d.field}>
                    <Badge tone="warning">drift</Badge> <code>{d.field}</code>: database <code>{JSON.stringify(d.database)}</code>, declared <code>{JSON.stringify(d.declared)}</code>
                </li>
            ))}
        </ul>
    );
}

function ConstraintItem({ constraint, ctx }: { constraint: Constraint; ctx: DetailContext }) {
    return (
        <li>
            <Badge tone={constraint.kind === 'unique' ? 'unique' : 'plain'}>{constraint.kind}</Badge> <strong>{constraint.name ?? 'unnamed'}</strong>{' '}
            {constraint.columns.map((c) => (
                <code key={c}>{c}</code>
            ))}
            {constraint.expression && <code className="expression">{constraint.expression}</code>}
            <ProvenanceBadge provenance={constraint.provenance} doc={ctx.doc} />
        </li>
    );
}

function ForeignKeyItem({ fk, ctx, onSelectTable }: { fk: ForeignKey; ctx: DetailContext; onSelectTable: (id: string) => void }) {
    const target = ctx.lookup.tables.get(fk.foreignTable);
    return (
        <li>
            <strong>{fk.name ?? 'unnamed'}</strong> <ProvenanceBadge provenance={fk.provenance} doc={ctx.doc} />
            <div>
                <code>{fk.columns.join(', ')}</code> →{' '}
                {target ? (
                    <button type="button" className="inline-link" onClick={() => onSelectTable(target.id)}>
                        {tableLabel(target)}
                    </button>
                ) : (
                    <span className="muted">{fk.foreignTable} (not in the document)</span>
                )}{' '}
                <code>{fk.foreignColumns.join(', ')}</code>
            </div>
            <small className="muted">
                on delete {fk.onDelete ?? '—'} · on update {fk.onUpdate ?? '—'}
                {fk.deferrable ? ` · deferrable${fk.initially ? ` initially ${fk.initially.toLowerCase()}` : ''}` : ''}
            </small>
            {fk.drift && <DriftView drift={fk.drift} />}
        </li>
    );
}

function RelationshipItem({ r, ctx, onSelectTable }: { r: Relationship; ctx: DetailContext; onSelectTable: (id: string) => void }) {
    const related = r.relatedTable ? ctx.lookup.tables.get(r.relatedTable) : undefined;
    const model = ctx.lookup.models.get(r.model);
    return (
        <li>
            <strong>{r.name}</strong> <code>{r.type}</code> <Badge>{r.cardinality}</Badge>
            {r.polymorphic && <Badge tone="expression">polymorphic</Badge>}
            {r.readOnly && <Badge>read-only</Badge>}
            <div className="muted">
                {model?.className ?? r.model} →{' '}
                {related ? (
                    <button type="button" className="inline-link" onClick={() => onSelectTable(related.id)}>
                        {tableLabel(related)}
                    </button>
                ) : (
                    'no single target'
                )}
                {r.pivot && <> via {ctx.lookup.tables.get(r.pivot.table)?.name ?? r.pivot.table}</>}
                {r.through && <> through {r.through.map((t) => ctx.lookup.tables.get(t)?.name ?? t).join(', ')}</>}
            </div>
            {r.keys && (
                <small>
                    <code>{r.keys.from.columns.join(', ')}</code> → <code>{r.keys.to.columns.join(', ')}</code>
                </small>
            )}
            {r.constraints.length > 0 && <small className="muted"> · {r.constraints.join(', ')}</small>}
            {r.note && <p className="note">{r.note}</p>}
            <SourceLink source={r.source} editor={ctx.editor} />
            <ExtensionsView extensions={r.extensions} renderers={ctx.renderers} />
        </li>
    );
}

export function TableDetails({
    ctx,
    table,
    edges,
    onFocus,
    onClear,
    onSelectEdge,
    onSelectTable,
}: {
    ctx: DetailContext;
    table: Table;
    edges: GraphEdge[];
    onFocus: () => void;
    onClear: () => void;
    onSelectEdge: (edge: GraphEdge) => void;
    onSelectTable: (id: string) => void;
}) {
    const { doc, lookup } = ctx;
    const connection = doc.connections.find((c) => c.id === lookup.connectionOf.get(table.id));
    const facts: [string, ReactNode][] = [
        ['Connection', connection ? `${connection.name}${connection.driver ? ` · ${connection.driver}` : ''}` : '—'],
        ['Schema', table.schema ?? (connection?.defaultSchema ? `Unqualified (${connection.defaultSchema})` : 'Unqualified')],
        ['Primary key', table.primaryKey.join(', ') || 'None'],
        ['Comment', table.comment || '—'],
    ];
    if (table.note) {
        facts.push(['Note', table.note]);
    }
    if (table.owner.kind !== 'application') {
        facts.push(['Owner', table.owner.package ? `${table.owner.kind} · ${table.owner.package}` : table.owner.kind]);
    }
    const models = doc.models.filter((m) => m.tables.includes(table.id));
    const relationships = relationshipsOf(doc, table.id);
    const diagnostics = doc.diagnostics.filter((d) => d.subject.id === table.id || table.indexes.some((i) => i.id === d.subject.id) || table.foreignKeys.some((f) => f.id === d.subject.id) || table.constraints.some((c) => c.id === d.subject.id));
    const incoming = [...lookup.tables.values()].flatMap((t) => (t.id === table.id ? [] : t.foreignKeys.filter((f) => f.foreignTable === table.id).map((f) => ({ t, f }))));
    return (
        <>
            <span className="tag">TABLE</span> <ProvenanceBadge provenance={table.provenance} doc={doc} />
            <h2>{tableLabel(table)}</h2>
            <div className="detail-actions">
                <button type="button" onClick={onFocus}>
                    Focus on neighbors
                </button>
                <button type="button" onClick={onClear}>
                    Clear
                </button>
            </div>
            <dl>
                {facts.map(([name, value]) => (
                    <div key={name} className="fact">
                        <dt>{name}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
            {table.drift && <DriftView drift={table.drift} />}
            {diagnostics.length > 0 && (
                <Section title="Diagnostics" count={diagnostics.length} open>
                    <DiagnosticList diagnostics={diagnostics} />
                </Section>
            )}
            <Section title="Columns" count={table.columns.length} open>
                <table className="columns-table">
                    <tbody>
                        {table.columns.map((c) => (
                            <tr key={c.name} className={c.drift?.length ? 'drift' : ''}>
                                <th scope="row">
                                    {c.name}
                                    {table.primaryKey.includes(c.name) && <Badge tone="pk">PK</Badge>}
                                </th>
                                <td>
                                    <code>{c.type}</code>
                                    {c.nullable ? <span className="muted"> null</span> : null}
                                    {c.autoIncrement ? <Badge>auto</Badge> : null}
                                    <ProvenanceBadge provenance={c.provenance} doc={doc} />
                                    {c.enum && <div className="muted">enum {c.enum.name ?? ''}: {c.enum.values.join(', ')}</div>}
                                    {c.default && (
                                        <div className="muted">
                                            default <code>{c.default.value}</code>
                                        </div>
                                    )}
                                    {c.ormDefault && (
                                        <div className="muted">
                                            ORM default ({c.ormDefault.kind}) <code>{c.ormDefault.value}</code>
                                        </div>
                                    )}
                                    {c.generated && (
                                        <div className="muted">
                                            generated {c.generated.kind ?? ''} <code>{c.generated.expression}</code>
                                        </div>
                                    )}
                                    {c.collation && <div className="muted">collation {c.collation}</div>}
                                    {c.comment && <div>{c.comment}</div>}
                                    {c.note && <div className="note">{c.note}</div>}
                                    {c.drift && <DriftView drift={c.drift} />}
                                    <ExtensionsView extensions={c.extensions} renderers={ctx.renderers} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>
            <Section title="Indexes" count={table.indexes.length} open={table.indexes.length > 0}>
                {table.indexes.length ? (
                    <ul className="indexes">
                        {table.indexes.map((i) => (
                            <IndexItem key={i.id} index={i} ctx={ctx} />
                        ))}
                    </ul>
                ) : (
                    <p className="muted">None reported</p>
                )}
            </Section>
            <Section title="Constraints" count={table.constraints.length}>
                {table.constraints.length ? (
                    <ul className="plain">
                        {table.constraints.map((c) => (
                            <ConstraintItem key={c.id} constraint={c} ctx={ctx} />
                        ))}
                    </ul>
                ) : (
                    <p className="muted">None reported</p>
                )}
            </Section>
            <Section title="Foreign keys" count={table.foreignKeys.length + incoming.length} open={table.foreignKeys.length + incoming.length > 0}>
                <ul className="plain">
                    {table.foreignKeys.map((f) => (
                        <ForeignKeyItem key={f.id} fk={f} ctx={ctx} onSelectTable={onSelectTable} />
                    ))}
                    {incoming.map(({ t, f }) => (
                        <li key={f.id}>
                            <span className="muted">referenced by</span>{' '}
                            <button type="button" className="inline-link" onClick={() => onSelectTable(t.id)}>
                                {tableLabel(t)}
                            </button>{' '}
                            <code>{f.columns.join(', ')}</code>
                        </li>
                    ))}
                </ul>
                {table.foreignKeys.length + incoming.length === 0 && <p className="muted">None reported</p>}
            </Section>
            <Section title="ORM relationships" count={relationships.length} open={relationships.length > 0}>
                {relationships.length ? (
                    <ul className="plain">
                        {relationships.map((r) => (
                            <RelationshipItem key={r.id} r={r} ctx={ctx} onSelectTable={onSelectTable} />
                        ))}
                    </ul>
                ) : (
                    <p className="muted">None declared</p>
                )}
            </Section>
            <Section title="Models" count={models.length}>
                {models.length ? (
                    <ul className="plain">
                        {models.map((m) => (
                            <li key={m.id}>
                                <strong>{m.className}</strong> <SourceLink source={m.source} editor={ctx.editor} />
                                <ExtensionsView extensions={m.extensions} renderers={ctx.renderers} />
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="muted">None declared</p>
                )}
            </Section>
            <Section title="Links" count={edges.length}>
                {edges.map((edge) => (
                    <button type="button" key={edge.id} className="detail-link" onClick={() => onSelectEdge(edge)}>
                        {edge.label}
                    </button>
                ))}
            </Section>
            <ExtensionsView extensions={table.extensions} renderers={ctx.renderers} />
        </>
    );
}

const KIND_TAG: Record<GraphEdge['kind'], string> = {
    both: 'FOREIGN KEY + ORM RELATIONSHIP',
    foreign_key: 'FOREIGN-KEY CONSTRAINT',
    relationship: 'DECLARED ORM RELATIONSHIP',
    through: 'THROUGH RELATIONSHIP',
};

export function EdgeDetails({ edge, ctx, onSelectTable }: { edge: GraphEdge; ctx: DetailContext; onSelectTable: (id: string) => void }) {
    const fk = edge.link?.foreignKey ? ctx.lookup.foreignKeys.get(edge.link.foreignKey) : undefined;
    const relationships = (edge.link?.relationships ?? (edge.derived ? [edge.derived.relationship] : [])).map((id) => ctx.lookup.relationships.get(id)).filter((r): r is Relationship => !!r);
    return (
        <>
            <span className="tag">{KIND_TAG[edge.kind]}</span>
            <h2>{edge.label}</h2>
            {edge.kind === 'relationship' && <p className="muted">The ORM declares this relationship; no foreign-key constraint enforces it.</p>}
            {edge.declaredOnly && <p className="muted">This foreign key is declared by the ORM but was not found in the database.</p>}
            {edge.link?.note && <p className="note">{edge.link.note}</p>}
            {fk && (
                <>
                    <h3>Foreign key</h3>
                    <ul className="plain">
                        <ForeignKeyItem fk={fk} ctx={ctx} onSelectTable={onSelectTable} />
                    </ul>
                </>
            )}
            {relationships.length > 0 && (
                <>
                    <h3>ORM relationships</h3>
                    <ul className="plain">
                        {relationships.map((r) => (
                            <RelationshipItem key={r.id} r={r} ctx={ctx} onSelectTable={onSelectTable} />
                        ))}
                    </ul>
                </>
            )}
            <h3>Tables</h3>
            {[...new Set([edge.source, ...(edge.derived?.via ?? []), edge.target])].map((id) => {
                const table = ctx.lookup.tables.get(id);
                return (
                    table && (
                        <button type="button" key={id} className="detail-link" onClick={() => onSelectTable(id)}>
                            {tableLabel(table)}
                        </button>
                    )
                );
            })}
        </>
    );
}
