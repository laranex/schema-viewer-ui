import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The comparison, migration and inferred-association views in the built bundle, under the strict CSP.

// These documents have more tables than the other browser tests' fixtures, and ELK runs on the page: allow for a busy
// machine running every project in parallel.
test.describe.configure({ timeout: 60_000 });
const loaded = async (page: Page) => expect(page.locator('.lsv')).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../contract/fixtures/valid/${name}.json`, import.meta.url), 'utf8'));
const side = (page: Page) => page.getByRole('complementary', { name: 'Side panel' });

// On a phone the panel is a bottom sheet: open it before using its tabs.
async function openTab(page: Page, isMobile: boolean, name: RegExp) {
    if (isMobile && !(await side(page).getByRole('tablist').isVisible().catch(() => false))) {
        await side(page).locator('.sheet-bar__action').click();
    }
    await side(page).getByRole('tab', { name }).click();
}

async function serious(page: Page) {
    const results = await new AxeBuilder({ page }).exclude('.react-flow__renderer').analyze();
    return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

function watch(page: Page) {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    return errors;
}

test.describe('comparisons', () => {
    test('lists the differences side by side, opens a table on the target side, and keeps the view in the URL', async ({ page, isMobile }) => {
        const errors = watch(page);
        await page.goto('/f/comparison-tenant-schemas/');
        await loaded(page);
        await expect(page.locator('.cmp-chip').first()).toBeVisible();
        await expect(page.locator('.react-flow__node[data-id="app:tenant_a.invoices"] .cmp-chip')).toHaveText('− missing in target');
        await openTab(page, isMobile, /^Compare/);
        const body = side(page);
        await expect(body.locator('.cmp-direction')).toContainText('app · tenant_a');
        await expect(body.locator('.cmp-summary dd')).toHaveText(['8', '8', '9', '25']);
        const total = body.locator('[data-difference]', { hasText: 'tenant_a.orders.total' });
        await expect(total.getByRole('row', { name: /type/ })).toContainText('numeric(10,2)');
        await expect(total.getByRole('row', { name: /type/ })).toContainText('numeric(12,2)');
        expect(page.url()).toContain('view=compare');
        await total.getByRole('button', { name: 'Show in target: tenant_b.orders' }).click();
        await expect(body.getByRole('heading', { name: /tenant_b\.orders/ })).toBeVisible();
        await expect(body.getByText('this table is on the target side', { exact: false })).toBeVisible();
        await expect.poll(() => page.url()).toContain('table=app%3Atenant_b.orders');
        if (isMobile) {
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(0);
        }
        expect(errors).toEqual([]);
    });

    test('opens on a deep link to one difference', async ({ page, isMobile }) => {
        const doc = fixture('comparison-tenant-schemas');
        const [c] = doc.comparisons;
        const d = c.differences.find((x: { key: string[] }) => x.key.join('.') === 'users.status');
        await page.goto(`/f/comparison-tenant-schemas/#view=compare&comparison=${c.id}&difference=${d.id}`);
        await loaded(page);
        if (isMobile) {
            await side(page).locator('.sheet-bar__action').click();
        }
        const selected = page.locator(`[data-difference="${d.id}"]`);
        await expect(selected).toHaveClass(/selected/);
        await expect(selected).toContainText('likely · heuristic');
        await expect(selected).toBeInViewport();
    });

    test('shows an incomplete comparison prominently, on the diagram and in the tab', async ({ page, isMobile }) => {
        await page.goto('/f/comparison-incomplete/');
        await loaded(page);
        if (!isMobile) {
            await expect(page.getByRole('note', { name: 'Comparison marks' })).toContainText('incomplete, 20 differences not marked');
        }
        await openTab(page, isMobile, /^Compare/);
        const alert = side(page).getByRole('note', { name: 'Incomplete comparison' });
        await expect(alert).toBeVisible();
        await expect(alert).toContainText('20 of 25 differences were left out of the listing.');
        await expect(alert).toContainText('checkConstraints');
        expect(await serious(page)).toEqual([]);
    });

    for (const scheme of ['light', 'dark'] as const) {
        test(`has no serious accessibility violations in Compare, ${scheme}`, async ({ page, isMobile }) => {
            await page.emulateMedia({ colorScheme: scheme });
            await page.goto('/f/viewer-two-way-comparison/#view=compare');
            await loaded(page);
            await expect(page.locator('.lsv')).toHaveAttribute('data-theme', scheme);
            if (isMobile) {
                await side(page).locator('.sheet-bar__action').click();
            }
            await expect(side(page).locator('[data-difference]').first()).toBeVisible();
            expect(await serious(page)).toEqual([]);
        });
    }

    test('chooses baseline and target with the keyboard', async ({ page, isMobile, browserName }) => {
        test.skip(isMobile, 'Keyboard navigation is covered on desktop.');
        await page.goto('/f/viewer-two-way-comparison/#view=compare');
        await loaded(page);
        const baseline = side(page).getByRole('combobox', { name: 'Baseline' });
        await baseline.focus();
        await baseline.selectOption({ label: 'app · tenant_b' });
        await expect(side(page).locator('.cmp-direction')).toContainText(/Baseline app · tenant_b/);
        const swap = side(page).getByRole('button', { name: 'Swap baseline and target' });
        if (browserName === 'webkit') {
            // Safari moves Tab focus to buttons only with Option-Tab.
            await swap.focus();
        } else {
            await page.keyboard.press('Tab');
            await page.keyboard.press('Tab');
        }
        await expect(swap).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(baseline).toHaveValue(JSON.stringify(['connection:app', 'tenant_a']));
    });

    test('says when a complete comparison found nothing', async ({ page, isMobile }) => {
        await page.goto('/f/viewer-clean-comparison/');
        await loaded(page);
        await openTab(page, isMobile, /^Compare/);
        await expect(side(page).getByText(/No differences: this complete comparison/)).toBeVisible();
    });
});

test.describe('migrations', () => {
    test('shows every track’s revision status apart from schema drift, without accessibility violations', async ({ page, isMobile }) => {
        const errors = watch(page);
        await page.goto('/f/migrations-alembic/');
        await loaded(page);
        await openTab(page, isMobile, /^Migrations/);
        const body = side(page);
        await expect(body.getByText(/It is not schema drift/)).toBeVisible();
        await expect(body.locator('[data-track]')).toHaveCount(10);
        const diverged = body.locator('[data-track]', { hasText: 'tenant_diverged' });
        await expect(diverged.locator('.status-badge')).toHaveText('Diverged');
        await expect(diverged.locator('.status-badge')).toHaveAttribute('title', /ancestor of another recorded revision/);
        await expect(body.locator('[data-track]', { hasText: 'tenant_branches' })).toContainText('Multiple heads');
        expect(await serious(page)).toEqual([]);
        expect(errors).toEqual([]);
    });
});

test.describe('inferred associations', () => {
    test('annotates the existing foreign-key edges, draws no extra edge, and explains the inference', async ({ page, isMobile }) => {
        const doc = fixture('inferred-associations');
        const inferred = new Set(doc.inferredAssociations.flatMap((a: { links: string[] }) => a.links));
        await page.goto('/f/inferred-associations/');
        await loaded(page);
        await expect(page.locator('.react-flow__edge')).toHaveCount(doc.links.length);
        await expect(page.locator('.react-flow__edge-path.inferred')).toHaveCount(inferred.size);
        await expect(page.locator('.edge-label--inferred').first()).toContainText('FK · inferred');
        await page.locator('.canvas').focus();
        await page.keyboard.press('5');
        await expect(page.locator('.react-flow__edge-path.inferred')).toHaveCount(0);
        await expect(page.locator('.react-flow__edge')).toHaveCount(doc.links.length);
        const a = doc.inferredAssociations.find((x: { model: string; relatedModel: string }) => x.model.endsWith('.Profile'));
        await page.goto('about:blank');
        await page.goto(`/f/inferred-associations/#inferred=${a.id}`);
        await loaded(page);
        if (isMobile) {
            await side(page).locator('.sheet-bar__action').click();
        }
        await expect(side(page).getByText('INFERRED ASSOCIATION · HEURISTIC')).toBeVisible();
        await expect(side(page).getByText(/No ORM relationship attribute is declared for it/)).toBeVisible();
        expect(await serious(page)).toEqual([]);
    });
});
