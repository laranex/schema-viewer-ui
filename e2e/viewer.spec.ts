import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const loaded = async (page: Page) => expect(page.locator('.lsv')).toHaveAttribute('data-loaded', 'true');

test.describe('standalone viewer under a strict CSP', () => {
    test('loads a fetched snapshot, lays it out with ELK, and logs no CSP violations', async ({ page }) => {
        const violations: string[] = [];
        page.on('console', (m) => m.type() === 'error' && violations.push(m.text()));
        page.on('pageerror', (e) => violations.push(e.message));
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        await expect(page.locator('.react-flow__node')).toHaveCount(11);
        await expect(page.locator('.react-flow__edge').first()).toBeVisible();
        expect(violations).toEqual([]);
    });

    test('reads an inline document and the Web Component', async ({ page }) => {
        await page.goto('/inline/database-mysql-indexes/');
        await loaded(page);
        await expect(page.locator('.react-flow__node')).toHaveCount(1);
        await page.goto('/element/database-sqlite-indexes/');
        await loaded(page);
        await expect(page.getByRole('combobox', { name: 'Search the schema' })).toBeVisible();
    });

    test('serves the favicon the page links to', async ({ page, request }) => {
        await page.goto('/page/database-sqlite-indexes/');
        await loaded(page);
        const icons = await page.locator('link[rel="icon"]').evaluateAll((links) => links.map((l) => l.getAttribute('href')));
        expect(icons).toEqual(['favicon.svg', 'favicon.ico']);
        const svg = await request.get('/page/database-sqlite-indexes/favicon.svg');
        expect(svg.status()).toBe(200);
        expect(svg.headers()['content-type']).toBe('image/svg+xml');
        expect(await svg.text()).toContain('<svg');
        const ico = await request.get('/page/database-sqlite-indexes/favicon.ico');
        expect(ico.status()).toBe(200);
        const bytes = await ico.body();
        expect(bytes.subarray(0, 4).toString('hex')).toBe('00000100');
        expect(bytes.subarray(22, 30).toString('hex')).toBe('89504e470d0a1a0a');
    });

    test('refuses a document that is not laranex-schema 2.x', async ({ page }) => {
        await page.goto('/f/invalid/');
        await expect(page.getByText('Snapshot unavailable')).toBeVisible();
        await expect(page.locator('.lsv')).toHaveAttribute('data-loaded', 'error');
    });

    test('shows a table with its indexes and keeps it in the URL', async ({ page, isMobile }) => {
        test.skip(isMobile, 'The details panel layout is covered by the phone test.');
        await page.goto('/f/database-postgresql-indexes/');
        await loaded(page);
        await page.locator('.browse__row', { hasText: 'public.accounts' }).click();
        const details = page.getByRole('complementary', { name: 'Side panel' });
        await expect(details.getByRole('heading', { name: /public\.accounts/ })).toBeVisible();
        const partial = details.locator('li.index', { hasText: 'accounts_live_email_idx' });
        await expect(partial.getByText('partial')).toBeVisible();
        await expect(partial.getByText('(deleted_at IS NULL)')).toBeVisible();
        expect(page.url()).toContain('#table=pg%3Apublic.accounts');
        await page.reload();
        await loaded(page);
        await expect(details.getByRole('heading', { name: /public\.accounts/ })).toBeVisible();
    });

    test('selects a link from the diagram and explains it', async ({ page, isMobile }) => {
        test.skip(isMobile, 'Edge hit targets are small on phones; covered on desktop.');
        await page.goto('/f/combined-drift/');
        await loaded(page);
        await page.locator('.react-flow__edge').first().click({ force: true });
        await expect(page.getByRole('complementary', { name: 'Side panel' }).getByText(/RELATIONSHIP|FOREIGN/)).toBeVisible();
    });

    test('remembers the theme', async ({ page, isMobile }) => {
        await page.goto('/f/database-sqlite-indexes/');
        await loaded(page);
        const before = await page.locator('.lsv').getAttribute('data-theme');
        if (isMobile) {
            // On a phone the theme is in the ⋯ menu.
            await page.getByRole('button', { name: 'More' }).click();
            await page.getByRole('menuitem', { name: /theme$/ }).click();
        } else {
            await page.getByRole('button', { name: /Switch to/ }).click();
        }
        const after = await page.locator('.lsv').getAttribute('data-theme');
        expect(after).not.toBe(before);
        await page.reload();
        await loaded(page);
        await expect(page.locator('.lsv')).toHaveAttribute('data-theme', after as string);
    });

    test('fits a phone screen without horizontal scrolling', async ({ page, isMobile }) => {
        test.skip(!isMobile, 'Phone layout only.');
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        await page.getByRole('button', { name: 'Browse' }).click();
        await page.locator('.browse__row', { hasText: 'posts' }).click();
        const sheet = page.getByRole('complementary', { name: 'Side panel' });
        await expect(sheet.getByRole('heading', { name: /posts/ })).toBeVisible();
        const inner = await sheet.evaluate((e) => e.scrollWidth - e.clientWidth);
        expect(inner).toBeLessThanOrEqual(0);
    });

    test('has no serious accessibility violations', async ({ page }) => {
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        const results = await new AxeBuilder({ page }).exclude('.react-flow__renderer').analyze();
        const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });

    test('has no serious accessibility violations with several connections', async ({ page }) => {
        await page.goto('/f/combined-multi-connection/#connection=connection%3Acache');
        await loaded(page);
        const results = await new AxeBuilder({ page }).exclude('.react-flow__renderer').analyze();
        expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
    });

    test('picks several tables with Shift and moves them together', async ({ page, isMobile }) => {
        test.skip(isMobile, 'Shift-click needs a keyboard.');
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        const card = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
        await card('mysql:users').locator('.table-title').click();
        await card('mysql:roles').locator('.table-title').click({ modifiers: ['Shift'] });
        await expect(page.getByRole('complementary', { name: 'Side panel' }).getByRole('heading', { name: '2 tables' })).toBeVisible();
        const before = await card('mysql:roles').boundingBox();
        const title = (await card('mysql:users').locator('.table-title').boundingBox())!;
        await page.mouse.move(title.x + 40, title.y + 20);
        await page.mouse.down();
        await page.mouse.move(title.x + 140, title.y + 80, { steps: 8 });
        await page.mouse.up();
        const after = await card('mysql:roles').boundingBox();
        expect(Math.round(after!.x - before!.x)).toBeGreaterThan(50);
    });

    test('exports PNG and SVG images under the strict CSP', async ({ page, isMobile }) => {
        test.skip(isMobile, 'Downloads are covered on desktop.');
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        await page.getByRole('button', { name: 'Download' }).click();
        const dialog = page.getByRole('dialog', { name: 'Download' });
        const [png] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /^PNG/ }).click()]);
        expect(png.suggestedFilename()).toBe('schema-mysql.png');
        const bytes = await (await png.createReadStream()).toArray();
        const head = Buffer.concat(bytes).subarray(0, 8);
        expect(head.toString('hex')).toBe('89504e470d0a1a0a');
        await dialog.getByText("What's on screen").click();
        const [svg] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /^SVG/ }).click()]);
        const text = Buffer.concat(await (await svg.createReadStream()).toArray()).toString('utf8');
        expect(text).toContain('<svg');
        expect(text).toContain('posts');
    });

    test('draws placeholder rows when zoomed far out, and real rows again when zoomed in', async ({ page }) => {
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        const users = page.locator('.react-flow__node[data-id="mysql:users"]');
        for (let i = 0; i < 8; i++) {
            await page.getByRole('button', { name: 'Zoom out' }).click();
        }
        await expect(users.locator('.column.placeholder').first()).toBeAttached();
        await expect(users.locator('.column-name')).toHaveCount(0);
        // Fit can land below 40% on a phone, so zoom in explicitly.
        for (let i = 0; i < 12; i++) {
            await page.getByRole('button', { name: 'Zoom in' }).click();
        }
        await expect(users.locator('.column-name').first()).toBeAttached();
    });

    test('resizes the side panel by dragging its edge', async ({ page, isMobile }) => {
        test.skip(isMobile, 'The panel is a bottom sheet on phones.');
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        const width = () => page.getByRole('complementary', { name: 'Side panel' }).evaluate((e) => (e as HTMLElement).offsetWidth);
        const before = await width();
        const box = (await page.getByRole('separator', { name: 'Resize the side panel' }).boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + 200);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 - 100, box.y + 200, { steps: 6 });
        await page.mouse.up();
        await expect.poll(width).toBe(before + 100);
    });


    test('box-selects tables in select mode, then pans again with the hand tool', async ({ page, isMobile }) => {
        test.skip(isMobile, 'Phones always pan.');
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        const canvas = (await page.locator('.canvas').boundingBox())!;
        await page.getByRole('button', { name: 'Select mode' }).click();
        await page.mouse.move(canvas.x + 4, canvas.y + 4);
        await page.mouse.down();
        await page.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.8, { steps: 10 });
        await page.mouse.up();
        await expect(page.getByRole('complementary', { name: 'Side panel' }).getByRole('heading', { name: /\d+ tables/ })).toBeVisible();
        await page.getByRole('button', { name: 'Pan mode' }).click();
        await expect(page.locator('.react-flow__nodesselection-rect')).toHaveCount(0);
        const spot = await page.evaluate(() => {
            for (let y = 150; y < 650; y += 10) for (let x = 100; x < 1000; x += 10) if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
            return null;
        });
        const before = await page.evaluate(() => (document.querySelector('.react-flow__viewport') as HTMLElement).style.transform);
        await page.mouse.move(spot!.x, spot!.y);
        await page.mouse.down();
        await page.mouse.move(spot!.x + 60, spot!.y + 30, { steps: 8 });
        await page.mouse.up();
        await expect.poll(() => page.evaluate(() => (document.querySelector('.react-flow__viewport') as HTMLElement).style.transform)).not.toBe(before);
    });

    test('frames each connection and navigates across connections through reference nodes', async ({ page, isMobile }) => {
        const violations: string[] = [];
        page.on('console', (m) => m.type() === 'error' && violations.push(m.text()));
        page.on('pageerror', (e) => violations.push(e.message));
        await page.goto('/f/combined-multi-connection/');
        await loaded(page);
        await expect(page.locator('.region-node')).toHaveCount(3);
        await expect(page.locator('.react-flow__node-table')).toHaveCount(5);
        await expect(page.locator('.react-flow__node[data-id="app:public.users"] .table-title')).toContainText('app · public.users');
        await expect(page.locator('.react-flow__node[data-id="analytics:users"] .table-title')).toContainText('analytics · users');

        if (isMobile) {
            await page.getByRole('button', { name: 'More' }).click();
            await page.getByRole('menuitemradio', { name: /analytics/ }).click();
        } else {
            await page.getByRole('combobox', { name: 'Connection' }).selectOption('connection:analytics');
        }
        await expect(page.locator('.region-node')).toHaveCount(0);
        const external = page.locator('.react-flow__node-external');
        await expect(external).toHaveCount(1);
        await expect(external).toContainText('On connection app');
        await expect(page.locator('.react-flow__edge-path.cross-connection')).toHaveCount(1);
        await expect(page.locator('.react-flow__edge-path.cross-connection.edge--relationship')).toHaveCount(1);
        expect(page.url()).toContain('#connection=connection%3Aanalytics');

        await external.getByRole('button').click();
        await expect(page.getByRole('complementary', { name: 'Side panel' }).getByRole('heading', { name: /app · public\.users/ })).toBeVisible();
        await expect.poll(() => page.url()).toContain('connection=connection%3Aapp');
        await expect(page.locator('.react-flow__node-external')).toHaveCount(2);
        if (!isMobile) {
            await page.locator('.canvas').focus();
            await page.keyboard.press(']');
            await expect(page.getByRole('combobox', { name: 'Connection' })).toHaveValue('connection:analytics');
        }
        expect(violations).toEqual([]);
    });
});
