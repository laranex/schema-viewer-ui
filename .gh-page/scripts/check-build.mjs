// Checks the built site: every page, every local link and asset resolves under the Pages base, the demo holds exactly
// the built viewer, its pages and their synthetic snapshots (byte for byte the contract fixtures), and the snapshot
// scanner finds no schema document in the whole site but those snapshots, which the repository's allowlist lists.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages } from './prepare-demo.mjs';

const dist = path.resolve(fileURLToPath(new URL('../.vitepress/dist/', import.meta.url)));
const docs = fileURLToPath(new URL('../../docs/', import.meta.url));
const base = '/schema-viewer-ui/';
const output = new Set(await readdir(dist));
for (const name of await readdir(docs)) {
    if (name.endsWith('.md')) {
        assert.ok(output.has(name.replace(/\.md$/, '.html')), `Missing page for ${name}`);
    }
}

let checked = 0;
for (const filename of output) {
    if (!filename.endsWith('.html')) {
        continue;
    }
    const html = await readFile(path.join(dist, filename), 'utf8');
    for (const [, value] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const url = new URL(value.replaceAll('&amp;', '&'), `https://example.invalid${base}${filename}`);
        if (url.origin !== 'https://example.invalid') {
            continue;
        }
        assert.ok(url.pathname.startsWith(base), `Wrong base in ${filename}: ${value}`);
        let target = path.resolve(dist, decodeURIComponent(url.pathname.slice(base.length)));
        assert.ok(target.startsWith(dist + path.sep) || target === dist);
        if ((await stat(target)).isDirectory()) {
            target = path.join(target, 'index.html');
        }
        assert.ok((await stat(target)).isFile(), `Missing asset or page: ${value} (in ${filename})`);
        checked++;
    }
}
for (const [page, [fixture]] of Object.entries(pages)) {
    const html = await readFile(path.join(dist, 'demo', page), 'utf8');
    assert.ok(html.includes(`data-snapshot-url="snapshots/${fixture}.json"`), `Demo ${page} loads ${fixture}`);
    const snapshot = JSON.parse(await readFile(path.join(dist, 'demo/snapshots', `${fixture}.json`), 'utf8'));
    assert.equal(snapshot.format, 'laranex-schema');
}
const demo = path.join(dist, 'demo');
const viewerFiles = ['app.js', 'app.css', 'assets', 'offline.js', 'favicon.svg', 'favicon.ico', 'manifest.json'];
assert.deepEqual((await readdir(demo)).sort(), [...viewerFiles, ...Object.keys(pages), 'snapshots'].sort(), 'The demo holds only the viewer, its pages and snapshots');
assert.deepEqual((await readdir(path.join(demo, 'snapshots'))).sort(), Object.values(pages).map(([fixture]) => `${fixture}.json`).sort(), 'The demo publishes only its fixtures');
for (const [fixture] of Object.values(pages)) {
    const published = await readFile(path.join(demo, 'snapshots', `${fixture}.json`));
    assert.ok(published.equals(await readFile(new URL(`../../contract/fixtures/valid/${fixture}.json`, import.meta.url))), `${fixture}.json is the contract fixture`);
}

// The scanner from the repository root, with its allowlist: every page, script, source map and JSON file of the site.
const repository = fileURLToPath(new URL('../../', import.meta.url));
const scan = spawnSync(process.execPath, ['contract/scan.mjs', '--artifacts', path.relative(repository, dist), '--json'], { cwd: repository, encoding: 'utf8' });
assert.equal(scan.status, 0, `The snapshot scan of the site exits ${scan.status}: ${scan.stdout}${scan.stderr}`);
const scanned = JSON.parse(scan.stdout);
assert.equal(scanned.counts.allowed, Object.keys(pages).length, 'The scan finds exactly the demo snapshots');

const intro = await readFile(path.join(dist, 'introduction.html'), 'utf8');
assert.ok(intro.includes('/edit/main/docs/introduction.md'), 'Edit links point at docs/');
console.log(`Checked ${checked} production links and assets, ${output.size} entries, ${Object.keys(pages).length} demo pages, and ${scanned.counts.files} files for snapshots.`);
