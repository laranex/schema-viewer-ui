import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SchemaDocument } from '../src/contract';
import { editorHref } from '../src/viewer/Details';
import { frameAround, type LayoutRequest } from '../src/viewer/layout';
import { SchemaViewer } from '../src/viewer/SchemaViewer';
import { CARD_WIDTH, diagnosticScope, lookup } from '../src/viewer/graph';
import { Ident } from '../src/viewer/ui';
import { VALID } from './fixtures/documents';
import { root } from './helpers';

// Behaviour brought to parity with Laranex Laravel Schema Viewer: wrapping, tabs, editor links, deep links, layout.

const grid = async ({ ids }: LayoutRequest) => Object.fromEntries(ids.map((id, i) => [id, { x: (i % 4) * 560, y: Math.floor(i / 4) * 400 }]));
const fixture = (name: string): SchemaDocument => JSON.parse(readFileSync(root('contract/fixtures/valid', `${name}.json`), 'utf8'));

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

beforeEach(() => history.replaceState(null, '', '/'));

describe('editor links', () => {
    const source = { file: 'app/Models/Post Tag.php', line: 12 };

    it('keeps the path’s slashes and encodes only what a URL cannot carry', () => {
        expect(editorHref('vscode://file/{file}:{line}', source)).toBe('vscode://file/app/Models/Post%20Tag.php:12');
        expect(editorHref('phpstorm://open?file=/srv/{file}&line={line}', { file: 'a.php', line: null })).toBe('phpstorm://open?file=/srv/a.php&line=1');
    });

    it('refuses templates with a scheme that runs code or embeds content', () => {
        for (const editor of ['javascript:alert({file})', ' JavaScript:x', '\u0001data:text/html,{file}', 'vbscript:x', 'blob:x', 'file:///{file}']) {
            expect(editorHref(editor, source)).toBeNull();
        }
        expect(editorHref(null, source)).toBeNull();
    });
});

describe('wrapping long identifiers', () => {
    it('offers a line break after each separator and keeps the text whole', () => {
        const { container } = render(
            <code>
                <Ident text="tenant_a.invoices" />
            </code>,
        );
        expect(container.textContent).toBe('tenant_a.invoices');
        expect(container.querySelectorAll('wbr')).toHaveLength(2);
    });
});

describe('panel tabs', () => {
    it('labels every tab and moves across all of them with the arrow keys, Home and End', async () => {
        await show(fixture('comparison-tenant-schemas'));
        const tabs = within(panel()).getAllByRole('tab');
        expect(tabs.map((t) => t.textContent)).toEqual(['Browse', 'Details', 'Diagnostics', 'Compare', 'Migrations']);
        tabs[0].focus();
        fireEvent.keyDown(tabs[0], { key: 'End' });
        expect(within(panel()).getByRole('tab', { name: 'Migrations' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
        expect(within(panel()).getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
        expect(within(panel()).getByRole('tab', { name: 'Migrations' })).toHaveAttribute('aria-selected', 'true');
    });
});

describe('compare filters in deep links', () => {
    it('opens with the filters of the link and writes them back to the hash', async () => {
        history.replaceState(null, '', '/#view=compare&change=missing&certainty=certain&severity=nonsense');
        await show(fixture('comparison-tenant-schemas'), { deepLinks: true });
        const body = panel();
        expect(within(body).getByRole('combobox', { name: 'Change' })).toHaveValue('missing');
        expect(within(body).getByRole('combobox', { name: 'Certainty' })).toHaveValue('certain');
        expect(within(body).getByRole('combobox', { name: 'Severity' })).toHaveValue('');
        await waitFor(() => expect(location.hash).toContain('change=missing'));
        expect(location.hash).not.toContain('severity');
        fireEvent.change(within(body).getByRole('combobox', { name: 'Object' }), { target: { value: 'table' } });
        await waitFor(() => expect(location.hash).toContain('object=table'));
        fireEvent.click(within(body).getByRole('button', { name: 'Clear filters' }));
        await waitFor(() => expect(location.hash).not.toMatch(/object=|change=|certainty=/));
    });
});

describe('layout stability', () => {
    it('keeps every position when one card folds, and arranges again when every card folds', async () => {
        let runs = 0;
        const counted = async (request: LayoutRequest) => (runs++, grid(request));
        const { container } = await show(VALID['combined-eloquent'](), { layout: counted });
        const posts = () => container.querySelector('[data-table-id="mysql:posts"]') as HTMLElement;
        await waitFor(() => expect(posts()).toBeTruthy());
        const before = runs;
        fireEvent.click(within(posts()).getByRole('button', { name: 'Fold posts' }));
        await waitFor(() => expect(posts().querySelectorAll('.column').length).toBe(0));
        expect(runs).toBe(before);
        fireEvent.click(screen.getByRole('button', { name: 'Show' }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: /^All/ }));
        await waitFor(() => expect(runs).toBe(before + 1));
    });

    it('frames a connection around its cards wherever they are, never narrower than its label', () => {
        const frame = frameAround('app', [
            { x: 100, y: 200, height: 120 },
            { x: 900, y: 700, height: 80 },
        ]);
        expect(frame).toEqual({ connection: 'app', x: 52, y: 88, width: 900 + CARD_WIDTH - 100 + 96, height: 780 - 200 + 64 + 96 });
        expect(frameAround('app', [{ x: 0, y: 0, height: 40 }]).width).toBeGreaterThanOrEqual(240);
    });
});

describe('diagnostics per connection', () => {
    // The multi-connection fixture, plus one diagnostic about the whole document.
    const multi = (): SchemaDocument => {
        const doc = VALID['combined-multi-connection']();
        const [first] = doc.diagnostics;
        return { ...doc, diagnostics: [...doc.diagnostics, { ...first, id: 'n-document', kind: 'inspection_unavailable', category: 'inspection', subject: { type: 'document', id: null, columns: null, label: null }, message: 'About the whole document.' }] };
    };

    it('finds the connections each diagnostic concerns from its subject', () => {
        const doc = multi();
        const scope = diagnosticScope(doc, lookup(doc));
        expect(doc.diagnostics.map((d) => scope.connectionsOf(d))).toEqual([['connection:app'], ['connection:analytics'], ['connection:cache'], []]);
        expect(scope.tableOf(doc.diagnostics[2])).toBe('cache:sessions');
    });

    it('counts and lists the diagnostics of the connection in view, keeping the document’s', async () => {
        const { container } = await show(multi());
        const tab = () => within(panel()).getByRole('tab', { name: /Diagnostics/ });
        expect(tab()).toHaveTextContent('Diagnostics4');
        await waitFor(() => expect(container.querySelectorAll('.region-node')).toHaveLength(3));
        expect([...container.querySelectorAll('.region-node__meta')].map((m) => m.textContent)).toEqual(['postgresql · 2 tables · 1 diagnostic', 'mysql · 2 tables · 1 diagnostic', 'sqlite · 1 table · 1 diagnostic']);
        fireEvent.change(screen.getByRole('combobox', { name: 'Connection' }), { target: { value: 'connection:analytics' } });
        await waitFor(() => expect(tab()).toHaveTextContent('Diagnostics2'));
        fireEvent.click(tab());
        expect(panel().querySelector('.diagnostics-scope')).toHaveTextContent('Connection analytics and the whole document; 2 more on other connections.');
        const cards = [...panel().querySelectorAll('.cards > li')];
        expect(cards.map((c) => c.querySelector('strong')?.textContent)).toEqual(['Metadata not supported', 'Inspection unavailable']);
        expect(cards[1].querySelector('.card__eyebrow')).toHaveTextContent('whole document');
    });

    it('shows a diagnostic’s extensions', async () => {
        const doc = multi();
        doc.diagnostics[0] = { ...doc.diagnostics[0], extensions: { laravel: { ignore: 'users.legacy' } } };
        await show(doc, { extensionRenderers: { laravel: (v) => <p>Ignore with {String(v.ignore)}</p> } });
        fireEvent.click(within(panel()).getByRole('tab', { name: /Diagnostics/ }));
        expect(within(panel()).getByText('Ignore with users.legacy')).toBeInTheDocument();
    });
});
