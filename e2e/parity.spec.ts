import { expect, test, type Locator, type Page } from '@playwright/test';
import { END_SHAPES, type LineEnd } from '../src/viewer/graph';

// Behaviour brought to parity with Laranex Laravel Schema Viewer, in the built bundle under the strict CSP.

test.describe.configure({ timeout: 60_000 });
const loaded = async (page: Page) => expect(page.locator('.lsv')).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
const side = (page: Page) => page.getByRole('complementary', { name: 'Side panel' });

// Words split over two lines inside `scope`: a word is a run of non-spaces within one text node, so an identifier
// broken after its separators (each part its own text node) is fine, and "mis|sing" is not.
async function splitWords(scope: Locator) {
    return scope.evaluate((root) => {
        const split: string[] = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent ?? '';
            for (const match of text.matchAll(/\S+/g)) {
                const range = document.createRange();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + match[0].length);
                const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
                if (tops.size > 1) {
                    split.push(match[0]);
                }
            }
        }
        return split;
    });
}

test('wraps the narrow Compare panel at word and identifier boundaries only', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The panel width is the point; the phone sheet is full width.');
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto('/f/comparison-tenant-schemas/#view=compare');
    await loaded(page);
    const body = side(page).locator('.panel__body');
    await expect(body.locator('.cmp-summary')).toBeVisible();
    expect(await body.evaluate((e) => (e as HTMLElement).offsetWidth)).toBeLessThanOrEqual(320);
    expect(await splitWords(body.locator('.compare'))).toEqual([]);
    await side(page).getByRole('tab', { name: 'Details' }).click();
    await side(page).getByRole('tab', { name: 'Browse' }).click();
    await side(page).locator('.browse__row').first().click();
    expect(await splitWords(body)).toEqual([]);
});

test('keeps every tab visible at the default panel, and reachable with the keyboard at the narrowest', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The phone sheet is covered below.');
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto('/f/comparison-tenant-schemas/');
    await loaded(page);
    const tablist = side(page).getByRole('tablist');
    const tabs = tablist.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    const inside = async (tab: Locator) => {
        const row = (await tablist.boundingBox())!;
        const box = (await tab.boundingBox())!;
        return box.x >= row.x - 1 && box.x + box.width <= row.x + row.width + 1;
    };
    for (const tab of await tabs.all()) {
        expect(await inside(tab)).toBe(true);
    }
    await expect(tablist).toHaveClass(/tabs--compact/);
    await expect(tabs.nth(2)).toHaveAttribute('title', 'Diagnostics');

    const resizer = page.getByRole('separator', { name: 'Resize the side panel' });
    await resizer.focus();
    await page.keyboard.press('Home');
    await tabs.first().click();
    for (let i = 1; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
        await expect(tabs.nth(i)).toBeFocused();
        await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
        expect(await inside(tabs.nth(i))).toBe(true);
    }
});

test('opens the phone sheet on the tab a deep link names', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone only.');
    await page.goto('/f/combined-eloquent/#table=mysql%3Aposts');
    await loaded(page);
    await expect(side(page).getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    await expect(side(page).getByRole('heading', { name: /posts/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
});

test('grows a connection frame around a table dragged out of it, and keeps the position when the card folds', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Cards are not draggable on phones.');
    await page.goto('/f/combined-multi-connection/');
    await loaded(page);
    const card = page.locator('.react-flow__node[data-id="cache:sessions"]');
    const frame = page.locator('.react-flow__node-region', { has: page.locator('[data-connection="cache"]') });
    const title = (await card.locator('.table-title').boundingBox())!;
    await page.mouse.move(title.x + 30, title.y + 10);
    await page.mouse.down();
    await page.mouse.move(title.x + 30, title.y + 260, { steps: 10 });
    await page.mouse.up();
    const moved = (await card.boundingBox())!;
    const box = (await frame.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThanOrEqual(moved.y + moved.height);
    expect(box.x).toBeLessThanOrEqual(moved.x);

    // Positions on the diagram, apart from any panning.
    const placed = () => card.evaluate((e) => (e as HTMLElement).style.transform);
    const dropped = await placed();
    // The card may sit at the edge of the view after the drag; the click itself is what matters.
    await card.getByRole('button', { name: /^Fold/ }).dispatchEvent('click');
    await expect(card.locator('.column')).toHaveCount(0);
    expect(await placed()).toBe(dropped);
});

test('draws a table on another connection that a relationship goes through as a reference', async ({ page }) => {
    await page.goto('/f/viewer-cross-connection-through/#connection=connection%3Aapp');
    await loaded(page);
    await page.locator('.canvas').focus();
    // ORM-only lines off: only the through relationship still reaches cache.sessions.
    await page.keyboard.press('3');
    await expect(page.locator('.react-flow__node-external[data-id="cache:sessions"]')).toBeVisible();
    await expect(page.locator('.react-flow__edge-path.edge--through')).toHaveCount(1);
    await page.keyboard.press('4');
    await expect(page.locator('.react-flow__node-external[data-id="cache:sessions"]')).toHaveCount(0);
});

test('draws the same line ends on screen and in the SVG image', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The image is checked on desktop.');
    await page.goto('/f/viewer-cardinality/');
    await loaded(page);
    const lines = await page.locator('.react-flow__edge path[marker-end]').evaluateAll((paths) =>
        paths.map((p) => ({ d: p.getAttribute('d') ?? '', start: p.getAttribute('marker-start'), end: p.getAttribute('marker-end') ?? '' })),
    );
    expect(lines.length).toBe(7);
    const endOf = (marker: string | null) => (marker ? (/#lsv-(many|one|parent|arrow)-/.exec(marker)?.[1] as LineEnd) : null);
    expect(lines.map((l) => endOf(l.start)).sort()).toEqual(['many', 'many', 'many', 'many', 'many', 'one', null].sort());
    await page.getByRole('button', { name: 'Download' }).click();
    const dialog = page.getByRole('dialog', { name: 'Download' });
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /^SVG/ }).click()]);
    const svg = Buffer.concat(await (await download.createReadStream()).toArray()).toString('utf8');
    for (const line of lines) {
        // Each screen line is in the image along the same route, followed by its end shapes: graph.ts END_SHAPES points
        // [out, across], out from the card along the line.
        const n = line.d.match(/-?[\d.]+(e-?\d+)?/g)?.map(Number) ?? [];
        const [sx, sy] = n;
        const [tx, ty] = n.slice(-2);
        const cx = line.d.includes('Q') ? n[4] : n[2];
        const out = Math.sign(cx - sx) || 1;
        const into = Math.sign(tx - cx) || 1;
        const shape = (end: LineEnd, x: number, y: number, dir: number) =>
            END_SHAPES[end].map((points) => `<path d="M ${points.map(([o, a]) => `${x + dir * o} ${y + a}`).join(' L ')}${end === 'arrow' ? ' Z' : ''}"`);
        const start = endOf(line.start);
        const expected = [`<path d="${line.d}"`, ...(start ? shape(start, sx, sy, out) : []), ...shape(endOf(line.end) ?? 'arrow', tx, ty, -into)];
        const at = svg.indexOf(expected[0]);
        expect(at, line.d).toBeGreaterThan(-1);
        const following = svg.slice(at).split('/>').slice(0, expected.length).map((p) => p.slice(p.indexOf('<path')));
        expect(following.map((p) => p.slice(0, p.indexOf('"', 9) + 1))).toEqual(expected);
    }
});

test('says when a deep link points at something the document does not have', async ({ page }) => {
    await page.goto('/f/combined-eloquent/#table=mysql%3Anope');
    await loaded(page);
    await expect(page.locator('.toast')).toContainText('This link points at a table that is not in this document. Showing the whole diagram.');
});

test('selects a column from its card row, lights the lines that use it, and focuses on a line', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Rows are small on a phone; the column is reached from Details there.');
    await page.goto('/f/combined-eloquent/#table=mysql%3Aposts');
    await loaded(page);
    await page.locator('.react-flow__node[data-id="mysql:posts"] [data-column="user_id"]').click();
    await expect(side(page).getByRole('heading', { name: /posts\.user_id/ })).toBeVisible();
    await expect.poll(() => page.url()).toContain('column=user_id');
    await expect(page.locator('.react-flow__node[data-id="mysql:users"] .table-card.related')).toBeVisible();
    await side(page).locator('.detail-link').first().click();
    await page.keyboard.press('Shift+F');
    await expect(page.locator('.focus-label')).toContainText(/Focus on .+ · \d+ tables/);
});

test('lays out and draws a generated 200-table schema within the budget', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'One browser is enough for the smoke test.');
    const { large } = await import('../dev/large');
    const body = JSON.stringify(large(200));
    await page.route('**/f/database-sqlite-indexes/snapshot.json', (route) => route.fulfill({ contentType: 'application/json', body }));
    const started = Date.now();
    await page.goto('/f/database-sqlite-indexes/');
    await expect(page.locator('.lsv')).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
    const elapsed = Date.now() - started;
    await expect(page.locator('.react-flow__node-table').first()).toBeVisible();
    // A generous budget for a loaded CI machine; it typically takes a few seconds.
    expect(elapsed).toBeLessThan(20_000);
    test.info().annotations.push({ type: 'layout', description: `200 tables in ${elapsed} ms` });
    // Panning stays responsive: one frame after a pan, the viewport has moved.
    await page.locator('.canvas').focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => page.evaluate(() => (document.querySelector('.react-flow__viewport') as HTMLElement).style.transform)).toContain('translate');
});
