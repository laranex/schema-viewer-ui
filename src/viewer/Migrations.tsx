import { useEffect, useRef } from 'react';
import { MIGRATION_STATUSES, type MigrationStatus, type MigrationTrack, type SchemaDocument } from '../contract/types';
import { Badge, DiagnosticList } from './Details';
import type { Lookup } from './graph';
import { scopeLabel, STATUS_TEXT, unknownReason } from './intelligence';
import { Icon } from './ui';

// The Migrations tab: each stored migration track, per connection and schema, with the status the producer computed.
// Revision status only: whether the tables match is a comparison's business, never this tab's.

const STATUS_ICON: Record<MigrationStatus, 'check' | 'behind' | 'branch' | 'circle' | 'help'> = {
    up_to_date: 'check',
    behind: 'behind',
    diverged: 'branch',
    uninitialized: 'circle',
    unknown: 'help',
};

export function StatusBadge({ status }: { status: MigrationStatus }) {
    const s = STATUS_TEXT[status];
    return (
        <span className={`status-badge status-badge--${status}`} title={s.meaning}>
            <Icon name={STATUS_ICON[status]} size={12} /> {s.label}
        </span>
    );
}

function Revisions({ ids, track, empty }: { ids: string[] | null; track: MigrationTrack; empty: string }) {
    if (ids === null || ids.length === 0) {
        return <span className="muted">{empty}</span>;
    }
    const labels = new Map(track.history?.revisions.map((r) => [r.id, r.branchLabels]) ?? []);
    return (
        <span className="chips">
            {ids.map((id) => (
                <code key={id} className={track.unknownRevisions.includes(id) ? 'unknown-revision' : ''}>
                    {id}
                    {labels.get(id)?.length ? ` (${labels.get(id)?.join(', ')})` : ''}
                </code>
            ))}
        </span>
    );
}

const yesNo = { yes: 'yes', no: 'no', unknown: 'unknown' } as const;

type Props = {
    doc: SchemaDocument;
    lookup: Lookup;
    selected: string | null;
    onSelect: (id: string | null) => void;
    onShowTable: (id: string) => void;
};

export function MigrationsPanel({ doc, lookup, selected, onSelect, onShowTable }: Props) {
    const list = useRef<HTMLDivElement>(null);
    const connections = doc.connections.filter((c) => doc.migrations.some((t) => t.connection === c.id));
    const counts = MIGRATION_STATUSES.map((s) => [s, doc.migrations.filter((t) => t.status === s).length] as const).filter(([, n]) => n > 0);

    useEffect(() => {
        if (selected) {
            list.current?.querySelector<HTMLElement>(`[data-track="${CSS.escape(selected)}"]`)?.scrollIntoView?.({ block: 'nearest' });
        }
    }, [selected]);

    return (
        <div className="migrations" ref={list}>
            <p className="muted cmp-explain">
                Revision status: where each database's version table stands in its migration history. It is not schema drift: a database can be up to date and still differ
                from another; schema differences are in Compare.
            </p>
            <ul className="status-counts" aria-label="Tracks by status">
                {counts.map(([status, n]) => (
                    <li key={status}>
                        <StatusBadge status={status} /> {n}
                    </li>
                ))}
            </ul>
            {connections.map((c) => (
                <section key={c.id} aria-label={`Connection ${c.name}`}>
                    <h3>
                        {c.name} <span className="muted">{c.driver ?? 'unknown driver'}</span>
                    </h3>
                    <ul className="cards">
                        {doc.migrations
                            .filter((t) => t.connection === c.id)
                            .map((t) => (
                                <TrackCard key={t.id} track={t} doc={doc} lookup={lookup} open={selected === t.id} onSelect={onSelect} onShowTable={onShowTable} />
                            ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}

function TrackCard({ track: t, doc, lookup, open, onSelect, onShowTable }: { track: MigrationTrack; doc: SchemaDocument; lookup: Lookup; open: boolean; onSelect: (id: string | null) => void; onShowTable: (id: string) => void }) {
    const s = STATUS_TEXT[t.status];
    const reason = unknownReason(t);
    const heads = t.history?.heads ?? null;
    const diagnostics = doc.diagnostics.filter((d) => d.subject.type === 'migration' && d.subject.id === t.id);
    const scope = t.schema ?? `default schema${lookup.connections.get(t.connection)?.defaultSchema ? ` (${lookup.connections.get(t.connection)?.defaultSchema})` : ''}`;
    const tone = s.tone === 'plain' ? '' : ` card--${s.tone === 'fact' ? 'fact' : s.tone}`;
    return (
        <li className={`card track${tone}${open ? ' selected' : ''}`} data-track={t.id}>
            <div className="card__eyebrow">
                {t.provider} · {scopeLabel(lookup, { connection: t.connection, schema: t.schema })}
            </div>
            <div className="track__head">
                <strong className="track__scope">{scope}</strong>
                <StatusBadge status={t.status} />
                {diagnostics.length > 0 && (
                    <span className="issue-count" title={`${diagnostics.length} diagnostics`}>
                        {diagnostics.length}
                    </span>
                )}
            </div>
            <p className="track__meaning">
                {s.meaning}
                {reason && ` ${reason}`}
            </p>
            <dl className="track__facts">
                <div className="fact">
                    <dt>Current</dt>
                    <dd>
                        <Revisions ids={t.current} track={t} empty={t.current === null ? 'could not be read' : 'none recorded'} />
                    </dd>
                </div>
                <div className="fact">
                    <dt>{heads && heads.length > 1 ? 'Expected heads' : 'Expected head'}</dt>
                    <dd>
                        <Revisions ids={heads} track={t} empty={heads === null ? 'history unavailable' : 'none'} />
                    </dd>
                </div>
                {t.status !== 'up_to_date' && (
                    <div className="fact">
                        <dt>Pending</dt>
                        <dd>
                            <Revisions ids={t.pending} track={t} empty={t.pending === null ? 'cannot be determined' : 'none'} />
                        </dd>
                    </div>
                )}
            </dl>
            {heads && heads.length > 1 && (
                <p className="track__warning">
                    <Icon name="branch" size={13} /> Multiple heads: the history has {heads.length} unmerged branches.
                </p>
            )}
            {open && (
                <div className="track__more">
                    <dl className="track__facts">
                        {t.unknownRevisions.length > 0 && (
                            <div className="fact">
                                <dt>Unknown to the scripts</dt>
                                <dd>
                                    <Revisions ids={t.unknownRevisions} track={t} empty="none" />
                                </dd>
                            </div>
                        )}
                        {t.history && t.history.missing.length > 0 && (
                            <div className="fact">
                                <dt>Missing from history</dt>
                                <dd>
                                    <Revisions ids={t.history.missing} track={t} empty="none" /> <span className="muted">a partial history</span>
                                </dd>
                            </div>
                        )}
                        <div className="fact">
                            <dt>Revisions</dt>
                            <dd>{t.history ? t.history.revisions.length : <span className="muted">scripts not read</span>}</dd>
                        </div>
                        <div className="fact">
                            <dt>Version table</dt>
                            <dd>
                                {t.versionTable && lookup.tables.has(t.versionTable) ? (
                                    <button type="button" className="inline-link" onClick={() => onShowTable(t.versionTable as string)}>
                                        {lookup.label(t.versionTable)}
                                    </button>
                                ) : (
                                    <span className="muted">{t.versionTable ?? 'none in the database'}</span>
                                )}
                            </dd>
                        </div>
                    </dl>
                    {diagnostics.length > 0 && <DiagnosticList diagnostics={diagnostics} />}
                    {t.coverage.length > 0 && (
                        <>
                            <h4>Migration coverage</h4>
                            <p className="muted small">Autogenerate and migration scripts are separate facts: excluded from autogenerate never means not migrated.</p>
                            <ul className="plain coverage-rows">
                                {t.coverage.map((row) => (
                                    <li key={`${row.name}:${row.table ?? ''}`}>
                                        {row.table && lookup.tables.has(row.table) ? (
                                            <button type="button" className="inline-link" onClick={() => onShowTable(row.table as string)}>
                                                {row.name}
                                            </button>
                                        ) : (
                                            <strong>{row.name}</strong>
                                        )}{' '}
                                        {row.table === null && <span className="muted">(only in migrations)</span>}
                                        <span className="badges">
                                            <Badge title="Whether an ORM model declares the table">{row.declared ? 'model' : 'no model'}</Badge>
                                            <Badge title="Whether the tool's autogenerate compares the table">autogenerate {row.autogenerate}</Badge>
                                            <Badge title="Whether migration scripts create the table">migrations {yesNo[row.migrationManaged]}</Badge>
                                            {row.certainty === 'likely' && (
                                                <Badge tone="heuristic" title="An answer is unknown, so this row is a heuristic">
                                                    likely
                                                </Badge>
                                            )}
                                        </span>
                                        {row.evidence.length > 0 && (
                                            <small className="muted evidence">
                                                {row.evidence.map((e) => `${e.kind.replace(/_/g, ' ')}: ${e.detail}`).join(' · ')}
                                            </small>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}
            <button type="button" className="link-button track__toggle" aria-expanded={open} onClick={() => onSelect(open ? null : t.id)}>
                {open ? 'Less' : 'More'}
                <span className="sr-only"> about {scope}</span>
            </button>
        </li>
    );
}
