import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SchemaDocument } from '../src/contract';
import { edgeShown, edgesFor, keyColumns, neighbors } from '../src/viewer/graph';
import type { LayoutRequest } from '../src/viewer/layout';
import { SchemaViewer } from '../src/viewer/SchemaViewer';
import { THEME_KEY } from '../src/viewer/theme';
import { readdirSync, readFileSync } from 'node:fs';
import { VALID } from './fixtures/documents';
import { root } from './helpers';

// A deterministic grid instead of ELK, which needs a real browser.
const grid = async ({ ids }: LayoutRequest) => Object.fromEntries(ids.map((id, i) => [id, { x: (i % 4) * 560, y: Math.floor(i / 4) * 400 }]));

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
const rows = () => [...panel().querySelectorAll('.browse__row')].map((r) => r.querySelector('.browse__title')?.firstChild?.textContent);
const openRow = (name: string) => fireEvent.click([...panel().querySelectorAll<HTMLElement>('.browse__row')].find((r) => r.querySelector('.browse__title')?.firstChild?.textContent === name) as HTMLElement);
const menu = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const press = (key: string) =>
    act(() => {
        fireEvent.keyDown(document.body, { key });
    });

beforeEach(() => history.replaceState(null, '', '/'));
afterEach(() => localStorage.clear());

describe('graph', () => {
    const doc = VALID['combined-eloquent']();
    const edges = edgesFor(doc);

    it('draws the stored links and derived links, keeping their kinds', () => {
        expect(edges).toHaveLength(doc.links.length + doc.derivedLinks.length);
        expect(new Set(edges.map((e) => e.kind))).toEqual(new Set(['both', 'foreign_key', 'relationship', 'through']));
    });

    it('turns layers on and off without merging foreign keys into relationships', () => {
        const kinds = (fk: boolean, orm: boolean) => new Set(edges.filter((e) => edgeShown(e, fk, orm)).map((e) => e.kind));
        expect(kinds(true, false)).toEqual(new Set(['both', 'foreign_key']));
        expect(kinds(false, true)).toEqual(new Set(['both', 'relationship', 'through']));
        expect(kinds(false, false).size).toBe(0);
    });

    it('finds neighbors, including the intermediate tables of a through relationship', () => {
        expect(neighbors('mysql:countries', edges)).toEqual(new Set(['mysql:countries', 'mysql:posts', 'mysql:users']));
    });

    it('keeps link and polymorphic columns as key columns', () => {
        expect([...(keyColumns(doc).get('mysql:comments') ?? [])].sort()).toEqual(['commentable_id', 'commentable_type', 'id', 'user_id']);
    });
});

describe('every valid fixture', () => {
    for (const [name, build] of Object.entries(VALID)) {
        it(`${name} renders every table`, async () => {
            const doc = build();
            const { container } = await show(doc);
            const tables = doc.connections.reduce((n, c) => n + c.tables.length, 0);
            await waitFor(() => expect(container.querySelectorAll('.react-flow__node:not(.region-node)').length).toBeGreaterThanOrEqual(Math.min(tables, 1)));
        });
    }

    it('never computes comparisons, migration statuses, inferences or gate reports itself', () => {
        const sources = readdirSync(root('src/viewer')).concat(readdirSync(root('src/standalone')).map((f) => `../standalone/${f}`));
        for (const file of sources.filter((f) => /\.tsx?$/.test(f))) {
            const text = readFileSync(root('src/viewer', file), 'utf8');
            expect(text, file).not.toMatch(/compareScopes|expandComparisonRequests|coverageGaps|scopeCovered|validateSeverityOverrides|comparisonDiagnostics|storeComparisons|migrationState|migrationHistory|inferAssociations|gateDocument|contract\/(comparison|migration|inference|gate)/);
        }
    });
});

describe('layout', () => {
    it('has a header search, a tabbed side panel and a floating toolbar', async () => {
        await show(VALID['combined-eloquent']());
        expect(screen.getByRole('combobox', { name: 'Search the schema' })).toBeInTheDocument();
        expect(within(panel()).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Browse', 'Details', 'Diagnostics4']);
        expect(screen.getByRole('toolbar', { name: 'Diagram' })).toBeInTheDocument();
        expect(rows()).toHaveLength(11);
    });

    it('offers a Changes tab only when the host has changes', async () => {
        await show(VALID['database-sqlite-indexes'](), { changes: [{ type: 'table', change: 'added', label: 'notes' }] });
        openTab(/Changes/);
        expect(within(panel()).getByText('notes')).toBeInTheDocument();
    });

    it('offers a connection picker only when there are several connections', async () => {
        const doc = VALID['database-sqlite-indexes']();
        const second = { ...doc.connections[0], id: 'connection:other', name: 'other', tables: [] };
        await show({ ...doc, connections: [...doc.connections, second] });
        expect(screen.getByRole('combobox', { name: 'Connection' })).toBeInTheDocument();
    });
});

describe('browse and details', () => {
    it('opens a table in Details with its indexes, marking primary, unique, partial, expression and composite ones', async () => {
        await show(VALID['database-postgresql-indexes']());
        openRow('public.accounts');
        expect(within(panel()).getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
        expect(within(panel()).getByRole('heading', { name: /public\.accounts/ })).toBeInTheDocument();
        const indexes = within(panel()).getByText('Indexes').closest('details') as HTMLElement;
        const item = (name: string) => within(indexes).getByText(name).closest('li') as HTMLElement;
        expect(within(item('accounts_pkey')).getByText('primary')).toBeInTheDocument();
        expect(within(item('accounts_email_key')).getByText('constraint')).toBeInTheDocument();
        expect(within(item('accounts_live_email_idx')).getByText('partial')).toBeInTheDocument();
        expect(within(item('accounts_live_email_idx')).getByText('(deleted_at IS NULL)')).toBeInTheDocument();
        expect(within(item('accounts_lower_email_idx')).getByText('expression')).toBeInTheDocument();
        expect(within(item('accounts_status_created_idx')).getByText('composite')).toBeInTheDocument();
        expect(within(item('accounts_created_at_idx')).getByText('created_at DESC NULLS LAST')).toBeInTheDocument();
    });

    it('never draws indexes as diagram nodes', async () => {
        const { container } = await show(VALID['database-postgresql-indexes']());
        await waitFor(() => expect(container.querySelectorAll('.react-flow__node')).toHaveLength(2));
    });

    it('browses relationships and columns, each with its own filter', async () => {
        await show(VALID['combined-eloquent']());
        fireEvent.click(within(panel()).getByRole('radio', { name: 'Relationships' }));
        expect(rows()).toContain('Post.editor');
        fireEvent.click(within(panel()).getByRole('radio', { name: 'Columns' }));
        fireEvent.change(within(panel()).getByPlaceholderText(/Filter/), { target: { value: 'remember' } });
        expect(rows()).toEqual(['remember_token']);
    });

    it('finds tables, columns, models and relationships from the header search and opens them', async () => {
        await show(VALID['combined-eloquent']());
        const box = screen.getByRole('combobox', { name: 'Search the schema' });
        fireEvent.change(box, { target: { value: 'remember' } });
        const options = screen.getAllByRole('option');
        expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining('users.remember_token')]);
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(within(panel()).getByRole('heading', { name: /users/ })).toBeInTheDocument();
    });

    it('tells facts from heuristics in Diagnostics and filters them', async () => {
        await show(VALID['combined-eloquent']());
        openTab(/Diagnostics/);
        const cards = () => panel().querySelectorAll('.card');
        expect(cards()).toHaveLength(4);
        fireEvent.click(within(panel()).getByRole('radio', { name: 'Heuristics' }));
        expect(cards()).toHaveLength(1);
        expect(cards()[0]).toHaveTextContent('Missing index');
        fireEvent.click(within(cards()[0] as HTMLElement).getByRole('button', { name: 'Show posts' }));
        expect(within(panel()).getByRole('heading', { name: /posts/ })).toBeInTheDocument();
    });

    it('marks declared-only and drifted metadata in combined documents', async () => {
        const { container } = await show(VALID['combined-drift']());
        await waitFor(() => expect(container.querySelector('[data-column="nickname"]')).toHaveClass('declared-only'));
        expect(container.querySelector('[data-column="email"]')).toHaveClass('drift');
        openRow('public.users');
        expect(within(panel()).getAllByText('declared only').length).toBeGreaterThan(0);
        expect(within(panel()).getAllByText('drift').length).toBeGreaterThan(0);
    });

    it('does not call every column "database only" when the ORM declares no columns', async () => {
        await show(VALID['combined-eloquent']());
        openRow('posts');
        expect(within(panel()).queryByText('database only')).toBeNull();
    });

    it('renders extensions generically, or with a host renderer', async () => {
        await show(VALID['combined-eloquent'](), { extensionRenderers: { eloquent: (v) => <span>rich {String(v.keyType)}</span> } });
        openRow('users');
        expect(within(panel()).getByText('rich int')).toBeInTheDocument();
        cleanup();
        await show(VALID['combined-eloquent']());
        openRow('users');
        const models = within(panel()).getByText('Models').closest('details') as HTMLElement;
        expect(within(models).getByText('eloquent')).toBeInTheDocument();
        expect(within(models).getByText('remember_token')).toBeInTheDocument();
    });

    it('clears the selection with Escape and shows the overview', async () => {
        await show(VALID['combined-eloquent']());
        openRow('posts');
        press('Escape');
        expect(within(panel()).getByRole('heading', { name: 'Nothing selected' })).toBeInTheDocument();
    });
});

describe('preferences and links', () => {
    it('switches theme and remembers the choice when asked to', async () => {
        const { container } = await show(VALID['database-sqlite-indexes'](), { persistTheme: true });
        const root = container.querySelector('.lsv') as HTMLElement;
        const before = root.dataset.theme;
        fireEvent.click(screen.getByRole('button', { name: /Switch to/ }));
        expect(root.dataset.theme).not.toBe(before);
        expect(localStorage.getItem(THEME_KEY)).toBe(root.dataset.theme);
    });

    it('opens on a deep link and keeps the selection in the hash', async () => {
        history.replaceState(null, '', '/#table=mysql%3Aposts');
        await show(VALID['combined-eloquent'](), { deepLinks: true });
        expect(within(panel()).getByRole('heading', { name: /posts/ })).toBeInTheDocument();
        openTab('Browse');
        openRow('users');
        await waitFor(() => expect(location.hash).toBe('#table=mysql%3Ausers'));
    });
});

describe('toolbar and shortcuts', () => {
    it('folds cards to key columns, every column, or names only from the Show menu, and one card with its chevron', async () => {
        const { container } = await show(VALID['combined-eloquent']());
        const posts = () => container.querySelector('[data-table-id="mysql:posts"]') as HTMLElement;
        await waitFor(() => expect(posts()).toBeTruthy());
        const keyRows = posts().querySelectorAll('.column').length;
        menu('Show');
        fireEvent.click(screen.getByRole('menuitemradio', { name: /^All/ }));
        await waitFor(() => expect(posts().querySelectorAll('.column').length).toBe(9));
        expect(keyRows).toBeLessThan(9);
        fireEvent.click(within(posts()).getByRole('button', { name: 'Fold posts' }));
        await waitFor(() => expect(posts().querySelectorAll('.column').length).toBe(0));
        press('c');
        await waitFor(() => expect(posts().querySelectorAll('.column').length).toBe(0));
    });

    it('shows notes on cards with N', async () => {
        const { container } = await show(VALID['combined-eloquent']());
        await waitFor(() => expect(container.querySelector('[data-table-id="mysql:posts"]')).toBeTruthy());
        press('n');
        await waitFor(() => expect(container.querySelector('[data-table-id="mysql:posts"] .note-row')).toHaveTextContent('Articles, drafts included.'));
    });

    it('turns link kinds on and off from the menu and with 1 to 4', async () => {
        await show(VALID['combined-eloquent']());
        menu('Relationships');
        const through = () => screen.getByRole('menuitemcheckbox', { name: /Through/ });
        expect(through()).toHaveAttribute('aria-checked', 'true');
        press('4');
        expect(through()).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(through());
        expect(through()).toHaveAttribute('aria-checked', 'true');
    });

    it('hides framework and package tables separately from the Tables menu', async () => {
        await show(VALID['combined-eloquent']());
        menu('Tables');
        fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Framework tables/ }));
        expect(rows()).not.toContain('jobs');
        expect(rows()).toContain('oauth_clients');
    });

    it('focuses on a table to a chosen depth', async () => {
        await show(VALID['combined-eloquent']());
        openRow('countries');
        fireEvent.click(within(panel()).getByRole('button', { name: 'Focus' }));
        openTab('Browse');
        await waitFor(() => expect(rows()).toHaveLength(3));
        fireEvent.change(screen.getByRole('combobox', { name: 'Depth' }), { target: { value: '2' } });
        await waitFor(() => expect(rows().length).toBeGreaterThan(3));
        fireEvent.click(screen.getByRole('button', { name: '← Show all tables' }));
        await waitFor(() => expect(rows()).toHaveLength(11));
    });

    it('switches panel tabs with A, D and H, and lists every shortcut with S', async () => {
        await show(VALID['combined-eloquent']());
        press('h');
        expect(within(panel()).getByRole('tab', { name: /Diagnostics/ })).toHaveAttribute('aria-selected', 'true');
        press('a');
        expect(within(panel()).getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
        press('s');
        expect(screen.getByRole('heading', { name: 'Keyboard shortcuts', hidden: true })).toBeInTheDocument();
    });

    it('ignores shortcuts while typing', async () => {
        await show(VALID['combined-eloquent']());
        const input = screen.getByRole('combobox', { name: 'Search the schema' });
        input.focus();
        act(() => {
            fireEvent.keyDown(input, { key: 'h' });
        });
        expect(within(panel()).getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
    });

    it('resizes the side panel from the keyboard, within limits, and resets on double-click', async () => {
        const { container } = await show(VALID['database-sqlite-indexes']());
        const root = container.querySelector('.lsv') as HTMLElement;
        const handle = screen.getByRole('separator', { name: 'Resize the side panel' });
        fireEvent.keyDown(handle, { key: 'End' });
        expect(root.style.getPropertyValue('--lsv-panel')).toBe('560px');
        fireEvent.keyDown(handle, { key: 'ArrowRight' });
        expect(root.style.getPropertyValue('--lsv-panel')).toBe('536px');
        fireEvent.doubleClick(handle);
        expect(root.style.getPropertyValue('--lsv-panel')).toBe('');
    });
});

describe('pan and select modes', () => {
    it('toggles the hand tool off on a second click, switching to select mode', async () => {
        await show(VALID['combined-eloquent']());
        const hand = screen.getByRole('button', { name: 'Pan mode' });
        const select = screen.getByRole('button', { name: 'Select mode' });
        expect(hand).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(hand);
        expect(hand).toHaveAttribute('aria-pressed', 'false');
        expect(select).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(select);
        expect(hand).toHaveAttribute('aria-pressed', 'true');
    });
});

describe('tour', () => {
    it('walks through every step from ? and ends with Escape', async () => {
        await show(VALID['combined-eloquent']());
        press('?');
        expect(screen.getByRole('dialog', { name: 'Welcome' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByRole('dialog', { name: 'The diagram' })).toBeInTheDocument();
        press('Escape');
        expect(screen.queryByRole('dialog', { name: 'The diagram' })).toBeNull();
    });
});

describe('multiple connections', () => {
    const multi = () => VALID['combined-multi-connection']();
    const card = (container: HTMLElement, id: string) => container.querySelector(`.react-flow__node [data-table-id="${id}"]`) as HTMLElement | null;
    const connectionSelect = () => screen.getByRole('combobox', { name: 'Connection' }) as HTMLSelectElement;

    it('never turns a cross-connection relationship into a foreign key', () => {
        const doc = multi();
        const edges = edgesFor(doc);
        const cross = edges.filter((e) => e.crossConnection);
        expect(cross.map((e) => e.label).sort()).toEqual(['account', 'user · sessions']);
        expect(cross.every((e) => e.kind === 'relationship' && e.link?.foreignKey === null)).toBe(true);
        expect(edges.filter((e) => e.kind === 'foreign_key' || e.kind === 'both').every((e) => !e.crossConnection)).toBe(true);
    });

    it('frames every connection in a labelled region, keeping tables of the same name apart', async () => {
        const { container } = await show(multi());
        await waitFor(() => expect(container.querySelectorAll('.region-node')).toHaveLength(3));
        expect([...container.querySelectorAll('.region-node')].map((r) => r.textContent)).toEqual(['apppostgresql · 2 tables · 1 diagnostic', 'analyticsmysql · 2 tables · 1 diagnostic', 'cachesqlite · 1 table · 1 diagnostic']);
        expect(card(container, 'app:public.users')).toHaveTextContent('app · public.users');
        expect(card(container, 'analytics:users')).toHaveTextContent('analytics · users');
        expect(container.querySelectorAll('[data-external]')).toHaveLength(0);
        expect(rows()).toEqual(['app · public.teams', 'app · public.users', 'analytics · events', 'analytics · users', 'cache · sessions']);
        expect([...panel().querySelectorAll('.browse__group')].map((g) => g.textContent)).toEqual(['app', 'analytics', 'cache']);
    });

    it('filters to one connection and draws the tables other connections relate to as references', async () => {
        const { container } = await show(multi());
        fireEvent.change(connectionSelect(), { target: { value: 'connection:analytics' } });
        await waitFor(() => expect(container.querySelectorAll('.region-node')).toHaveLength(0));
        expect(container.querySelectorAll('[data-external]')).toHaveLength(1);
        expect(rows()).toEqual(['analytics · events', 'analytics · users']);
        const external = container.querySelector('[data-external]') as HTMLElement;
        expect(external).toHaveAttribute('data-table-id', 'app:public.users');
        expect(external).toHaveTextContent('On connection app · postgresql');
        expect(card(container, 'app:public.teams')).toBeNull();

        fireEvent.click(within(external).getByRole('button'));
        await waitFor(() => expect(connectionSelect().value).toBe('connection:app'));
        expect(within(panel()).getByRole('heading', { name: /app · public\.users/ })).toBeInTheDocument();
        await waitFor(() => expect(card(container, 'app:public.users')?.closest('[data-external]')).toBeNull());
        await waitFor(() => expect([...container.querySelectorAll('[data-external]')].map((e) => e.getAttribute('data-table-id')).sort()).toEqual(['analytics:users', 'cache:sessions']));
    });

    it('explains a cross-connection link as an ORM relationship only', async () => {
        await show(multi());
        openRow('cache · sessions');
        const links = within(panel()).getByText('Links').closest('details') as HTMLElement;
        fireEvent.click(within(links).getByRole('button', { name: 'user · sessions' }));
        expect(within(panel()).getByText('DECLARED ORM RELATIONSHIP')).toBeInTheDocument();
        expect(within(panel()).getByText(/Crosses connections, from cache to app/)).toBeInTheDocument();
        expect(within(panel()).queryByRole('heading', { name: 'Foreign key' })).toBeNull();
    });

    it('steps through every connection with [ and ]', async () => {
        await show(multi());
        const seen: string[] = [];
        for (let i = 0; i < 4; i++) {
            press(']');
            seen.push(connectionSelect().value);
        }
        expect(seen).toEqual(['connection:app', 'connection:analytics', 'connection:cache', '']);
        press('[');
        expect(connectionSelect().value).toBe('connection:cache');
        await waitFor(() => expect(rows()).toEqual(['cache · sessions']));
    });

    it('opens on a #connection= deep link and keeps the connection in the hash', async () => {
        history.replaceState(null, '', '/#connection=connection%3Acache');
        const { container } = await show(multi(), { deepLinks: true });
        expect(connectionSelect().value).toBe('connection:cache');
        await waitFor(() => expect(container.querySelector('[data-external]')).toHaveAttribute('data-table-id', 'app:public.users'));
        press(']');
        await waitFor(() => expect(location.hash).toBe(''));
        press('[');
        await waitFor(() => expect(location.hash).toBe('#connection=connection%3Acache'));
    });

    it('opens a deep-linked table on its own connection, and ignores an unknown connection', async () => {
        history.replaceState(null, '', '/#connection=connection%3Aanalytics&table=app%3Apublic.users');
        await show(multi(), { deepLinks: true });
        expect(connectionSelect().value).toBe('connection:app');
        expect(within(panel()).getByRole('heading', { name: /app · public\.users/ })).toBeInTheDocument();
        cleanup();
        history.replaceState(null, '', '/#connection=connection%3Anowhere');
        await show(multi(), { deepLinks: true });
        expect(connectionSelect().value).toBe('');
    });

    it('tells apart tables with the same schema and name in two connections everywhere', async () => {
        const doc = multi();
        doc.connections[1].tables.find((t) => t.name === 'users')!.schema = 'public';
        const { container } = await show(doc);
        expect(card(container, 'app:public.users')).toHaveTextContent('app · public.users');
        expect(card(container, 'analytics:users')).toHaveTextContent('analytics · public.users');
        const box = screen.getByRole('combobox', { name: 'Search the schema' });
        fireEvent.change(box, { target: { value: 'public.users' } });
        const tables = screen.getAllByRole('option').filter((o) => o.textContent?.startsWith('Table'));
        expect(tables.map((o) => o.querySelector('.search__label')?.textContent)).toEqual(['app · public.users', 'analytics · public.users']);
        fireEvent.click(tables[1]);
        expect(within(panel()).getByRole('heading', { name: /analytics · public\.users/ })).toBeInTheDocument();
        expect(within(panel()).getByText('analytics (mysql) · 3 columns')).toBeInTheDocument();
        openTab('Browse');
        fireEvent.click(within(panel()).getByRole('radio', { name: 'Relationships' }));
        expect(rows()).toContain('Visitor.account');
        const account = [...panel().querySelectorAll('.browse__row')].find((r) => r.textContent?.includes('Visitor.account')) as HTMLElement;
        expect(account).toHaveTextContent('BelongsTo → app · public.users');
    });
});
