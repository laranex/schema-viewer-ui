import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SchemaDocument } from '../src/contract';
import { edgeShown, edgesFor, keyColumns, neighbors } from '../src/viewer/graph';
import type { LayoutRequest } from '../src/viewer/layout';
import { SchemaViewer } from '../src/viewer/SchemaViewer';
import { THEME_KEY } from '../src/viewer/theme';
import { VALID } from './fixtures/documents';

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

const details = () => screen.getByRole('complementary', { name: 'Selection details' });
const tableList = () => screen.getByRole('complementary', { name: 'Tables' });

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

describe('SchemaViewer', () => {
    it('lists every table and labels the source mode', async () => {
        await show(VALID['combined-eloquent']());
        expect(within(tableList()).getAllByRole('button')).toHaveLength(11);
        expect(screen.getByText('database + declared metadata · read-only')).toBeInTheDocument();
        expect(screen.getByText(/Saved snapshot · combined · 7 models · 4 diagnostics/)).toBeInTheDocument();
    });

    it('shows a table with its indexes, marking primary, unique, partial, expression and composite ones', async () => {
        await show(VALID['database-postgresql-indexes']());
        fireEvent.click(within(tableList()).getByText('public.accounts'));
        const panel = details();
        expect(within(panel).getByRole('heading', { name: 'public.accounts' })).toBeInTheDocument();
        const indexes = within(panel).getByText('Indexes').closest('details') as HTMLElement;
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
        expect(container.querySelectorAll('.react-flow__node[data-id*="index"]')).toHaveLength(0);
    });

    it('filters the table list by search, including column and model names', async () => {
        await show(VALID['combined-eloquent']());
        fireEvent.change(screen.getByPlaceholderText('Search schema…'), { target: { value: 'remember_token' } });
        expect(within(tableList()).getAllByRole('button').map((b) => b.firstChild?.textContent)).toEqual(['users']);
        fireEvent.change(screen.getByPlaceholderText('Search schema…'), { target: { value: 'nothing-matches' } });
        expect(screen.getByText('No matching tables')).toBeInTheDocument();
    });

    it('tells facts from heuristics in diagnostics', async () => {
        await show(VALID['combined-eloquent']());
        const panel = details();
        expect(within(panel).getAllByText('fact').length).toBeGreaterThan(0);
        expect(within(panel).getAllByText('heuristic')).toHaveLength(1);
    });

    it('marks declared-only and drifted metadata in combined documents', async () => {
        const { container } = await show(VALID['combined-drift']());
        await waitFor(() => expect(container.querySelector('[data-column="nickname"]')).toHaveClass('declared-only'));
        expect(container.querySelector('[data-column="email"]')).toHaveClass('drift');
        fireEvent.click(within(tableList()).getByText('public.users'));
        expect(within(details()).getAllByText('declared only').length).toBeGreaterThan(0);
        expect(within(details()).getAllByText('drift').length).toBeGreaterThan(0);
    });

    it('renders extensions generically', async () => {
        await show(VALID['combined-eloquent']());
        fireEvent.click(within(tableList()).getByText('users'));
        const models = within(details()).getByText('Models').closest('details') as HTMLElement;
        expect(within(models).getByText('eloquent')).toBeInTheDocument();
        expect(within(models).getByText('remember_token')).toBeInTheDocument();
    });

    it('uses a host renderer for a known extension namespace', async () => {
        await show(VALID['combined-eloquent'](), { extensionRenderers: { eloquent: (v) => <span>rich {String(v.keyType)}</span> } });
        fireEvent.click(within(tableList()).getByText('users'));
        expect(within(details()).getByText('rich int')).toBeInTheDocument();
    });

    it('clears the selection with Escape', async () => {
        await show(VALID['combined-eloquent']());
        fireEvent.click(within(tableList()).getByText('posts'));
        expect(within(details()).getByText('TABLE')).toBeInTheDocument();
        act(() => {
            fireEvent.keyDown(document.body, { key: 'Escape' });
        });
        expect(within(details()).getByText('GUIDE')).toBeInTheDocument();
    });

    it('switches theme and remembers the choice when asked to', async () => {
        const { container } = await show(VALID['database-sqlite-indexes'](), { persistTheme: true, theme: undefined });
        const root = container.querySelector('.lsv') as HTMLElement;
        const before = root.dataset.theme;
        fireEvent.click(screen.getByRole('button', { name: /Switch to/ }));
        expect(root.dataset.theme).not.toBe(before);
        expect(localStorage.getItem(THEME_KEY)).toBe(root.dataset.theme);
    });

    it('opens on a deep link and keeps the selection in the hash', async () => {
        history.replaceState(null, '', '/#table=mysql%3Aposts');
        await show(VALID['combined-eloquent'](), { deepLinks: true });
        expect(within(details()).getByRole('heading', { name: 'posts' })).toBeInTheDocument();
        fireEvent.click(within(tableList()).getByText('users'));
        await waitFor(() => expect(location.hash).toBe('#table=mysql%3Ausers'));
    });

    it('offers a connection filter only when there are several connections', async () => {
        const doc = VALID['database-sqlite-indexes']();
        const second = { ...doc.connections[0], id: 'connection:other', name: 'other', tables: [] };
        await show({ ...doc, connections: [...doc.connections, second] });
        expect(screen.getByRole('combobox', { name: /Connection/ })).toBeInTheDocument();
    });
});
