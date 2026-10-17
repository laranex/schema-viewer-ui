import { useEffect, useId, useMemo, useRef } from 'react';
import { CHANGES, OBJECT_TYPES, type Certainty, type Change, type Comparison, type Coverage, type Difference, type ObjectType, type SchemaDocument, type Severity } from '../contract/types';
import { Badge, DiagnosticList } from './Details';
import type { Lookup } from './graph';
import { CERTAINTY_TEXT, CHANGE_TEXT, OBJECT_TEXT, scopeKey, scopeLabel, valueText } from './intelligence';
import { Icon, Ident } from './ui';

// The Compare tab: the comparisons the document stores, one baseline → target pair at a time. Everything shown is the
// producer's result; nothing is compared here.

export type CompareFilters = { objectType: ObjectType | ''; change: Change | ''; severity: Severity | ''; certainty: Certainty | '' };
type Filters = CompareFilters;
export const NO_FILTERS: Filters = { objectType: '', change: '', severity: '', certainty: '' };
const SEVERITIES: Severity[] = ['error', 'warning', 'info'];
const CERTAINTIES: Certainty[] = ['certain', 'likely'];

// The filters' names in a deep link (#object=…&change=…&severity=…&certainty=…), and reading them back: unknown values are dropped.
export const FILTER_PARAM: Record<keyof Filters, string> = { objectType: 'object', change: 'change', severity: 'severity', certainty: 'certainty' };
export function filtersFrom(params: URLSearchParams): Filters {
    const pick = <V extends string>(key: keyof Filters, allowed: readonly V[]): V | '' => {
        const value = params.get(FILTER_PARAM[key]);
        return allowed.includes(value as V) ? (value as V) : '';
    };
    return { objectType: pick('objectType', OBJECT_TYPES), change: pick('change', CHANGES), severity: pick('severity', SEVERITIES), certainty: pick('certainty', CERTAINTIES) };
}

export function ChangeMark({ change, likely = false }: { change: Change; likely?: boolean }) {
    return (
        <span className={`cmp-mark cmp-mark--${change}${likely ? ' cmp-mark--likely' : ''}`} aria-hidden="true">
            {CHANGE_TEXT[change].symbol}
        </span>
    );
}

export function CertaintyBadge({ certainty }: { certainty: Certainty }) {
    return (
        <Badge tone={certainty === 'certain' ? 'fact' : 'heuristic'} title={CERTAINTY_TEXT[certainty].long}>
            {certainty === 'certain' ? 'certain' : 'likely · heuristic'}
        </Badge>
    );
}

// Baseline and target values side by side: the object itself for missing and extra, each differing field for changed.
export function DifferenceSides({ difference: d, baseline, target }: { difference: Difference; baseline: string; target: string }) {
    const rows: [string, string | null, string | null][] =
        d.change === 'changed' ? d.fields.map((f) => [f.field, valueText(f.baseline), valueText(f.target)]) : [[OBJECT_TEXT[d.objectType], d.baseline?.label ?? null, d.target?.label ?? null]];
    return (
        <table className="cmp-sides">
            <caption className="sr-only">
                {d.change === 'changed' ? 'Differing fields' : 'Presence'}, baseline {baseline} against target {target}
            </caption>
            <thead>
                <tr>
                    <th scope="col">{d.change === 'changed' ? 'Field' : 'Object'}</th>
                    <th scope="col">Baseline</th>
                    <th scope="col">Target</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(([field, before, after]) => (
                    <tr key={field}>
                        <th scope="row">
                            <Ident text={field} />
                        </th>
                        <td className={before === null ? 'absent' : ''}>{before === null ? 'absent' : <code><Ident text={before} /></code>}</td>
                        <td className={after === null ? 'absent' : ''}>{after === null ? 'absent' : <code><Ident text={after} /></code>}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function CoverageGaps({ doc, lookup, comparison }: { doc: SchemaDocument; lookup: Lookup; comparison: Comparison }) {
    const ids = [...new Set([comparison.baseline.connection, comparison.target.connection])];
    const gaps = ids.flatMap((id) => {
        const connection = lookup.connections.get(id);
        const coverage: Coverage | null | undefined = doc.source === 'declared' ? connection?.coverage.declared : connection?.coverage.database;
        const features = Object.entries(coverage?.features ?? {}).filter(([, v]) => v === 'partial' || v === 'unavailable');
        return features.length ? [{ name: connection?.name ?? id, features }] : [];
    });
    if (!gaps.length) {
        return null;
    }
    return (
        <ul className="gaps cmp-gaps">
            {gaps.map((g) => (
                <li key={g.name}>
                    <strong>{g.name}</strong>:{' '}
                    {g.features.map(([feature, state], i) => (
                        <span key={feature}>
                            {i > 0 && ', '}
                            <code>{feature}</code> <span className="muted">{state}</span>
                        </span>
                    ))}
                </li>
            ))}
        </ul>
    );
}

type Props = {
    doc: SchemaDocument;
    lookup: Lookup;
    comparison: Comparison;
    difference: string | null;
    overlay: boolean;
    onOverlay: (on: boolean) => void;
    onComparison: (id: string) => void;
    onDifference: (id: string | null) => void;
    onShowTable: (table: string, column: string | null) => void;
    filters: Filters;
    onFilters: (filters: Filters) => void;
};

export function ComparePanel({ doc, lookup, comparison: c, difference, overlay, onOverlay, onComparison, onDifference, onShowTable, filters, onFilters: setFilters }: Props) {
    const id = useId();
    const list = useRef<HTMLDivElement>(null);
    const baselines = useMemo(() => [...new Map(doc.comparisons.map((x) => [scopeKey(x.baseline), x.baseline])).values()], [doc]);
    const targets = doc.comparisons.filter((x) => scopeKey(x.baseline) === scopeKey(c.baseline));
    const reverse = doc.comparisons.find((x) => scopeKey(x.baseline) === scopeKey(c.target) && scopeKey(x.target) === scopeKey(c.baseline));
    const baseline = scopeLabel(lookup, c.baseline);
    const target = scopeLabel(lookup, c.target);
    const total = c.summary.missing + c.summary.extra + c.summary.changed;
    const shown = c.differences.filter(
        (d) =>
            (!filters.objectType || d.objectType === filters.objectType) &&
            (!filters.change || d.change === filters.change) &&
            (!filters.severity || d.severity === filters.severity) &&
            (!filters.certainty || d.certainty === filters.certainty),
    );
    const filtered = Object.values(filters).some(Boolean);
    const diagnostics = doc.diagnostics.filter((d) => (d.subject.type === 'comparison' && d.subject.id === c.id) || (d.subject.type === 'connection' && (d.subject.id === c.baseline.connection || d.subject.id === c.target.connection)));
    const count = <K extends keyof Filters>(key: K, value: Filters[K]) => c.differences.filter((d) => (d as unknown as Record<string, unknown>)[key] === value).length;

    // A deep-linked or chosen difference scrolls into view once.
    useEffect(() => {
        if (difference) {
            list.current?.querySelector<HTMLElement>(`[data-difference="${CSS.escape(difference)}"]`)?.scrollIntoView?.({ block: 'nearest' });
        }
    }, [difference, c.id]);

    const select = (key: keyof Filters, label: string, options: [string, string][]) => (
        <label className="cmp-filter">
            <span>{label}</span>
            <select value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}>
                <option value="">All</option>
                {options.map(([value, text]) => (
                    <option key={value} value={value}>
                        {text}
                    </option>
                ))}
            </select>
        </label>
    );

    return (
        <div className="compare">
            <div className="cmp-scopes">
                <label className="cmp-filter">
                    <span>Baseline</span>
                    <select
                        value={scopeKey(c.baseline)}
                        onChange={(e) => {
                            const next = doc.comparisons.find((x) => scopeKey(x.baseline) === e.target.value);
                            if (next) {
                                onComparison(next.id);
                            }
                        }}
                    >
                        {baselines.map((s) => (
                            <option key={scopeKey(s)} value={scopeKey(s)}>
                                {scopeLabel(lookup, s)}
                            </option>
                        ))}
                    </select>
                </label>
                <span className="cmp-arrow" aria-hidden="true">
                    →
                </span>
                <label className="cmp-filter">
                    <span>Target</span>
                    <select value={c.id} onChange={(e) => onComparison(e.target.value)}>
                        {targets.map((x) => (
                            <option key={x.id} value={x.id}>
                                {scopeLabel(lookup, x.target)}
                            </option>
                        ))}
                    </select>
                </label>
                {reverse && (
                    <button type="button" className="cmp-swap" onClick={() => onComparison(reverse.id)} aria-label="Swap baseline and target" title="Open the stored comparison in the other direction">
                        ⇄
                    </button>
                )}
            </div>
            <p className="cmp-direction">
                <span className="muted">Baseline</span> <strong>{baseline}</strong> <span aria-hidden="true">→</span>
                <span className="sr-only">compared with</span> <span className="muted">target</span> <strong>{target}</strong>
            </p>
            <p className="muted cmp-explain">
                <strong>−</strong> missing: in the baseline, not the target. <strong>+</strong> extra: in the target only. <strong>~</strong> changed: in both, with different
                fields. Schema differences only; migration revisions are in Migrations.
            </p>

            {!c.complete ? (
                <div className="cmp-alert" role="note" aria-label="Incomplete comparison">
                    <Icon name="warning" />
                    <div>
                        <strong>Incomplete comparison: not a clean result.</strong>
                        <p>
                            {c.omitted > 0 && `${c.omitted} of ${total} differences were left out of the listing. `}
                            The producer marked this comparison incomplete
                            {c.omitted > 0 ? ': differences were omitted, or' : ':'} a side's inspection did not cover every compared feature or schema. A difference not listed
                            here may still exist.
                        </p>
                        <CoverageGaps doc={doc} lookup={lookup} comparison={c} />
                    </div>
                </div>
            ) : total === 0 ? (
                <div className="cmp-clean" role="note">
                    <Icon name="check" /> <span>No differences: this complete comparison found the two scopes equal in every compared feature.</span>
                </div>
            ) : null}

            <dl className="cmp-summary" aria-label="Summary">
                {CHANGES.map((change) => (
                    <div key={change} className={`cmp-stat cmp-stat--${change}`}>
                        <dt>
                            <ChangeMark change={change} /> {CHANGE_TEXT[change].label}
                        </dt>
                        <dd>{c.summary[change]}</dd>
                    </div>
                ))}
                <div className="cmp-stat">
                    <dt>listed</dt>
                    <dd>
                        {c.differences.length}
                        {c.omitted > 0 && <small> of {total}</small>}
                    </dd>
                </div>
            </dl>

            <label className="cmp-overlay">
                <input type="checkbox" checked={overlay} onChange={(e) => onOverlay(e.target.checked)} /> Mark these differences on the diagram
            </label>

            {c.differences.length > 0 && (
                <fieldset className="cmp-filters">
                    <legend className="sr-only">Filter differences</legend>
                    {select(
                        'objectType',
                        'Object',
                        OBJECT_TYPES.filter((t) => count('objectType', t)).map((t) => [t, `${OBJECT_TEXT[t]} (${count('objectType', t)})`]),
                    )}
                    {select(
                        'change',
                        'Change',
                        CHANGES.filter((x) => count('change', x)).map((x) => [x, `${CHANGE_TEXT[x].symbol} ${CHANGE_TEXT[x].label} (${count('change', x)})`]),
                    )}
                    {select(
                        'severity',
                        'Severity',
                        SEVERITIES.filter((x) => count('severity', x)).map((x) => [x, `${x} (${count('severity', x)})`]),
                    )}
                    {select('certainty', 'Certainty', [
                        ['certain', `certain (${count('certainty', 'certain')})`],
                        ['likely', `likely, heuristic (${count('certainty', 'likely')})`],
                    ])}
                    {filtered && (
                        <button type="button" className="link-button" onClick={() => setFilters(NO_FILTERS)}>
                            Clear filters
                        </button>
                    )}
                </fieldset>
            )}

            <div ref={list} aria-live="polite">
                {filtered && (
                    <p className="muted" id={`${id}-count`}>
                        {shown.length} of {c.differences.length} listed differences match.
                    </p>
                )}
                {c.differences.length > 0 && shown.length === 0 && <p className="muted empty-note">No listed difference matches the filters.</p>}
                {CHANGES.map((change) => {
                    const group = shown.filter((d) => d.change === change);
                    if (!group.length) {
                        return null;
                    }
                    return (
                        <section key={change} className="cmp-group" aria-label={CHANGE_TEXT[change].group}>
                            <h3>
                                <ChangeMark change={change} /> {CHANGE_TEXT[change].group} <span className="count">{group.length}</span>
                            </h3>
                            <ul className="cards">
                                {group.map((d) => (
                                    <DifferenceCard key={d.id} d={d} lookup={lookup} baseline={baseline} target={target} selected={difference === d.id} onSelect={onDifference} onShowTable={onShowTable} />
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>

            {diagnostics.length > 0 && (
                <>
                    <h3>Diagnostics for these connections</h3>
                    <DiagnosticList diagnostics={diagnostics} />
                </>
            )}
        </div>
    );
}

function DifferenceCard({
    d,
    lookup,
    baseline,
    target,
    selected,
    onSelect,
    onShowTable,
}: {
    d: Difference;
    lookup: Lookup;
    baseline: string;
    target: string;
    selected: boolean;
    onSelect: (id: string | null) => void;
    onShowTable: (table: string, column: string | null) => void;
}) {
    const column = d.objectType === 'column' ? d.key[d.key.length - 1] : null;
    const show = (side: 'baseline' | 'target') => {
        const ref = d[side];
        if (!ref || !lookup.tables.has(ref.table)) {
            return null;
        }
        return (
            <button
                type="button"
                className="link-button"
                onClick={() => {
                    onSelect(d.id);
                    onShowTable(ref.table, column);
                }}
            >
                Show in {side}: {lookup.label(ref.table)}
            </button>
        );
    };
    return (
        <li className={`card diff diff--${d.change} card--${d.severity}${d.certainty === 'likely' ? ' diff--likely' : ''}${selected ? ' selected' : ''}`} data-difference={d.id}>
            <div className="card__eyebrow">
                <ChangeMark change={d.change} likely={d.certainty === 'likely'} /> {CHANGE_TEXT[d.change].label} · {OBJECT_TEXT[d.objectType]} · {d.severity}
            </div>
            <button type="button" className="diff__title" aria-pressed={selected} onClick={() => onSelect(selected ? null : d.id)}>
                <Ident text={(d.baseline ?? d.target)?.label ?? ''} />
            </button>{' '}
            <CertaintyBadge certainty={d.certainty} />
            <DifferenceSides difference={d} baseline={baseline} target={target} />
            <div className="diff__actions">
                {show('baseline')}
                {show('target')}
            </div>
        </li>
    );
}
