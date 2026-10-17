import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { demoDirectory, pages, prepareDemo } from '../scripts/prepare-demo.mjs';

test('the demo is the built viewer with relative, base-safe URLs and synthetic snapshots only', async () => {
    await prepareDemo();
    for (const [page, [fixture]] of Object.entries(pages)) {
        const html = await readFile(new URL(page, demoDirectory), 'utf8');
        assert.ok(html.includes('href="app.css"') && html.includes('src="app.js"'), page);
        assert.ok(!html.match(/(?:src|href)="\/(?!\/)/), `${page} has a root-relative URL`);
        const snapshot = JSON.parse(await readFile(new URL(`snapshots/${fixture}.json`, demoDirectory), 'utf8'));
        assert.equal(snapshot.format, 'laranex-schema');
        assert.equal(snapshot.version, '1.0');
    }
    const snapshots = await readdir(new URL('snapshots/', demoDirectory));
    assert.deepEqual(snapshots.sort(), Object.values(pages).map(([f]) => `${f}.json`).sort());
});

test('the demo ships the files the viewer manifest lists', async () => {
    await prepareDemo();
    const manifest = JSON.parse(await readFile(new URL('manifest.json', demoDirectory), 'utf8'));
    for (const file of manifest.files.filter((f) => f.path !== 'index.html')) {
        await readFile(new URL(file.path, demoDirectory));
    }
});
