import { useState, type ReactNode } from 'react';
import type { Constraint, Coverage, Diagnostic, Extensions, ForeignKey, Index, JsonValue, Provenance, Relationship, SchemaDocument, Source, Table } from '../contract/types';
import type { ViewerChange } from '../contract/viewer-config';
import { ChangeMark, CertaintyBadge, DifferenceSides } from './Compare';
import { relationshipsOf, type GraphEdge, type Lookup } from './graph';
import { InferredItem, InferredTag, NO_ATTRIBUTE } from './Inferred';
import { CHANGE_TEXT, comparisonLabel, inferredByLink, inferredOfTable, OBJECT_TEXT, scopeLabel, tableMarks, type TableMark } from './intelligence';
import { StatusBadge } from './Migrations';
import { Icon, Ident } from './ui';

// Renders one extension namespace richly; the viewer falls back to a generic rendering for the rest.
export type ExtensionRenderers = Record<string, (value: Extensions[string]) => ReactNode>;

export type DetailContext = {
    doc: SchemaDocument;
    lookup: Lookup;
    editor: string | null;
    renderers: ExtensionRenderers;
    declares: Set<Kind>;
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

// What kinds of entity the ORM declares somewhere in the document. "Database only" says something only about a kind
// the ORM declares at all: Eloquent, for one, declares no columns, so every column would be "database only".
export type Kind = 'table' | 'column' | 'index' | 'foreignKey' | 'constraint';

export function declaredKinds(doc: SchemaDocument): Set<Kind> {
    const kinds = new Set<Kind>();
    const d = (p: Provenance) => p.includes('declared');
    for (const t of doc.connections.flatMap((c) => c.tables)) {
        if (d(t.provenance)) kinds.add('table');
        if (t.columns.some((c) => d(c.provenance))) kinds.add('column');
        if (t.indexes.some((i) => d(i.provenance))) kinds.add('index');
        if (t.foreignKeys.some((f) => d(f.provenance))) kinds.add('foreignKey');
        if (t.constraints.some((c) => d(c.provenance))) kinds.add('constraint');
    }
    return kinds;
}

export function ProvenanceBadge({ provenance, kind, ctx }: { provenance: Provenance; kind: Kind; ctx: DetailContext }) {
    if (ctx.doc.source !== 'combined' || provenance.length === 2) {
        return null;
    }
    return provenance[0] === 'declared' ? (
        <Badge tone="declared" title="Declared by the ORM only; not found in the database">
            declared only
        </Badge>
    ) : ctx.declares.has(kind) ? (
        <Badge tone="database" title="Found in the database; the ORM does not declare it">
            database only
        </Badge>
    ) : null;
}

// Schemes an editor link must never carry: they run code or embed content. Browsers ignore control characters and
// spaces before a scheme, so they are skipped here too. After Laranex Laravel Schema Viewer (MIT), SidePanel.tsx.
const UNSAFE_HREF = /^[\s\0-\x1f]*(javascript|data|vbscript|blob|file):/i;

// The editor link for a source location: {file} keeps its slashes (encodeURI), {line} defaults to 1. Null when there is no
// template or it uses an unsafe scheme.
export function editorHref(editor: string | null, source: Source): string | null {
    if (!editor || UNSAFE_HREF.test(editor)) {
        return null;
    }
    return editor.replace('{file}', () => encodeURI(source.file)).replace('{line}', () => String(source.line ?? 1));
}

function SourceLink({ source, editor }: { source: Source | null; editor: string | null }) {
    if (!source) {
        return null;
    }
    const text = `${source.file}${source.line ? `:${source.line}` : ''}`;
    const href = editorHref(editor, source);
    if (!href) {
        return (
            <code className="source">
                <Ident text={text} />
            </code>
        );
    }
    return (
        <a className="source" href={href} title={`Open ${text} in your editor`}>
            <Ident text={text} /> <Icon name="external" size={12} />
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

export function DiagnosticList({ diagnostics, renderers = {} }: { diagnostics: Diagnostic[]; renderers?: ExtensionRenderers }) {
    // Confirmed facts first, then heuristic recommendations, each by severity.
    const rank = { error: 0, warning: 1, info: 2 } as const;
    const ordered = [...diagnostics].sort((a, b) => (a.certainty === b.certainty ? rank[a.severity] - rank[b.severity] : a.certainty === 'certain' ? -1 : 1));
    return (
        <ul className="cards">
            {ordered.map((d) => (
                <li key={d.id} className={`card card--${d.severity}`}>
                    <div className="card__eyebrow">
                        {d.severity} · {d.certainty === 'certain' ? 'fact' : 'heuristic'} · {d.category}
                    </div>
                    <strong>{diagnosticTitle(d.kind)}</strong>
                    <p>{d.message}</p>
                    <ExtensionsView extensions={d.extensions} renderers={renderers} />
                </li>
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

const HUMAN: Record<string, string> = {
    unresolved_foreign_key: 'Foreign key could not be resolved',
    unresolved_relationship: 'Relationship could not be resolved',
    unsupported_metadata: 'Metadata not supported',
    inspection_unavailable: 'Inspection unavailable',
    model_without_table: 'Model without a table',
    table_without_model: 'Table without a model',
    declared_only: 'Declared only',
    database_only: 'Only in the database',
    column_drift: 'Column differs',
    index_drift: 'Index differs',
    foreign_key_drift: 'Foreign key differs',
    missing_index: 'Missing index',
    duplicate_index: 'Duplicate index',
    redundant_index: 'Redundant index',
    relationship_without_foreign_key: 'Relationship without a foreign key',
    foreign_key_without_relationship: 'Foreign key without a relationship',
    comparison_incomplete: 'Comparison incomplete',
    migration_history_unavailable: 'Migration history unavailable',
    migration_version_table_unreadable: 'Version table unreadable',
    migration_multiple_heads: 'Multiple migration heads',
    migration_unknown_revision: 'Unknown migration revision',
    inference_ambiguous: 'Ambiguous inference',
};

export const diagnosticTitle = (kind: string) => HUMAN[kind] ?? kind.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// What the Details tab shows with nothing selected: where the metadata came from, the legend and the coverage.
export function Overview({
    ctx,
    onShortcuts,
    onTour,
    onCompare,
    onMigrations,
    onInferred,
}: {
    ctx: DetailContext;
    onShortcuts: () => void;
    onTour: () => void;
    onCompare?: () => void;
    onMigrations?: () => void;
    onInferred?: () => void;
}) {
    const { doc } = ctx;
    const states = new Set(doc.links.map((l) => l.state));
    return (
        <>
            <h2>Nothing selected</h2>
            <p className="muted">Choose a table on the diagram, in Browse or in the search, or click a line between two tables.</p>
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
                {doc.inferredAssociations.length > 0 && (
                    <li>
                        <span className="line-key key--inferred" />
                        Foreign key with an inferred association: a heuristic, no ORM relationship declared
                    </li>
                )}
                {doc.comparisons.length > 0 && (
                    <li>
                        <span className="legend-marks">
                            <ChangeMark change="missing" />
                            <ChangeMark change="extra" />
                            <ChangeMark change="changed" />
                        </span>
                        Compared with another scope: missing in the target, extra in the target, changed; a dashed mark is likely (heuristic)
                    </li>
                )}
            </ul>
            {(doc.comparisons.length > 0 || doc.migrations.length > 0 || doc.inferredAssociations.length > 0) && (
                <>
                    <h3>Stored results</h3>
                    <ul className="plain intelligence-summary">
                        {doc.comparisons.length > 0 && (
                            <li>
                                <button type="button" className="link-button" onClick={onCompare}>
                                    {doc.comparisons.length} {doc.comparisons.length === 1 ? 'comparison' : 'comparisons'}
                                </button>{' '}
                                <span className="muted">schema differences between two scopes</span>
                            </li>
                        )}
                        {doc.migrations.length > 0 && (
                            <li>
                                <button type="button" className="link-button" onClick={onMigrations}>
                                    {doc.migrations.length} migration {doc.migrations.length === 1 ? 'track' : 'tracks'}
                                </button>{' '}
                                <span className="muted">revision status, apart from schema drift</span>
                            </li>
                        )}
                        {doc.inferredAssociations.length > 0 && (
                            <li>
                                <button type="button" className="link-button" onClick={onInferred}>
                                    {doc.inferredAssociations.length} inferred {doc.inferredAssociations.length === 1 ? 'association' : 'associations'}
                                </button>{' '}
                                <span className="muted">heuristic, no ORM relationship declared</span>
                            </li>
                        )}
                    </ul>
                </>
            )}
            <h3>Coverage</h3>
            {doc.connections.map((c) => (
                <div key={c.id} className="connection-coverage">
                    <strong>{c.name}</strong> <span className="muted">{c.driver ?? 'unknown driver'}</span>
                    {c.coverage.database && <CoverageView coverage={c.coverage.database} name="database" />}
                    {c.coverage.declared && <CoverageView coverage={c.coverage.declared} name="declared" />}
                </div>
            ))}
            <div className="detail-actions">
                <button type="button" onClick={onTour}>
                    Take the tour
                </button>
                <button type="button" onClick={onShortcuts}>
                    Shortcuts <kbd>S</kbd>
                </button>
            </div>
        </>
    );
}

// The Diagnostics tab: confirmed facts apart from heuristic advice, each with a way to the table it is about.
export type SubjectActions = { comparison: (id: string) => void; migration: (id: string) => void; inferredAssociation: (id: string) => void };
const SUBJECT_ACTION: Record<keyof SubjectActions, string> = { comparison: 'Show the comparison', migration: 'Show the migration status', inferredAssociation: 'Show the inferred association' };

export function DiagnosticsPanel({
    doc,
    diagnostics = doc.diagnostics,
    connection = null,
    documentWide,
    lookup,
    tableOf,
    onShow,
    onSubject,
    renderers = {},
}: {
    doc: SchemaDocument;
    // The diagnostics to list: those of the connection in view and the whole document's.
    diagnostics?: Diagnostic[];
    // The connection in view, by name; null with every connection shown.
    connection?: string | null;
    documentWide?: (d: Diagnostic) => boolean;
    lookup: Lookup;
    tableOf: (d: Diagnostic) => string | undefined;
    onShow: (table: string) => void;
    onSubject?: SubjectActions;
    renderers?: ExtensionRenderers;
}) {
    const [certainty, setCertainty] = useState<'all' | 'certain' | 'likely'>('all');
    const rank = { error: 0, warning: 1, info: 2 } as const;
    const shown = diagnostics
        .filter((d) => certainty === 'all' || d.certainty === certainty)
        .sort((a, b) => (a.certainty === b.certainty ? rank[a.severity] - rank[b.severity] : a.certainty === 'certain' ? -1 : 1));
    const elsewhere = doc.diagnostics.length - diagnostics.length;
    const scopeNote = connection && (
        <p className="muted diagnostics-scope">
            Connection <strong>{connection}</strong> and the whole document
            {elsewhere > 0 ? `; ${elsewhere} more on other connections` : ''}.
        </p>
    );
    if (diagnostics.length === 0) {
        return (
            <>
                {scopeNote}
                <p className="muted empty-note">{doc.diagnostics.length === 0 ? 'No diagnostics: nothing failed to read, and the producer reported no findings.' : 'No diagnostics for this connection.'}</p>
            </>
        );
    }
    return (
        <>
            {scopeNote}
            <div className="segmented" role="radiogroup" aria-label="Show diagnostics">
                {(
                    [
                        ['all', `All ${diagnostics.length}`],
                        ['certain', 'Facts'],
                        ['likely', 'Heuristics'],
                    ] as const
                ).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={certainty === value} onClick={() => setCertainty(value)}>
                        {label}
                    </button>
                ))}
            </div>
            <ul className="cards">
                {shown.map((d) => {
                    const table = tableOf(d);
                    const name = table ? lookup.tables.get(table) : undefined;
                    const subject = d.subject.type === 'comparison' || d.subject.type === 'migration' || d.subject.type === 'inferredAssociation' ? d.subject.type : null;
                    return (
                        <li key={d.id} className={`card card--${d.severity}`}>
                            <div className="card__eyebrow">
                                {d.severity} · {d.certainty === 'certain' ? 'fact' : 'heuristic'} · {d.category}
                                {connection && documentWide?.(d) ? ' · whole document' : ''}
                            </div>
                            <strong>{diagnosticTitle(d.kind)}</strong>
                            <p>{d.message}</p>
                            <ExtensionsView extensions={d.extensions} renderers={renderers} />
                            {name && (
                                <button type="button" className="link-button" onClick={() => onShow(name.id)}>
                                    Show {lookup.label(name.id)}
                                </button>
                            )}
                            {subject && onSubject && d.subject.id !== null && (
                                <button type="button" className="link-button" onClick={() => onSubject[subject](d.subject.id as string)}>
                                    {SUBJECT_ACTION[subject]}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

export function ChangesPanel({ changes }: { changes: ViewerChange[] }) {
    return (
        <ul className="cards">
            {changes.map((c, i) => (
                <li key={i} className="card">
                    <div className="card__eyebrow">
                        {c.change} · {c.type}
                    </div>
                    <strong>{c.label ?? c.subject ?? c.type}</strong>
                    {c.message && <p>{c.message}</p>}
                    {c.fields &&
                        Object.entries(c.fields).map(([field, [before, after]]) => (
                            <p key={field} className="muted">
                                <code>{field}</code>: {JSON.stringify(before)} → {JSON.stringify(after)}
                            </p>
                        ))}
                </li>
            ))}
        </ul>
    );
}

// A comparison's mark on one entity of a table: missing, extra or changed against the other side.
function EntityMark({ marks, id }: { marks: TableMark[]; id: string }) {
    const found = marks.flatMap((m) => {
        const d = m.entities.get(id);
        return d ? [d] : [];
    });
    return (
        <>
            {found.map((d) => (
                <Badge key={d.id} tone={`cmp-${d.change}`} title={`${CHANGE_TEXT[d.change].meaning} (${d.certainty})`}>
                    {CHANGE_TEXT[d.change].symbol} {CHANGE_TEXT[d.change].label}
                    {d.certainty === 'likely' ? ' · likely' : ''}
                </Badge>
            ))}
        </>
    );
}

function IndexItem({ index, ctx, marks = [] }: { index: Index; ctx: DetailContext; marks?: TableMark[] }) {
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
    const primary = index.backs?.kind === 'primary_key';
    return (
        <li className="index">
            <div className="index-head">
                <strong>{index.name ?? 'unnamed index'}</strong>
                <span className="badges">
                    {primary && <Badge tone="pk">primary</Badge>}
                    {index.unique && !primary && <Badge tone="unique">unique</Badge>}
                    {index.backs?.kind === 'unique_constraint' && <Badge title="Enforces a unique constraint">constraint</Badge>}
                    {index.parts.length + (unknownExpression ? 1 : 0) > 1 && <Badge>composite</Badge>}
                    {index.partial && <Badge tone="partial">partial</Badge>}
                    {index.expression && <Badge tone="expression">expression</Badge>}
                    {index.method && <Badge>{index.method}</Badge>}
                    <ProvenanceBadge provenance={index.provenance} kind="index" ctx={ctx} />
                    <EntityMark marks={marks} id={index.id} />
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

function ConstraintItem({ constraint, ctx, marks = [] }: { constraint: Constraint; ctx: DetailContext; marks?: TableMark[] }) {
    return (
        <li>
            <Badge tone={constraint.kind === 'unique' ? 'unique' : 'plain'}>{constraint.kind}</Badge> <strong>{constraint.name ?? 'unnamed'}</strong>{' '}
            {constraint.columns.map((c) => (
                <code key={c}>{c}</code>
            ))}
            {constraint.expression && <code className="expression">{constraint.expression}</code>}
            <ProvenanceBadge provenance={constraint.provenance} kind="constraint" ctx={ctx} />
            <EntityMark marks={marks} id={constraint.id} />
        </li>
    );
}

function ForeignKeyItem({ fk, ctx, onSelectTable, marks = [] }: { fk: ForeignKey; ctx: DetailContext; onSelectTable: (id: string) => void; marks?: TableMark[] }) {
    const target = ctx.lookup.tables.get(fk.foreignTable);
    return (
        <li>
            <strong>{fk.name ?? 'unnamed'}</strong> <ProvenanceBadge provenance={fk.provenance} kind="foreignKey" ctx={ctx} />
            <EntityMark marks={marks} id={fk.id} />
            <div>
                <code>{fk.columns.join(', ')}</code> →{' '}
                {target ? (
                    <button type="button" className="inline-link" onClick={() => onSelectTable(target.id)}>
                        {ctx.lookup.label(target.id)}
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
                        {ctx.lookup.label(related.id)}
                    </button>
                ) : (
                    'no single target'
                )}
                {r.pivot && <> via {ctx.lookup.label(r.pivot.table)}</>}
                {r.through && <> through {r.through.map((t) => ctx.lookup.label(t)).join(', ')}</>}
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

function ComparisonDifferences({ mark, ctx, onCompare }: { mark: TableMark; ctx: DetailContext; onCompare?: (comparison: string, difference: string) => void }) {
    const c = mark.comparison;
    const baseline = scopeLabel(ctx.lookup, c.baseline);
    const target = scopeLabel(ctx.lookup, c.target);
    return (
        <div className="table-comparison">
            <p className="muted small">
                {comparisonLabel(ctx.lookup, c)}: this table is on the <strong>{mark.side}</strong> side.
                {!c.complete && <strong className="cmp-incomplete-inline"> Incomplete comparison: more differences may exist.</strong>}
            </p>
            <ul className="cards">
                {mark.differences.map((d) => (
                    <li key={d.id} className={`card diff diff--${d.change} card--${d.severity}${d.certainty === 'likely' ? ' diff--likely' : ''}`}>
                        <div className="card__eyebrow">
                            <ChangeMark change={d.change} likely={d.certainty === 'likely'} /> {CHANGE_TEXT[d.change].label} · {OBJECT_TEXT[d.objectType]} · {d.severity}
                        </div>
                        <strong>{(d.baseline ?? d.target)?.label}</strong> <CertaintyBadge certainty={d.certainty} />
                        <DifferenceSides difference={d} baseline={baseline} target={target} />
                        {onCompare && (
                            <button type="button" className="link-button" onClick={() => onCompare(c.id, d.id)}>
                                Open in Compare
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function TableDetails({
    ctx,
    table,
    edges,
    onFocus,
    onClear,
    onCopyLink,
    onSelectEdge,
    onSelectTable,
    onCompare,
    onInferred,
    onMigration,
}: {
    ctx: DetailContext;
    table: Table;
    edges: GraphEdge[];
    onFocus: () => void;
    onClear: () => void;
    onCopyLink: () => void;
    onSelectEdge: (edge: GraphEdge) => void;
    onSelectTable: (id: string) => void;
    onCompare?: (comparison: string, difference: string) => void;
    onInferred?: (id: string) => void;
    onMigration?: (id: string) => void;
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
    const marks = tableMarks(doc, table.id);
    const columnMarks = (name: string) =>
        marks.flatMap((m) => {
            const d = m.columns.get(name);
            return d ? [d] : [];
        });
    const differenceCount = marks.reduce((n, m) => n + m.differences.length, 0);
    const inferred = inferredOfTable(doc, table.id);
    const tracks = doc.migrations.filter((t) => t.versionTable === table.id || t.coverage.some((row) => row.table === table.id));
    return (
        <>
            <h2 className="details__title">
                <Ident text={lookup.label(table.id)} /> <ProvenanceBadge provenance={table.provenance} kind="table" ctx={ctx} />
            </h2>
            <p className="details__subtitle">
                {connection ? `${connection.name}${connection.driver ? ` (${connection.driver})` : ''}` : ''} · {table.columns.length} columns
                {table.owner.kind !== 'application' ? ` · ${table.owner.package ?? table.owner.kind}` : ''}
            </p>
            {models.length > 0 && (
                <div className="chips">
                    {models.map((m) => (
                        <code key={m.id} title={m.className}>
                            {m.className}
                        </code>
                    ))}
                </div>
            )}
            <div className="detail-actions">
                <button type="button" onClick={onFocus}>
                    Focus
                </button>
                <button type="button" onClick={onCopyLink}>
                    Copy link
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
            {differenceCount > 0 && (
                <Section title="Compared with another scope" count={differenceCount} open>
                    {marks.map((m) => (
                        <ComparisonDifferences key={m.comparison.id} mark={m} ctx={ctx} onCompare={onCompare} />
                    ))}
                </Section>
            )}
            {diagnostics.length > 0 && (
                <Section title="Diagnostics" count={diagnostics.length} open>
                    <DiagnosticList diagnostics={diagnostics} renderers={ctx.renderers} />
                </Section>
            )}
            <Section title="Columns" count={table.columns.length} open>
                <table className="columns-table">
                    <tbody>
                        {table.columns.map((c) => (
                            <tr key={c.name} className={c.drift?.length ? 'drift' : ''}>
                                <th scope="row">
                                    <Ident text={c.name} />
                                    {table.primaryKey.includes(c.name) && <Badge tone="pk">PK</Badge>}
                                    {columnMarks(c.name).map((d) => (
                                        <Badge key={d.id} tone={`cmp-${d.change}`} title={`${CHANGE_TEXT[d.change].meaning} (${d.certainty})`}>
                                            {CHANGE_TEXT[d.change].symbol} {CHANGE_TEXT[d.change].label}
                                            {d.certainty === 'likely' ? ' · likely' : ''}
                                        </Badge>
                                    ))}
                                </th>
                                <td>
                                    <code>
                                        <Ident text={c.type} />
                                    </code>
                                    {c.nullable ? <span className="muted"> null</span> : null}
                                    {c.autoIncrement ? <Badge>auto</Badge> : null}
                                    <ProvenanceBadge provenance={c.provenance} kind="column" ctx={ctx} />
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
                            <IndexItem key={i.id} index={i} ctx={ctx} marks={marks} />
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
                            <ConstraintItem key={c.id} constraint={c} ctx={ctx} marks={marks} />
                        ))}
                    </ul>
                ) : (
                    <p className="muted">None reported</p>
                )}
            </Section>
            <Section title="Foreign keys" count={table.foreignKeys.length + incoming.length} open={table.foreignKeys.length + incoming.length > 0}>
                <ul className="plain">
                    {table.foreignKeys.map((f) => (
                        <ForeignKeyItem key={f.id} fk={f} ctx={ctx} onSelectTable={onSelectTable} marks={marks} />
                    ))}
                    {incoming.map(({ t, f }) => (
                        <li key={f.id}>
                            <span className="muted">referenced by</span>{' '}
                            <button type="button" className="inline-link" onClick={() => onSelectTable(t.id)}>
                                {lookup.label(t.id)}
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
            {inferred.length > 0 && (
                <Section title="Inferred associations" count={inferred.length} open>
                    <p className="muted small">Heuristic: foreign keys imply these; the ORM declares no relationship for them.</p>
                    <ul className="plain">
                        {inferred.map((a) => (
                            <InferredItem key={a.id} association={a} lookup={lookup} onOpen={(id) => onInferred?.(id)} />
                        ))}
                    </ul>
                </Section>
            )}
            {tracks.length > 0 && (
                <Section title="Migrations" count={tracks.length}>
                    <p className="muted small">Revision status of the migration tracks that name this table; not schema drift.</p>
                    <ul className="plain">
                        {tracks.map((t) => {
                            const row = t.coverage.find((r) => r.table === table.id);
                            return (
                                <li key={t.id}>
                                    <button type="button" className="inline-link" onClick={() => onMigration?.(t.id)}>
                                        {t.provider} · {scopeLabel(lookup, { connection: t.connection, schema: t.schema })}
                                    </button>{' '}
                                    <StatusBadge status={t.status} />
                                    {t.versionTable === table.id && <div className="muted">This is the track's version table.</div>}
                                    {row && (
                                        <div className="muted">
                                            autogenerate {row.autogenerate} · migrations {row.migrationManaged}
                                            {row.certainty === 'likely' ? ' · likely' : ''}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </Section>
            )}
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

const connectionName = (ctx: DetailContext, table: string) => ctx.lookup.connections.get(ctx.lookup.connectionOf.get(table) ?? '')?.name ?? '?';

export function EdgeDetails({ edge, ctx, onSelectTable, onInferred }: { edge: GraphEdge; ctx: DetailContext; onSelectTable: (id: string) => void; onInferred?: (id: string) => void }) {
    const fk = edge.link?.foreignKey ? ctx.lookup.foreignKeys.get(edge.link.foreignKey) : undefined;
    const inferred = edge.link ? (inferredByLink(ctx.doc).get(edge.link.id) ?? []) : [];
    const relationships = (edge.link?.relationships ?? (edge.derived ? [edge.derived.relationship] : [])).map((id) => ctx.lookup.relationships.get(id)).filter((r): r is Relationship => !!r);
    return (
        <>
            <span className="tag">{KIND_TAG[edge.kind]}</span>
            <h2>
                <Ident text={edge.label} />
            </h2>
            {edge.kind === 'relationship' && !edge.crossConnection && <p className="muted">The ORM declares this relationship; no foreign-key constraint enforces it.</p>}
            {edge.crossConnection && (
                <p className="muted cross-note">
                    Crosses connections, from {connectionName(ctx, edge.source)} to {connectionName(ctx, edge.target)}: an ORM relationship only. Foreign-key constraints never cross connections.
                </p>
            )}
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
            {inferred.length > 0 && (
                <>
                    <h3>Inferred association</h3>
                    <p className="inferred-note">
                        <InferredTag /> {NO_ATTRIBUTE}
                    </p>
                    <ul className="plain">
                        {inferred.map((a) => (
                            <InferredItem key={a.id} association={a} lookup={ctx.lookup} onOpen={(id) => onInferred?.(id)} />
                        ))}
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
                            {ctx.lookup.label(id)}
                        </button>
                    )
                );
            })}
        </>
    );
}
