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
});
