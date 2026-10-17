import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchemaDocument } from '../src/contract';
import { dbml, mermaid } from '../src/export';
import type { LayoutRequest } from '../src/viewer/layout';
import { SchemaViewer } from '../src/viewer/SchemaViewer';
import { VALID } from './fixtures/documents';

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

// Every file the viewer saves: its name and its contents.
let saved: { name: string; blob: Blob }[] = [];
beforeEach(() => {
    saved = [];
    const blobs = new Map<string, Blob>();
    URL.createObjectURL = vi.fn((blob: Blob) => {
        const url = `blob:test/${blobs.size}`;
        blobs.set(url, blob);
        return url;
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        saved.push({ name: this.download, blob: blobs.get(this.href) as Blob });
    });
    history.replaceState(null, '', '/');
});
afterEach(() => vi.restoreAllMocks());

const dialog = () => screen.getByRole('dialog', { name: 'Download' });
const openDialog = () => fireEvent.click(screen.getByRole('button', { name: 'Download' }));

describe('the Download dialog', { timeout: 60_000 }, () => {
    it('opens from the toolbar and from E, and closes with Escape and its close button', async () => {
        await show(VALID['combined-eloquent']());
        openDialog();
        expect(within(dialog()).getByRole('heading', { name: 'Download' })).toBeInTheDocument();
        fireEvent.keyDown(dialog(), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Download' })).toBeNull());
        act(() => {
            fireEvent.keyDown(document.body, { key: 'e' });
        });
        expect(dialog()).toBeInTheDocument();
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Download' })).toBeNull());
    });

    it('previews each format with its file name, warnings, copy and download', async () => {
        const doc = VALID['combined-drift']();
        await show(doc);
        openDialog();
        const d = dialog();
        expect(within(d).queryByRole('combobox', { name: 'Connection' })).toBeNull();
        const formats = within(d).getByRole('radiogroup', { name: /Database schema of/ });
        expect(within(formats).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['mermaid', 'dbml', 'markdown', 'json']);
        expect(within(d).getByLabelText('Preview of schema-default.mmd').textContent).toBe(mermaid.export(doc).content);

        fireEvent.click(within(formats).getByRole('radio', { name: /DBML/ }));
        const preview = within(d).getByLabelText('Preview of schema-default.dbml');
        expect(preview.textContent).toBe(dbml.export(doc).content);
        expect(preview.textContent).not.toContain('fk_users_team');
        const notes = within(d).getByText(/conversion notes/).closest('details') as HTMLElement;
        expect(within(notes).getByText(/Foreign key fk_users_team .* declared only by the ORM/)).toBeInTheDocument();

        const writeText = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        fireEvent.click(within(d).getByRole('button', { name: 'Copy' }));
        expect(writeText).toHaveBeenCalledWith(dbml.export(doc).content);
        await waitFor(() => expect(within(d).getByRole('status')).toHaveTextContent('Copied DBML to the clipboard.'));

        fireEvent.click(within(d).getByRole('button', { name: 'Download schema-default.dbml' }));
        expect(saved.map((s) => s.name)).toEqual(['schema-default.dbml']);
        expect(await saved[0].blob.text()).toBe(dbml.export(doc).content);
        expect(saved[0].blob.type).toBe('text/plain;charset=utf-8');
    });

    it('chooses the connection, opening on the selected table’s, and names files after it', async () => {
        const doc = VALID['combined-multi-connection']();
        await show(doc);
        const analytics = [...document.querySelectorAll<HTMLElement>('.browse__row')].find((r) => r.textContent?.includes('events')) as HTMLElement;
        fireEvent.click(analytics);
        openDialog();
        const select = within(dialog()).getByRole('combobox', { name: 'Connection' }) as HTMLSelectElement;
        expect(select.value).toBe('connection:analytics');
        expect([...select.options].map((o) => o.textContent)).toEqual(['app · 2 tables', 'analytics · 2 tables', 'cache · 1 table']);
        fireEvent.change(select, { target: { value: 'connection:cache' } });
        fireEvent.click(within(dialog()).getByRole('radio', { name: /JSON/ }));
        fireEvent.click(within(dialog()).getByRole('button', { name: 'Download schema-cache.json' }));
        const written = JSON.parse(await saved[0].blob.text());
        expect(written.connections.map((c: { id: string }) => c.id)).toEqual(['connection:cache']);
        expect(within(dialog()).getByText(/Relationship App\\Models\\Session::user reaches connection app/)).toBeInTheDocument();
    });

    it('adds labelled ORM relationships to Mermaid only when asked', async () => {
        const doc = VALID['combined-eloquent']();
        await show(doc);
        openDialog();
        const preview = () => within(dialog()).getByLabelText('Preview of schema-mysql.mmd').textContent ?? '';
        expect(preview()).not.toContain('ORM:');
        fireEvent.click(within(dialog()).getByRole('checkbox', { name: /Add ORM relationships/ }));
        expect(preview()).toContain('"ORM: User::posts (HasMany)"');
        fireEvent.click(within(dialog()).getByRole('radio', { name: /DBML/ }));
        expect(within(dialog()).queryByRole('checkbox', { name: /Add ORM relationships/ })).toBeNull();
    });

    it('offers the whole document and the host’s own files beside the built-in formats', async () => {
        const doc = VALID['database-sqlite-indexes']();
        await show(doc, { downloads: [{ label: 'Prisma schema', filename: 'schema.prisma', mediaType: 'text/plain', content: 'model A {}' }] });
        openDialog();
        fireEvent.click(within(dialog()).getByRole('button', { name: /JSON document/ }));
        fireEvent.click(within(dialog()).getByRole('button', { name: /Prisma schema/ }));
        expect(saved.map((s) => s.name)).toEqual(['schema-viewer.json', 'schema.prisma']);
        expect(JSON.parse(await saved[0].blob.text())).toEqual(doc);
        expect(await saved[1].blob.text()).toBe('model A {}');
    });

    it('hides the whole-document JSON when the host says so', async () => {
        await show(VALID['database-sqlite-indexes'](), { downloadHref: null });
        openDialog();
        expect(within(dialog()).queryByRole('button', { name: /JSON document/ })).toBeNull();
    });

    it('saves an SVG of the diagram named after its scope, and says how many tables it shows', async () => {
        await show(VALID['combined-multi-connection']());
        openDialog();
        expect(within(dialog()).getByText('as shown: 5 tables')).toBeInTheDocument();
        expect(within(dialog()).getByRole('radio', { name: 'Whole diagram' })).toBeChecked();
        fireEvent.click(within(dialog()).getByRole('button', { name: /SVG/ }));
        await waitFor(() => expect(saved.map((s) => s.name)).toEqual(['schema-all.svg']));
        const svg = await saved[0].blob.text();
        expect(svg).toContain('<svg');
        expect(svg).not.toContain('var(--');
        await waitFor(() => expect(within(dialog()).getByRole('status')).toHaveTextContent('Downloaded schema-all.svg.'));
    });

    it('keeps diagram shortcuts and Escape inside the dialog', async () => {
        await show(VALID['combined-eloquent']());
        openDialog();
        const select = within(dialog()).getByRole('radio', { name: /Markdown/ });
        fireEvent.keyDown(select, { key: 'c' });
        fireEvent.keyDown(select, { key: 'f' });
        expect(dialog()).toBeInTheDocument();
    });
});
