// Packs the package, installs the tarball into a temporary project, and checks what consumers get: the exports resolve,
// the contract runs in Node.js, the standalone viewer and contract artifacts are present and match the manifest, and
// publint finds no problems. Run after npm run build.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', shell: process.platform === 'win32' });
const fail = (message) => {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
};

const work = mkdtempSync(join(tmpdir(), 'lsv-package-'));
try {
    const [{ filename }] = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', work], root));
    const tarball = join(work, filename);
    const project = join(work, 'consumer');
    run('node', ['-e', `require('fs').mkdirSync(${JSON.stringify(project)})`], work);
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
    run(npm, ['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball, 'react@19', 'react-dom@19'], project);

    const installed = join(project, 'node_modules/laranex-schema-viewer-ui');
    const script = `
        import { validateDocument, buildGraph, canonicalJson, compareScopes, expandComparisonRequests, gateDocument, storeComparisons, FORMAT } from 'laranex-schema-viewer-ui/contract';
        import { readFileSync } from 'node:fs';
        import { createRequire } from 'node:module';
        const require = createRequire(import.meta.url);
        const fixture = JSON.parse(readFileSync(require.resolve('laranex-schema-viewer-ui/contract/fixtures/valid/combined-eloquent.json'), 'utf8'));
        const result = validateDocument(fixture, { strict: true });
        if (!result.ok) throw new Error(result.errors.join('; '));
        if (canonicalJson(buildGraph(fixture).links) !== canonicalJson(fixture.links)) throw new Error('graph differs');
        const tenants = JSON.parse(readFileSync(require.resolve('laranex-schema-viewer-ui/contract/fixtures/valid/comparison-tenant-schemas.json'), 'utf8'));
        const c = tenants.comparisons[0];
        if (canonicalJson(compareScopes(tenants, c.baseline, c.target)) !== canonicalJson(c)) throw new Error('comparison differs');
        const expansion = JSON.parse(readFileSync(require.resolve('laranex-schema-viewer-ui/contract/conformance/requests/duplicates.json'), 'utf8'));
        if (canonicalJson(expandComparisonRequests(expansion.input.document, expansion.input.requests)) !== canonicalJson(expansion.expected)) throw new Error('request expansion differs');
        const store = JSON.parse(readFileSync(require.resolve('laranex-schema-viewer-ui/contract/conformance/store/replace.json'), 'utf8'));
        if (canonicalJson(storeComparisons(store.input.document, store.input.comparisons)) !== canonicalJson(store.expected.document)) throw new Error('stored comparisons differ');
        const gate = JSON.parse(readFileSync(require.resolve('laranex-schema-viewer-ui/contract/conformance/gate/requested-wildcard.json'), 'utf8'));
        if (canonicalJson(gateDocument(gate.input.document, gate.input)) !== canonicalJson(gate.expected)) throw new Error('gate report differs');
        const { EXPORTERS, dbml, exportFileName } = await import('laranex-schema-viewer-ui/export');
        const exported = dbml.export(fixture);
        if (EXPORTERS.length !== 4 || !exported.content.includes('Ref ') || !Array.isArray(exported.warnings)) throw new Error('export');
        if (exportFileName(fixture, 'dbml') !== 'schema-mysql.dbml') throw new Error('export file name');
        const schema = require('laranex-schema-viewer-ui/schema.json');
        if (!schema.$id || FORMAT !== 'laranex-schema') throw new Error('schema export');
        require.resolve('laranex-schema-viewer-ui/viewer/app.js');
        require.resolve('laranex-schema-viewer-ui/styles.css');
        console.log('ok');
    `;
    writeFileSync(join(project, 'check.mjs'), script);
    if (run('node', ['check.mjs'], project).trim() !== 'ok') {
        fail('the installed contract did not run');
    }

    const manifest = JSON.parse(readFileSync(join(installed, 'dist/viewer/manifest.json'), 'utf8'));
    for (const file of manifest.files) {
        const path = join(installed, 'dist/viewer', file.path);
        if (!existsSync(path)) {
            fail(`missing ${file.path}`);
            continue;
        }
        if (createHash('sha256').update(readFileSync(path)).digest('hex') !== file.sha256) {
            fail(`${file.path} does not match the manifest`);
        }
    }
    for (const icon of ['favicon.svg', 'favicon.ico']) {
        if (!manifest.files.some((f) => f.path === icon)) {
            fail(`the manifest does not list ${icon}`);
        }
    }
    const page = readFileSync(join(installed, 'dist/viewer/index.html'), 'utf8');
    if (!page.includes('<link rel="icon" href="favicon.svg" type="image/svg+xml">') || !page.includes('<link rel="icon" href="favicon.ico" sizes="32x32">')) {
        fail('index.html does not link the favicon by relative URLs');
    }
    for (const required of ['dist/viewer/index.html', 'dist/viewer/app.js', 'dist/viewer/app.css', 'contract/schema.json', 'contract/gate-report.schema.json', 'contract/check.mjs', 'contract/conformance/graph', 'contract/conformance/comparison', 'contract/conformance/migrations', 'contract/conformance/inference', 'contract/conformance/gate', 'docs/contract.md', 'LICENSE', 'NOTICE']) {
        if (!existsSync(join(installed, required))) {
            fail(`missing ${required}`);
        }
    }
    if (existsSync(join(installed, 'src')) || existsSync(join(installed, 'tests'))) {
        fail('sources or tests were packed');
    }

    run('npx', ['--no-install', 'publint', '--strict', root], root);
    if (!process.exitCode) {
        console.log(`✓ ${filename}: exports, contract, ${manifest.files.length} viewer files and artifacts check out`);
    }
} finally {
    rmSync(work, { recursive: true, force: true });
}
