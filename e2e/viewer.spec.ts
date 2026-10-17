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
        await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible();
    });

    test('refuses a document that is not laranex-schema 1.x', async ({ page }) => {
        await page.goto('/f/invalid/');
        await expect(page.getByText('Snapshot unavailable')).toBeVisible();
        await expect(page.locator('.lsv')).toHaveAttribute('data-loaded', 'error');
    });

    test('shows a table with its indexes and keeps it in the URL', async ({ page, isMobile }) => {
        test.skip(isMobile, 'The details panel layout is covered by the phone test.');
        await page.goto('/f/database-postgresql-indexes/');
        await loaded(page);
        await page.getByRole('complementary', { name: 'Tables' }).getByText('public.accounts').click();
        const details = page.getByRole('complementary', { name: 'Selection details' });
        await expect(details.getByRole('heading', { name: 'public.accounts' })).toBeVisible();
        const partial = details.locator('li.index', { hasText: 'accounts_live_email_idx' });
        await expect(partial.getByText('partial')).toBeVisible();
        await expect(partial.getByText('(deleted_at IS NULL)')).toBeVisible();
        expect(page.url()).toContain('#table=pg%3Apublic.accounts');
        await page.reload();
        await loaded(page);
        await expect(details.getByRole('heading', { name: 'public.accounts' })).toBeVisible();
    });

    test('selects a link from the diagram and explains it', async ({ page, isMobile }) => {
        test.skip(isMobile, 'Edge hit targets are small on phones; covered on desktop.');
        await page.goto('/f/combined-drift/');
        await loaded(page);
        await page.locator('.react-flow__edge').first().click({ force: true });
        await expect(page.getByRole('complementary', { name: 'Selection details' }).getByText(/RELATIONSHIP|FOREIGN/)).toBeVisible();
    });

    test('remembers the theme', async ({ page }) => {
        await page.goto('/f/database-sqlite-indexes/');
        await loaded(page);
        const before = await page.locator('.lsv').getAttribute('data-theme');
        await page.getByRole('button', { name: /Switch to/ }).click();
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
        await expect(page.getByRole('complementary', { name: 'Selection details' })).toBeVisible();
    });

    test('has no serious accessibility violations', async ({ page }) => {
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        const results = await new AxeBuilder({ page }).exclude('.react-flow__renderer').analyze();
        const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });

    test('picks several tables with Shift and moves them together', async ({ page, isMobile }) => {
        test.skip(isMobile, 'Shift-click needs a keyboard.');
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        const card = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
        await card('mysql:users').locator('.table-title').click();
        await card('mysql:roles').locator('.table-title').click({ modifiers: ['Shift'] });
        await expect(page.getByRole('complementary', { name: 'Selection details' }).getByRole('heading', { name: '2 tables' })).toBeVisible();
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
        await page.getByRole('button', { name: 'Export' }).click();
        const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'PNG · whole diagram' }).click()]);
        expect(png.suggestedFilename()).toBe('schema-diagram.png');
        const bytes = await (await png.createReadStream()).toArray();
        const head = Buffer.concat(bytes).subarray(0, 8);
        expect(head.toString('hex')).toBe('89504e470d0a1a0a');
        await page.keyboard.press('e');
        const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'SVG · visible area' }).click()]);
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
});
