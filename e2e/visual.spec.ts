import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Visual regression of the icons, the brand mark, the favicon and both themes, plus the theme-consistency checks behind
// them. The baselines (e2e/visual.spec.ts-snapshots/) are rendered by Chromium on macOS with the bundled IBM Plex fonts,
// a fixed viewport and no animations; other platforms render text differently, so the screenshots run there only. The
// consistency and accessibility checks run everywhere.

test.describe.configure({ timeout: 60_000 });
const loaded = async (page: Page) => expect(page.locator('.lsv')).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
const side = (page: Page) => page.getByRole('complementary', { name: 'Side panel' });
const shots = process.platform === 'darwin';
const exact = { maxDiffPixelRatio: 0.001, animations: 'disabled' as const, caret: 'hide' as const };

async function open(page: Page, path: string, scheme: 'light' | 'dark', width = 1440, height = 900) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto(path);
    await loaded(page);
    await expect(page.locator('.lsv')).toHaveAttribute('data-theme', scheme);
    await page.evaluate(() => document.fonts.ready);
}

for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${scheme} theme`, () => {
        test.beforeEach(({ browserName, isMobile }) => test.skip(browserName !== 'chromium' || isMobile, 'Chromium desktop renders the baselines; the phone layout is set by width.'));

        test('header, toolbar, menus and side-panel tabs', async ({ page }) => {
            test.skip(!shots, 'Screenshot baselines are rendered on macOS.');
            await open(page, '/f/viewer-two-way-comparison/', scheme);
            await expect(page.locator('.lsv-header')).toHaveScreenshot(`header-${scheme}.png`, exact);
            await expect(page.locator('.toolbar')).toHaveScreenshot(`toolbar-${scheme}.png`, exact);
            for (const name of ['Relationships', 'Tables', 'Show']) {
                await page.locator('.toolbar').getByRole('button', { name }).click();
                await expect(page.getByRole('menu', { name })).toHaveScreenshot(`menu-${name.toLowerCase()}-${scheme}.png`, exact);
                await page.keyboard.press('Escape');
            }
            await page.getByRole('button', { name: 'Download' }).click();
            await expect(page.getByRole('menu', { name: 'Download' })).toHaveScreenshot(`menu-download-${scheme}.png`, exact);
            await page.keyboard.press('Escape');
            await expect(side(page).getByRole('tablist')).toHaveScreenshot(`tabs-${scheme}.png`, exact);
            await side(page).getByRole('tab', { name: 'Compare' }).click();
            await expect(side(page).locator('.cmp-scopes')).toHaveScreenshot(`compare-scopes-${scheme}.png`, exact);
            await expect(side(page).locator('.cmp-summary')).toHaveScreenshot(`compare-summary-${scheme}.png`, exact);
            await side(page).getByRole('tab', { name: 'Migrations' }).click();
            await expect(side(page).locator('.status-counts')).toHaveScreenshot(`migration-statuses-${scheme}.png`, exact);
        });

        test('narrow panel tabs, and the phone header and sheet bar', async ({ page }) => {
            test.skip(!shots, 'Screenshot baselines are rendered on macOS.');
            await open(page, '/f/comparison-tenant-schemas/', scheme, 1100, 800);
            await expect(side(page).getByRole('tablist')).toHaveScreenshot(`tabs-compact-${scheme}.png`, exact);
            await open(page, '/f/combined-multi-connection/', scheme, 390, 844);
            await expect(page.locator('.lsv-header')).toHaveScreenshot(`phone-header-${scheme}.png`, exact);
            await expect(page.locator('.sheet-bar')).toHaveScreenshot(`phone-sheet-bar-${scheme}.png`, exact);
            await expect(page.locator('.toolbar')).toHaveScreenshot(`phone-toolbar-${scheme}.png`, exact);
        });

        test('favicon', async ({ page }) => {
            test.skip(!shots, 'Screenshot baselines are rendered on macOS.');
            await page.emulateMedia({ colorScheme: scheme });
            await page.setViewportSize({ width: 200, height: 80 });
            // The shipped page's own favicon files, drawn large on a mid-grey page.
            await page.goto('/page/database-sqlite-indexes/');
            await page.evaluate(() => {
                document.body.replaceChildren();
                document.body.style.cssText = 'margin:0;background:rgb(128 128 128)';
                for (const [href, size] of [['favicon.svg', 64], ['favicon.ico', 32]] as const) {
                    const img = document.createElement('img');
                    img.src = href;
                    img.width = img.height = size;
                    document.body.append(img);
                }
            });
            await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
            await expect(page.locator('body')).toHaveScreenshot(`favicon-${scheme}.png`, exact);
        });

        test('icons take their control’s color, the brand mark the accent, and both stand out from their background', async ({ page }) => {
            await open(page, '/f/viewer-two-way-comparison/', scheme);
            const report = await page.evaluate(() => {
                const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
                const lum = ([r, g, b]: number[]) => {
                    const ch = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
                    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
                };
                const background = (el: Element | null): number[] => {
                    for (; el; el = el.parentElement) {
                        const c = parse(getComputedStyle(el).backgroundColor);
                        if (c.length === 3 || (c.length === 4 && c[3] === 1)) {
                            return c.slice(0, 3);
                        }
                    }
                    return [255, 255, 255];
                };
                const contrast = (a: number[], b: number[]) => {
                    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
                    return (x + 0.05) / (y + 0.05);
                };
                const icons = [...document.querySelectorAll<SVGElement>('.lsv-header svg.icon, .toolbar svg.icon')].filter((svg) => svg.getBoundingClientRect().width > 0);
                const off = icons.filter((svg) => getComputedStyle(svg).stroke !== getComputedStyle(svg).color && getComputedStyle(svg).fill !== getComputedStyle(svg).color).map((svg) => svg.outerHTML.slice(0, 80));
                const faint = icons.filter((svg) => contrast(parse(getComputedStyle(svg).color).slice(0, 3), background(svg.parentElement)) < 3).map((svg) => svg.parentElement?.getAttribute('aria-label') ?? svg.parentElement?.textContent);
                const brand = document.querySelector('.brand-mark') as SVGElement;
                const accent = getComputedStyle(document.querySelector('.lsv') as Element).getPropertyValue('--accent').trim();
                const probe = document.createElement('span');
                probe.style.color = accent;
                document.body.append(probe);
                const accentRgb = getComputedStyle(probe).color;
                probe.remove();
                return { count: icons.length, off, faint, brand: getComputedStyle(brand).stroke, accentRgb, brandContrast: contrast(parse(getComputedStyle(brand).stroke), background(brand.parentElement)) };
            });
            expect(report.count).toBeGreaterThan(8);
            expect(report.off).toEqual([]);
            expect(report.faint).toEqual([]);
            expect(report.brand).toBe(report.accentRgb);
            expect(report.brandContrast).toBeGreaterThanOrEqual(3);
        });

        test('menus and the compact tabs have no serious accessibility violations', async ({ page }) => {
            await open(page, '/f/comparison-tenant-schemas/', scheme, 1100, 800);
            await page.locator('.toolbar').getByRole('button', { name: 'Show' }).click();
            const results = await new AxeBuilder({ page }).exclude('.react-flow__renderer').analyze();
            expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        });
    });
}
