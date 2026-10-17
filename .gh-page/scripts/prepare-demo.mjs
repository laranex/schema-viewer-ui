// Copies the built standalone viewer (../dist/viewer) into public/demo with one page per synthetic contract fixture.
// Build the package first (npm run build in the repository root). Only synthetic fixtures are published. Also writes
// public/logo.svg from the viewer's favicon.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const demoDirectory = new URL('../public/demo/', import.meta.url);
const viewer = new URL('../../dist/viewer/', import.meta.url);
const fixtures = new URL('../../contract/fixtures/valid/', import.meta.url);

export const pages = {
    'index.html': ['combined-eloquent', 'Blog · combined (Eloquent)'],
    'drift.html': ['combined-drift', 'Drift · combined (SQLAlchemy)'],
    'shop.html': ['declared-sqlalchemy', 'Shop · declared (SQLAlchemy)'],
    'postgresql.html': ['database-postgresql-indexes', 'PostgreSQL indexes'],
    'mysql.html': ['database-mysql-indexes', 'MySQL indexes'],
    'sqlite.html': ['database-sqlite-indexes', 'SQLite indexes'],
    'connections.html': ['combined-multi-connection', 'Three connections · combined (Eloquent)'],
    'compare.html': ['comparison-tenant-schemas', 'Tenant schemas compared · database'],
    'compare-incomplete.html': ['comparison-incomplete', 'Incomplete comparison · database'],
    'migrations.html': ['migrations-alembic', 'Alembic migration status · database'],
    'inferred.html': ['inferred-associations', 'Inferred associations · combined (SQLAlchemy)'],
};

export async function prepareDemo() {
    if (!existsSync(new URL('app.js', viewer))) {
        throw new Error('dist/viewer is missing; run npm run build in the repository root first');
    }
    await rm(demoDirectory, { recursive: true, force: true });
    await mkdir(new URL('snapshots/', demoDirectory), { recursive: true });
    for (const name of ['app.js', 'app.css', 'assets', 'favicon.svg', 'favicon.ico', 'manifest.json']) {
        await cp(new URL(name, viewer), new URL(name, demoDirectory), { recursive: true });
    }
    // The site's logo and favicon are the viewer's favicon: the brand mark from src/viewer/brand.ts.
    await cp(new URL('favicon.svg', viewer), new URL('../public/logo.svg', import.meta.url));
    const template = await readFile(new URL('index.html', viewer), 'utf8');
    if (!template.includes('data-snapshot-url="snapshot.json"')) {
        throw new Error('The viewer page changed how it loads the snapshot; update prepare-demo.mjs');
    }
    for (const [page, [fixture, title]] of Object.entries(pages)) {
        await writeFile(new URL(`snapshots/${fixture}.json`, demoDirectory), await readFile(new URL(`${fixture}.json`, fixtures)));
        const html = template
            .replace('data-snapshot-url="snapshot.json"', `data-snapshot-url="snapshots/${fixture}.json"`)
            .replace('<title>Laranex Schema Viewer</title>', `<title>${title} · Laranex Schema Viewer</title>`);
        await writeFile(new URL(page, demoDirectory), html);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await prepareDemo();
    console.log(`Prepared ${Object.keys(pages).length} demo pages from the built viewer`);
}
