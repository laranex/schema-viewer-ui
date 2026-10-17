import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson, validateDocument, type SchemaDocument } from '../src/contract';
import { comparisonMarks, inferredByLink, markSummary, scopeLabel, STATUS_TEXT, unknownReason, valueText } from '../src/viewer/intelligence';
import { lookup as buildLookup } from '../src/viewer/graph';
import type { LayoutRequest } from '../src/viewer/layout';
import { SchemaViewer } from '../src/viewer/SchemaViewer';
import { root } from './helpers';
import { VIEWER_DOCUMENTS } from './viewer-documents';

// The comparison, migration and inferred-association views over the contract's fixtures and the viewer-only documents
// derived from them. The viewer only displays what the document stores.

const grid = async ({ ids }: LayoutRequest) => Object.fromEntries(ids.map((id, i) => [id, { x: (i % 4) * 560, y: Math.floor(i / 4) * 400 }]));
const fixture = (name: string): SchemaDocument => JSON.parse(readFileSync(root('contract/fixtures/valid', `${name}.json`), 'utf8'));
const viewerDocument = (name: string): SchemaDocument => JSON.parse(readFileSync(root('tests/viewer-documents', `${name}.json`), 'utf8'));

async function show(doc: SchemaDocument, props: Partial<Parameters<typeof SchemaViewer>[0]> = {}) {
    const view = render(
        <div style={{ height: 800 }}>
            <SchemaViewer document={doc} layout={grid} persistTheme={false} deepLinks={false} {...props} />
        </div>,
    );
    await waitFor(() => expect(view.container.querySelector('.lsv')).toHaveAttribute('data-loaded', 'true'));
    return view;
}

const panel = () => screen.getByRole('complementary', { name: 'Side panel' });
const openTab = (name: RegExp | string) => fireEvent.click(within(panel()).getByRole('tab', { name }));
const card = (container: HTMLElement, id: string) => container.querySelector(`.react-flow__node [data-table-id="${id}"]`) as HTMLElement;
const press = (key: string) =>
    act(() => {
        fireEvent.keyDown(document.body, { key });
    });

beforeEach(() => history.replaceState(null, '', '/'));

describe('viewer-only test documents', () => {
    it('are current and strictly valid', () => {
        mkdirSync(root('tests/viewer-documents'), { recursive: true });
        for (const [name, build] of Object.entries(VIEWER_DOCUMENTS)) {
            const doc = build();
            const result = validateDocument(doc, { strict: true });
            expect(result.errors, name).toEqual([]);
            const file = root('tests/viewer-documents', `${name}.json`);
            if (process.env.UPDATE_VIEWER_DOCUMENTS) {
                writeFileSync(file, canonicalJson(doc));
            }
            expect(readFileSync(file, 'utf8'), `${name}.json is stale; run UPDATE_VIEWER_DOCUMENTS=1 npx vitest run tests/intelligence.test.tsx`).toBe(canonicalJson(doc));
        }
    });
});

describe('helpers over stored results', () => {
    it('labels scopes by connection and schema, naming the default schema a null schema stands for', () => {
        const doc = fixture('comparison-multi-connection');
        const l = buildLookup(doc);
        expect(scopeLabel(l, doc.comparisons[0].baseline)).toBe('primary · default schema (public)');
        expect(scopeLabel(l, { connection: 'connection:app', schema: 'tenant_a' })).toBe('connection:app · tenant_a');
    });

    it('marks each side of a difference on its own table, columns by name and entities by id', () => {
        const c = fixture('comparison-tenant-schemas').comparisons[0];
        const marks = comparisonMarks(c);
        expect(markSummary(marks.get('app:tenant_a.invoices')!)).toMatchObject({ change: 'missing', text: 'missing in target' });
        expect(markSummary(marks.get('app:tenant_b.refunds')!)).toMatchObject({ change: 'extra', text: 'extra in target' });
        expect(marks.get('app:tenant_a.invoices')?.side).toBe('baseline');
        expect(marks.has('app:tenant_b.invoices')).toBe(false);
        const orders = marks.get('app:tenant_b.orders')!;
        expect(orders.side).toBe('target');
        expect([...orders.columns.keys()].sort()).toEqual(['placed_at', 'total']);
        expect(orders.entities.has('app:tenant_b.orders:index:orders_total_idx')).toBe(true);
        expect(marks.get('app:tenant_a.users')?.likely).toBe(1);
    });

    it('formats stored values as text', () => {
        expect(valueText({ kind: 'literal', value: "'active'" })).toBe("'active' (literal)");
        expect(valueText(['order_id', 'line_no'])).toBe('order_id, line_no');
        expect(valueText(null)).toBe('null');
        expect(valueText(true)).toBe('true');
    });

    it('explains an unknown migration status from the stored fields, and uses the contract wording for diverged', () => {
        const tracks = fixture('migrations-alembic').migrations;
        const of = (schema: string) => tracks.find((t) => t.schema === schema)!;
        expect(unknownReason(of('tenant_locked'))).toMatch(/version table could not be read/);
        expect(unknownReason(of('tenant_scriptless'))).toMatch(/scripts could not be read/);
        expect(unknownReason(of('tenant_unknown'))).toMatch(/no migration script defines/);
        expect(unknownReason(of('tenant_current'))).toBeNull();
        expect(STATUS_TEXT.diverged.meaning).toMatch(/ancestor of another recorded revision/);
    });

    it('indexes inferred associations by the stored links they rest on', () => {
        const doc = fixture('inferred-associations');
        const byLink = inferredByLink(doc);
        const ids = new Set(doc.links.map((l) => l.id));
        expect([...byLink.keys()].every((id) => ids.has(id))).toBe(true);
        expect(byLink.size).toBe(doc.inferredAssociations.reduce((n, a) => n + a.links.length, 0));
    });
});

describe('documents without comparisons, migrations or inferences', () => {
    it('look exactly as before: no new tabs, notes, marks or modes', async () => {
        const doc = fixture('database-sqlite-indexes');
        expect([doc.comparisons, doc.migrations, doc.inferredAssociations]).toEqual([[], [], []]);
        const { container } = await show(doc);
        expect(within(panel()).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Browse', 'Details', 'Diagnostics1']);
        expect(container.querySelector('.canvas-note, .cmp-chip, .cmp-mark')).toBeNull();
        expect(within(panel()).queryByRole('radio', { name: 'Inferred' })).toBeNull();
        press('x');
        press('m');
        expect(within(panel()).getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
    });
});

describe('Compare', () => {
    it('shows the baseline → target direction, the summary counts and the differences by change, side by side', async () => {
        await show(fixture('comparison-tenant-schemas'));
        expect(within(panel()).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Browse', 'Details', 'Diagnostics', 'Compare', 'Migrations']);
        openTab('Compare');
        const body = panel();
        expect(within(body).getByRole('combobox', { name: 'Baseline' })).toHaveDisplayValue('app · tenant_a');
        expect(within(body).getByRole('combobox', { name: 'Target' })).toHaveDisplayValue('app · tenant_b');
        expect(body.querySelector('.cmp-direction')).toHaveTextContent(/^Baseline app · tenant_a →\s*compared with target app · tenant_b$/);
        const summary = body.querySelector('.cmp-summary') as HTMLElement;
        expect([...summary.querySelectorAll('dd')].map((d) => d.textContent)).toEqual(['8', '8', '9', '25']);
        expect(within(body).getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Missing from the target', 'Extra in the target', 'Changed']);
        const totalCard = [...body.querySelectorAll<HTMLElement>('[data-difference]')].find((c) => c.querySelector('.diff__title')?.textContent === 'tenant_a.orders.total') as HTMLElement;
        const table = within(totalCard).getByRole('table');
        expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Field', 'Baseline', 'Target']);
        expect(within(table).getByRole('row', { name: /type/ })).toHaveTextContent('typenumeric(10,2)numeric(12,2)');
        const missing = [...body.querySelectorAll<HTMLElement>('[data-difference]')].find((c) => c.querySelector('.diff__title')?.textContent === 'tenant_a.invoices') as HTMLElement;
        expect(within(missing).getByRole('row', { name: /table/ })).toHaveTextContent('tabletenant_a.invoicesabsent');
        expect(within(missing).queryByRole('button', { name: /Show in target/ })).toBeNull();
    });

    it('filters by object type, change, severity and certainty, telling heuristics from facts', async () => {
        await show(fixture('comparison-tenant-schemas'));
        openTab('Compare');
        const body = panel();
        const cards = () => body.querySelectorAll('[data-difference]');
        expect(cards()).toHaveLength(25);
        fireEvent.change(within(body).getByRole('combobox', { name: 'Certainty' }), { target: { value: 'likely' } });
        expect(cards()).toHaveLength(2);
        expect([...cards()].every((c) => c.textContent?.includes('likely · heuristic'))).toBe(true);
        fireEvent.click(within(body).getByRole('button', { name: 'Clear filters' }));
        fireEvent.change(within(body).getByRole('combobox', { name: 'Object' }), { target: { value: 'column' } });
        fireEvent.change(within(body).getByRole('combobox', { name: 'Change' }), { target: { value: 'changed' } });
        expect(cards()).toHaveLength(3);
        fireEvent.change(within(body).getByRole('combobox', { name: 'Severity' }), { target: { value: 'error' } });
        expect(cards()).toHaveLength(0);
        expect(within(body).getByText('No listed difference matches the filters.')).toBeInTheDocument();
    });

    it('never lets an incomplete comparison look clean', async () => {
        const { container } = await show(fixture('comparison-incomplete'));
        expect(within(panel()).getByRole('tab', { name: /^Compare\s*\(incomplete\)$/ })).toBeInTheDocument();
        expect(screen.getByRole('note', { name: 'Comparison marks' })).toHaveTextContent('app · tenant_b → app · tenant_a · incomplete, 20 differences not marked');
        openTab(/Compare/);
        const alert = within(panel()).getByRole('note', { name: 'Incomplete comparison' });
        expect(alert).toHaveTextContent('Incomplete comparison: not a clean result.');
        expect(alert).toHaveTextContent('20 of 25 differences were left out of the listing.');
        expect(alert).toHaveTextContent('app: checkConstraints unavailable');
        expect(within(panel()).queryByText(/No differences/)).toBeNull();
        expect(within(panel()).getByText('Comparison incomplete')).toBeInTheDocument();
        expect(within(panel()).getByText('Inspection unavailable')).toBeInTheDocument();
        expect(panel().querySelector('.cmp-summary')).toHaveTextContent('5 of 25');
        expect(container.querySelectorAll('.cmp-chip').length).toBeGreaterThan(0);
    });

    it('says so when a complete comparison found no differences', async () => {
        await show(viewerDocument('viewer-clean-comparison'));
        openTab('Compare');
        expect(within(panel()).getByText(/No differences: this complete comparison found the two scopes equal/)).toBeInTheDocument();
        expect(within(panel()).queryByRole('note', { name: 'Incomplete comparison' })).toBeNull();
    });

    it('builds the baseline and target selectors from the stored scopes, and swaps to the reverse comparison', async () => {
        await show(viewerDocument('viewer-two-way-comparison'));
        openTab('Compare');
        const body = panel();
        const baseline = within(body).getByRole('combobox', { name: 'Baseline' }) as HTMLSelectElement;
        expect([...baseline.options].map((o) => o.textContent)).toEqual(['app · tenant_a', 'app · tenant_b']);
        const start = baseline.value;
        fireEvent.click(within(body).getByRole('button', { name: 'Swap baseline and target' }));
        expect(baseline.value).not.toBe(start);
        expect(body.querySelector('.cmp-direction')).toHaveTextContent(baseline.selectedOptions[0].textContent === 'app · tenant_a' ? 'Baseline app · tenant_a' : 'Baseline app · tenant_b');
        fireEvent.change(baseline, { target: { value: start } });
        expect(baseline.value).toBe(start);
    });

    it('opens the affected table on the chosen side, and lists its differences in Details', async () => {
        await show(fixture('comparison-tenant-schemas'));
        openTab('Compare');
        const totalCard = [...panel().querySelectorAll<HTMLElement>('[data-difference]')].find((c) => c.querySelector('.diff__title')?.textContent === 'tenant_a.orders.total') as HTMLElement;
        fireEvent.click(within(totalCard).getByRole('button', { name: 'Show in target: tenant_b.orders' }));
        expect(within(panel()).getByRole('heading', { name: /tenant_b\.orders/ })).toBeInTheDocument();
        const section = within(panel()).getByText('Compared with another scope').closest('details') as HTMLElement;
        expect(section).toHaveTextContent('this table is on the target side');
        expect(within(section).getAllByRole('listitem')).toHaveLength(6);
        const columns = within(panel()).getByText('Columns').closest('details') as HTMLElement;
        expect(within(columns).getByRole('rowheader', { name: /total/ })).toHaveTextContent('~ changed');
        const indexes = within(panel()).getByText('Indexes').closest('details') as HTMLElement;
        expect(within(indexes).getByText('orders_total_idx').closest('li')).toHaveTextContent('+ extra');
        fireEvent.click(within(section).getAllByRole('button', { name: 'Open in Compare' })[0]);
        expect(within(panel()).getByRole('tab', { name: 'Compare' })).toHaveAttribute('aria-selected', 'true');
        expect(panel().querySelector('[data-difference].selected')).toBeTruthy();
    });

    it('marks missing, extra and changed tables and columns on the diagram, likely ones apart, and turns the marks off', async () => {
        const { container } = await show(fixture('comparison-tenant-schemas'));
        await waitFor(() => expect(card(container, 'app:tenant_a.invoices')).toBeTruthy());
        expect(card(container, 'app:tenant_a.invoices')).toHaveClass('cmp--missing');
        expect(card(container, 'app:tenant_a.invoices').querySelector('.cmp-chip')).toHaveTextContent('− missing in target');
        expect(card(container, 'app:tenant_b.refunds').querySelector('.cmp-chip')).toHaveTextContent('+ extra in target');
        expect(card(container, 'app:tenant_a.orders').querySelector('.cmp-chip')).toHaveTextContent('~ 6 differences');
        // A folded card keeps the columns the comparison names.
        expect(card(container, 'app:tenant_a.users').querySelector('[data-column="legacy_code"]')).toHaveClass('cmp-column--missing');
        expect(card(container, 'app:tenant_b.users').querySelector('[data-column="phone"]')).toHaveClass('cmp-column--extra');
        const status = card(container, 'app:tenant_a.users').querySelector('[data-column="status"]') as HTMLElement;
        expect(status).toHaveClass('cmp-column--likely');
        expect(status.querySelector('.cmp-mark')).toHaveTextContent('~ changed');
        expect(status.getAttribute('title')).toMatch(/changed against the target: default 'active'::character varying \(literal\) → 'pending'::character varying \(literal\) \(likely\)/);
        expect(card(container, 'app:tenant_a.alembic_version').querySelector('.cmp-chip')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Show' }));
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Comparison marks/ }));
        await waitFor(() => expect(container.querySelector('.cmp-chip')).toBeNull());
        expect(screen.queryByRole('note', { name: 'Comparison marks' })).toBeNull();
    });

    it('keeps the comparison and the chosen difference in the URL and opens on them', async () => {
        const doc = viewerDocument('viewer-two-way-comparison');
        const second = doc.comparisons[1];
        const difference = second.differences[3];
        history.replaceState(null, '', `/#view=compare&comparison=${second.id}&difference=${difference.id}`);
        await show(doc, { deepLinks: true });
        expect(within(panel()).getByRole('tab', { name: 'Compare' })).toHaveAttribute('aria-selected', 'true');
        expect((within(panel()).getByRole('combobox', { name: 'Target' }) as HTMLSelectElement).value).toBe(second.id);
        const selected = panel().querySelector(`[data-difference="${difference.id}"]`) as HTMLElement;
        expect(within(selected).getByRole('button', { pressed: true })).toBeInTheDocument();
        fireEvent.click(within(selected).getByRole('button', { pressed: true }));
        await waitFor(() => expect(location.hash).toBe(`#view=compare&comparison=${second.id}`));
        press('a');
        await waitFor(() => expect(location.hash).toBe(`#comparison=${second.id}`));
    });

    it('opens with X, and from a comparison diagnostic', async () => {
        await show(fixture('comparison-incomplete'));
        press('x');
        expect(within(panel()).getByRole('tab', { name: /Compare/ })).toHaveAttribute('aria-selected', 'true');
        openTab(/Diagnostics/);
        const card = within(panel()).getByText('Comparison incomplete').closest('li') as HTMLElement;
        fireEvent.click(within(card).getByRole('button', { name: 'Show the comparison' }));
        expect(within(panel()).getByRole('tab', { name: /Compare/ })).toHaveAttribute('aria-selected', 'true');
    });
});

describe('Migrations', () => {
    const tracks = () => fixture('migrations-alembic').migrations;
    const trackCard = (schema: string) => panel().querySelector(`[data-track="${tracks().find((t) => t.schema === schema)!.id}"]`) as HTMLElement;

    it('lists each track per connection and schema with its stored status, apart from schema drift', async () => {
        await show(fixture('migrations-alembic'));
        expect(within(panel()).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Browse', 'Details', 'Diagnostics4', 'Migrations']);
        openTab('Migrations');
        expect(within(panel()).getByText(/It is not schema drift/)).toBeInTheDocument();
        expect(within(panel()).getByRole('region', { name: 'Connection app' })).toBeInTheDocument();
        expect(panel().querySelectorAll('[data-track]')).toHaveLength(10);
        expect(trackCard('tenant_current')).toHaveTextContent('Up to date');
        expect(trackCard('tenant_behind')).toHaveTextContent('Behind (pending)');
        expect(trackCard('tenant_behind')).toHaveTextContent('Pending3c4d5e6f7a8b4d5e6f7a8b9c (reporting)5e6f7a8b9c0d');
        expect(trackCard('tenant_diverged')).toHaveTextContent('Diverged');
        expect(trackCard('tenant_diverged')).toHaveTextContent('A recorded revision is an ancestor of another recorded revision');
        expect(trackCard('tenant_diverged')).toHaveTextContent('Pendingcannot be determined');
        expect(trackCard('tenant_new')).toHaveTextContent('Uninitialized');
        expect(trackCard('tenant_new')).toHaveTextContent('Currentnone recorded');
        expect(trackCard('tenant_locked')).toHaveTextContent('Unknown');
        expect(trackCard('tenant_locked')).toHaveTextContent('Currentcould not be read');
        expect(trackCard('tenant_scriptless')).toHaveTextContent('Expected headhistory unavailable');
        expect(trackCard('tenant_branches')).toHaveTextContent('Expected heads6f7a8b9c0d1e (billing)7a8b9c0d1e2f (search)');
        expect(trackCard('tenant_branches')).toHaveTextContent('Multiple heads: the history has 2 unmerged branches.');
        expect(panel().querySelector('.status-badge--diverged')?.getAttribute('title')).toBe(STATUS_TEXT.diverged.meaning);
    });

    it('shows a track’s coverage, version table and diagnostics when expanded', async () => {
        await show(fixture('migrations-alembic'));
        openTab('Migrations');
        fireEvent.click(within(trackCard('tenant_current')).getByRole('button', { name: /More/ }));
        const current = trackCard('tenant_current');
        expect(within(current).getByText('Migration coverage')).toBeInTheDocument();
        expect(within(current).getByText(/excluded from autogenerate never means not migrated/)).toBeInTheDocument();
        const audit = within(current).getByRole('button', { name: 'audit_log' }).closest('li') as HTMLElement;
        expect(audit).toHaveTextContent('autogenerate excluded');
        expect(audit).toHaveTextContent('migrations yes');
        expect(within(current).getByText('archived_orders').closest('li')).toHaveTextContent('(only in migrations)');
        fireEvent.click(within(trackCard('tenant_unknown')).getByRole('button', { name: /More/ }));
        expect(trackCard('tenant_unknown')).toHaveTextContent('Unknown to the scripts9f0e1d2c3b4a');
        expect(within(trackCard('tenant_unknown')).getByText('Unknown migration revision')).toBeInTheDocument();
        fireEvent.click(within(trackCard('tenant_unknown')).getByRole('button', { name: 'tenant_unknown.alembic_version' }));
        expect(within(panel()).getByRole('heading', { name: /tenant_unknown\.alembic_version/ })).toBeInTheDocument();
        const migrations = [...panel().querySelectorAll('summary')].find((x) => x.textContent?.startsWith('Migrations'))?.closest('details') as HTMLElement;
        expect(migrations).toHaveTextContent("This is the track's version table.");
    });

    it('opens on a deep link to one track, with M, and from a migration diagnostic', async () => {
        const id = tracks().find((t) => t.schema === 'tenant_partial')!.id;
        history.replaceState(null, '', `/#view=migrations&migration=${id}`);
        await show(fixture('migrations-alembic'), { deepLinks: true });
        expect(within(panel()).getByRole('tab', { name: 'Migrations' })).toHaveAttribute('aria-selected', 'true');
        expect(trackCard('tenant_partial')).toHaveClass('selected');
        expect(trackCard('tenant_partial')).toHaveTextContent('Missing from history1a2b3c4d5e6f');
        press('a');
        press('m');
        expect(within(panel()).getByRole('tab', { name: 'Migrations' })).toHaveAttribute('aria-selected', 'true');
        openTab(/Diagnostics/);
        const diagnostic = within(panel()).getByText('Multiple migration heads').closest('li') as HTMLElement;
        fireEvent.click(within(diagnostic).getByRole('button', { name: 'Show the migration status' }));
        expect(trackCard('tenant_branches')).toHaveClass('selected');
    });
});

describe('Inferred associations', () => {
    it('lists them in Browse apart from declared relationships, and explains one as inferred with no ORM attribute', async () => {
        const doc = fixture('inferred-associations');
        await show(doc);
        fireEvent.click(within(panel()).getByRole('radio', { name: 'Inferred' }));
        expect(panel().querySelectorAll('.browse__row')).toHaveLength(10);
        expect(within(panel()).getByText(/no ORM relationship attribute is declared for any of them/)).toBeInTheDocument();
        fireEvent.click([...panel().querySelectorAll<HTMLElement>('.browse__row')].find((r) => r.textContent?.includes('Profile → User')) as HTMLElement);
        const body = panel();
        expect(within(body).getByText('INFERRED ASSOCIATION · HEURISTIC')).toBeInTheDocument();
        expect(within(body).getByRole('heading', { name: 'Profile → User' })).toBeInTheDocument();
        expect(within(body).getByText(/No ORM relationship attribute is declared for it/)).toHaveTextContent('Even high confidence never means one exists.');
        expect(within(body).getByText('high confidence')).toBeInTheDocument();
        expect(within(body).getByText('one-to-one')).toBeInTheDocument();
        const evidence = body.querySelector('.evidence-list') as HTMLElement;
        expect(within(evidence).getByText('Unique constraint').closest('li')).toHaveTextContent('public.profiles · profiles_user_id_key');
        expect(within(evidence).getAllByText('confirmed')).toHaveLength(4);
        fireEvent.click(within(body).getByRole('button', { name: /profiles_user_id_fkey/ }));
        expect(within(panel()).getByText('FOREIGN-KEY CONSTRAINT')).toBeInTheDocument();
        expect(within(panel()).getByRole('heading', { name: 'Inferred association' })).toBeInTheDocument();
    });

    it('marks unconfirmed evidence and ambiguities', async () => {
        await show(fixture('inferred-associations'));
        fireEvent.click(within(panel()).getByRole('radio', { name: 'Inferred' }));
        fireEvent.click([...panel().querySelectorAll<HTMLElement>('.browse__row')].find((r) => r.textContent?.includes('User → Team')) as HTMLElement);
        expect(within(panel()).getByText('unconfirmed')).toBeInTheDocument();
        expect(within(panel()).getByText('medium confidence')).toBeInTheDocument();
        press('a');
        fireEvent.click([...panel().querySelectorAll<HTMLElement>('.browse__row')].find((r) => r.textContent?.includes('Invoice → Account')) as HTMLElement);
        expect(within(panel()).getByText('multiple_models')).toBeInTheDocument();
    });

    // The edges themselves are checked in the browser tests: jsdom does not lay out React Flow's edges.
    it('turns the inferred marks on the foreign-key edges off from the Relationships menu and with 5', async () => {
        await show(fixture('inferred-associations'));
        fireEvent.click(screen.getByRole('button', { name: 'Relationships' }));
        const item = () => screen.getByRole('menuitemcheckbox', { name: /Inferred associations/ });
        expect(item()).toHaveAttribute('aria-checked', 'true');
        expect(item()).toHaveTextContent('never a new line');
        press('5');
        expect(item()).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(item());
        expect(item()).toHaveAttribute('aria-checked', 'true');
    });

    it('lists a table’s inferred associations in Details and in the legend', async () => {
        await show(fixture('combined-eloquent'));
        openTab('Details');
        expect(within(panel()).getByText(/Foreign key with an inferred association/)).toBeInTheDocument();
        fireEvent.click(within(panel()).getByRole('button', { name: '1 inferred association' }));
        expect(within(panel()).getByRole('radio', { name: 'Inferred' })).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(within(panel()).getByRole('radio', { name: 'Tables & Models' }));
        fireEvent.click([...panel().querySelectorAll<HTMLElement>('.browse__row')].find((r) => r.querySelector('.browse__title')?.firstChild?.textContent === 'users') as HTMLElement);
        const section = within(panel()).getByText('Inferred associations').closest('details') as HTMLElement;
        expect(section).toHaveTextContent('User → Country');
        expect(section).toHaveTextContent('inferred · heuristic');
        fireEvent.click(within(section).getByRole('button', { name: 'User → Country' }));
        expect(within(panel()).getByText('INFERRED ASSOCIATION · HEURISTIC')).toBeInTheDocument();
    });

    it('keeps the selected inferred association in the URL', async () => {
        const doc = fixture('inferred-associations');
        const a = doc.inferredAssociations[1];
        history.replaceState(null, '', `/#inferred=${a.id}`);
        await show(doc, { deepLinks: true });
        expect(within(panel()).getByRole('heading', { name: 'User → Team' })).toBeInTheDocument();
        expect(location.hash).toBe(`#inferred=${a.id}`);
    });
});
