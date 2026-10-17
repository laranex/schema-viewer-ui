import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Download, type Page } from '@playwright/test';

// The Download dialog in the built viewer under the strict CSP: every format, named after the connection, and images
// of the whole diagram or what is on screen.

const loaded = async (page: Page) => expect(page.locator('.lsv')).toHaveAttribute('data-loaded', 'true');
const text = async (download: Download) => Buffer.concat(await (await download.createReadStream()).toArray()).toString('utf8');
const openDialog = async (page: Page, isMobile: boolean) => {
    if (isMobile) {
        await page.getByRole('button', { name: 'More' }).click();
        await page.getByRole('menuitem', { name: 'Download…' }).click();
    } else {
        await page.getByRole('button', { name: 'Download' }).click();
    }
    const dialog = page.getByRole('dialog', { name: 'Download' });
    await expect(dialog).toBeVisible();
    return dialog;
};

test.describe('Download dialog', () => {
    test('downloads Mermaid, DBML, Markdown and JSON of the chosen connection', async ({ page, isMobile }) => {
        const errors: string[] = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        await page.goto('/f/combined-multi-connection/');
        await loaded(page);
        const dialog = await openDialog(page, isMobile);
        await dialog.getByRole('combobox', { name: 'Connection' }).selectOption('connection:analytics');
        for (const [format, file, needle] of [
            ['Mermaid', 'schema-analytics.mmd', 'users ||--o{ events : "user_id"'],
            ['DBML', 'schema-analytics.dbml', 'Ref events_user_id_foreign: events.user_id > users.id [delete: cascade]'],
            ['Markdown', 'schema-analytics.md', '# Database schema: analytics (mysql)'],
            ['JSON', 'schema-analytics.json', '"id": "connection:analytics"'],
        ]) {
            await dialog.locator('label.download__format', { hasText: format }).click();
            await expect(dialog.getByLabel(`Preview of ${file}`)).toContainText(needle);
            const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: `Download ${file}` }).click()]);
            expect(download.suggestedFilename()).toBe(file);
            expect(await text(download)).toContain(needle);
        }
        const json = JSON.parse(await text(await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download schema-analytics.json' }).click()]).then(([d]) => d)));
        expect(json.connections.map((c: { name: string }) => c.name)).toEqual(['analytics']);
        expect(errors).toEqual([]);
    });

    test('saves the whole diagram or what is on screen, as SVG and PNG', async ({ page, isMobile }) => {
        test.skip(isMobile, 'The viewport area is checked on desktop.');
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        for (let i = 0; i < 4; i++) {
            await page.getByRole('button', { name: 'Zoom in' }).click();
        }
        const dialog = await openDialog(page, false);
        await expect(dialog.getByText(/as shown: 11 tables/)).toBeVisible();
        const svgOf = async () => {
            const [d] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /^SVG/ }).click()]);
            expect(d.suggestedFilename()).toBe('schema-mysql.svg');
            return text(d);
        };
        const whole = await svgOf();
        await dialog.getByText("What's on screen").click();
        const screen = await svgOf();
        const viewBox = (svg: string) => (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);
        expect(viewBox(screen)[2]).toBeLessThan(viewBox(whole)[2]);
        expect(screen.length).toBeLessThan(whole.length);
        expect(whole).not.toContain('var(--');
        // The fonts travel with the file, so it renders the same outside the page.
        expect(whole).toContain('@font-face');
        expect(whole).toMatch(/font-family:'IBM Plex Mono';font-style:normal;font-weight:400;src:url\(data:font\/woff2;base64,/);
        const [png] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /^PNG/ }).click()]);
        expect(png.suggestedFilename()).toBe('schema-mysql.png');
        const bytes = Buffer.concat(await (await png.createReadStream()).toArray());
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    });

    test('closes with Escape and gives focus back', async ({ page, isMobile }) => {
        test.skip(isMobile, 'Keyboard only.');
        await page.goto('/f/combined-eloquent/');
        await loaded(page);
        await page.locator('.canvas').focus();
        await page.keyboard.press('e');
        const dialog = page.getByRole('dialog', { name: 'Download' });
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(page.locator('.canvas')).toBeFocused();
    });

    test('saves the page as one offline HTML file that works from file:// with no network', async ({ page, browserName, isMobile }, testInfo) => {
        test.skip(browserName === 'webkit', 'WebKit is not run against file:// pages here, as in Laranex Laravel Schema Viewer.');
        await page.goto('/f/combined-multi-connection/#connection=connection%3Aanalytics');
        await loaded(page);
        const dialog = await openDialog(page, isMobile);
        const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /This page as HTML/ }).click()]);
        expect(download.suggestedFilename()).toBe('schema-viewer.html');
        const file = testInfo.outputPath('schema-viewer.html');
        await download.saveAs(file);
        const html = await text(download);
        expect(html).toContain('script-src \'sha256-');
        expect(html.length).toBeLessThan(4_000_000);

        // A fresh page with every network request refused: everything must come from the file itself.
        const offline = await page.context().newPage();
        const requests: string[] = [];
        const problems: string[] = [];
        offline.on('request', (r) => requests.push(r.url()));
        offline.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
        offline.on('pageerror', (e) => problems.push(e.message));
        await offline.route(/^https?:/, (route) => route.abort());
        await offline.goto(`file://${file}`);
        await loaded(offline);
        await expect(offline.locator('.react-flow__node-table')).toHaveCount(2);
        await expect(offline.locator('.react-flow__node-external')).toHaveCount(1);
        expect(requests.filter((u) => !/^(file|data|blob):/.test(u))).toEqual([]);
        expect(problems).toEqual([]);

        // Offline, the dialog still makes every file from the embedded document, and the page exports itself again.
        const again = await openDialog(offline, isMobile);
        const [whole] = await Promise.all([offline.waitForEvent('download'), again.getByRole('button', { name: /JSON document/ }).click()]);
        expect(JSON.parse(await text(whole)).connections).toHaveLength(3);
        await again.locator('label.download__format', { hasText: 'DBML' }).click();
        const [dbml] = await Promise.all([offline.waitForEvent('download'), again.getByRole('button', { name: 'Download schema-analytics.dbml' }).click()]);
        expect(await text(dbml)).toContain('Table events');
        const [copy] = await Promise.all([offline.waitForEvent('download'), again.getByRole('button', { name: /This page as HTML/ }).click()]);
        expect(await text(copy)).toBe(html);
        expect(requests.filter((u) => !/^(file|data|blob):/.test(u))).toEqual([]);
    });

    for (const theme of ['light', 'dark'] as const) {
        test(`has no serious accessibility violations in the ${theme} theme`, async ({ page, isMobile }) => {
            await page.emulateMedia({ colorScheme: theme });
            await page.goto('/f/combined-multi-connection/');
            await loaded(page);
            const dialog = await openDialog(page, isMobile);
            await dialog.locator('label.download__format', { hasText: 'DBML' }).click();
            const results = await new AxeBuilder({ page }).include('dialog.lsv-download').analyze();
            const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
            expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        });
    }
});
