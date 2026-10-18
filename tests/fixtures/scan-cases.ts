import { createHash } from 'node:crypto';
import { gateReportJsonSchema } from '../../src/contract/gate';
import { jsonSchema } from '../../src/contract/document';
import { SCAN_SIZE_LIMIT, type ScanFinding, type ScanReport, type ScanScope } from '../../src/contract/scan';
import { canonicalJson } from '../../src/contract/serialize';
import { GATE_VALID } from './gate';
import { VALID } from './documents';

// Snapshot-scan conformance cases, written to contract/conformance/scan/<name>.json. Every content is synthetic and
// held as a string (or base64), so a case file is itself no snapshot. The expected findings are written by hand; the
// digests are computed here with node:crypto, independently of allowlistDigest().

export type ScanCaseFile = { scope: ScanScope; path: string; commit: string | null; content?: string; contentBase64?: string };
export type ScanCase = {
    description: string;
    input: {
        scopes: ScanScope[];
        // The size limit to apply, null for the default.
        limit: number | null;
        files: ScanCaseFile[];
        // The allowlist to resolve (a key of allowlists), or null for none.
        allowlist: string | null;
        // Allowlist files by POSIX path; an include names one by its path joined to the including file's directory.
        allowlists: Record<string, unknown>;
    };
    expected: ScanReport;
};

const FORMAT = 'laranex-schema';
const digest = (content: string) => createHash('sha256').update(content.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
const minimal = (version = '2.0') => ({ format: FORMAT, version, source: 'database', generator: { name: 'synthetic', orm: null }, note: null, connections: [] });
const compact = (value: unknown) => JSON.stringify(value);
const canonical = canonicalJson(VALID['database-sqlite-indexes']());
const COMMIT_A = '1'.repeat(40);
const COMMIT_B = '2'.repeat(40);

type File = Omit<ScanCaseFile, 'commit'> & { commit?: string | null };
type Expect = Omit<ScanFinding, 'commit' | 'sha256'> & { commit?: string | null; content?: string | null; sha256?: string | null };

const file = (scope: ScanScope, path: string, content: string, commit: string | null = null): File => ({ scope, path, content, commit });
const found = (f: File, status: ScanFinding['status'], kind: ScanFinding['kind'], reason: ScanFinding['reason']): Expect => ({ scope: f.scope, status, kind, reason, path: f.path, commit: f.commit ?? null, content: f.content });
const allowlist = (entries: { path: string; content: string }[], include?: { path: string; root: string }[]) => ({
    format: 'laranex-schema-allowlist',
    version: '1.0',
    entries: entries.map((e) => ({ path: e.path, sha256: digest(e.content) })),
    ...(include ? { include } : {}),
});

const byList = (a: string[], b: string[]) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) {
            return a[i] < b[i] ? -1 : 1;
        }
    }
    return a.length - b.length;
};

function scanCase(
    description: string,
    files: File[],
    findings: Expect[],
    exitCode: ScanReport['exitCode'],
    options: { allowlist?: string; allowlists?: Record<string, unknown>; limit?: number; errors?: ScanReport['errors']; scopes?: ScanScope[]; counted?: number } = {},
): ScanCase {
    const expected: ScanFinding[] = findings
        .map((f) => ({ scope: f.scope, status: f.status, kind: f.kind, path: f.path, commit: f.commit ?? null, sha256: f.sha256 !== undefined ? f.sha256 : f.content == null ? null : digest(f.content), reason: f.reason }))
        .sort((a, b) => byList([a.path, a.commit ?? '', a.scope, a.status, a.reason], [b.path, b.commit ?? '', b.scope, b.status, b.reason]));
    const by = (s: ScanFinding['status']) => expected.filter((f) => f.status === s).length;
    const scopes = options.scopes ?? [...new Set(files.map((f) => f.scope))].sort();
    return {
        description,
        input: {
            scopes,
            limit: options.limit ?? null,
            files: files.map((f) => ({ ...f, commit: f.commit ?? null })),
            allowlist: options.allowlist ?? null,
            allowlists: options.allowlists ?? {},
        },
        expected: {
            format: 'laranex-schema-scan',
            version: '1.0',
            exitCode,
            scopes,
            limit: options.limit ?? SCAN_SIZE_LIMIT,
            counts: { files: options.counted ?? files.length, confirmed: by('confirmed'), tampered: by('tampered'), moved: by('moved'), uncertain: by('uncertain'), allowed: by('allowed'), incomplete: by('incomplete'), stale: by('stale') },
            findings: expected,
            errors: options.errors ?? [],
        },
    };
}

// Positives.
const canonicalFile = file('tracked', 'build/schema-viewer.json', canonical);
const compactFile = file('untracked', 'schema-viewer.json', compact(VALID['database-sqlite-indexes']()));
const v10 = file('tracked', 'storage/schema-1.0.json', compact(minimal('1.0')));
const v30 = file('tracked', 'storage/schema-3.0.json', `${JSON.stringify(minimal('3.0'), null, 4)}\n`);
const pythonV1 = file('tracked', 'build/schema.json', compact({ format: `${FORMAT}-viewer`, version: 1, generator: 'python', tables: [{ name: 'users', columns: [] }] }));
const nodeV1 = file('untracked', 'snapshots/node.json', `${JSON.stringify({ format: `${FORMAT}-viewer`, version: 1, tables: [] }, null, 2)}\n`);
const envelope = file('tracked', 'storage/app/schema-viewer.json', compact({ format: 2, document: { version: 2, connections: [{ name: 'mysql', tables: [] }] } }));
const depth3 = file('tracked', 'tests/data/wrapped.json', compact({ a: { b: { c: minimal() } } }));
const inArray = file('tracked', 'tests/data/list.json', compact({ cases: [{}, { name: 'x' }, { document: minimal() }] }));
const nestedLegacy = file('tracked', 'backup.json', compact({ backup: { format: 2, document: { connections: [] } } }));
const bom = file('tracked', 'export.json', `\uFEFF${compact(minimal())}`);

// Negatives.
const packageJson = file('tracked', 'package.json', `${JSON.stringify({ name: 'app', version: '1.0.0', scripts: { schema: 'laranex-schema-viewer build' }, devDependencies: { 'laranex-schema-viewer-ui': '0.4.0' } }, null, 2)}\n`);
const composerJson = file('tracked', 'composer.json', `${JSON.stringify({ name: 'acme/app', require: { 'laranex/laravel-schema-viewer': '^1.0' }, extra: { laravel: { providers: [] } } }, null, 4)}\n`);
const packageLock = file('tracked', 'package-lock.json', `${JSON.stringify({ name: 'app', lockfileVersion: 3, packages: { 'node_modules/laranex-schema-viewer-ui': { version: '0.4.0', resolved: 'https://registry.npmjs.org/laranex-schema-viewer-ui/-/laranex-schema-viewer-ui-0.4.0.tgz' } } }, null, 2)}\n`);
const composerLock = file('tracked', 'composer.lock', `${JSON.stringify({ packages: [{ name: 'laranex/laravel-schema-viewer', version: '1.0.0', type: 'library' }] }, null, 4)}\n`);
const tsconfig = file('tracked', 'tsconfig.json', `${JSON.stringify({ compilerOptions: { strict: true, module: 'ESNext' }, include: ['src'] }, null, 2)}\n`);
const manifest = { name: 'laranex-schema-viewer-ui', version: '0.4.0', contract: { format: FORMAT, major: 2 }, entry: { script: 'app.js' }, files: [{ path: 'app.js', size: 1, sha256: '0'.repeat(64) }] };
const manifestJson = file('artifacts', 'public/schema-viewer/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
const manifestJs = file('artifacts', 'public/schema-viewer/boot.js', `const m={name:"laranex-schema-viewer-ui",contract:{format:"${FORMAT}",major:2},files:[]};const connections=[];export{m,connections};\n`);
const gateReport = file('tracked', 'reports/gate.json', canonicalJson(GATE_VALID.drift));
const documentSchema = file('tracked', 'vendor/contract/schema.json', `${JSON.stringify(jsonSchema(), null, 2)}\n`);
const gateSchema = file('tracked', 'vendor/contract/gate-report.schema.json', `${JSON.stringify(gateReportJsonSchema(), null, 2)}\n`);
const validatorCode = file(
    'artifacts',
    'dist/viewer/app.js',
    `function v(n){if(n.format!=="${FORMAT}")return{ok:!1,errors:["This is not a ${FORMAT} 2.x document"]};if(!Array.isArray(n.connections))throw new Error("connections");return{ok:!0}}const G={format:"${FORMAT}-gate",version:"1.0"};const s={"format":{"const":"${FORMAT}"},"connections":{"type":"array"}};\n`,
);

// Near misses.
const gateFormat = { format: `${FORMAT}-gate`, version: '1.0', connections: [] };
const gateJson = file('tracked', 'gate.json', compact(gateFormat));
const gateHtml = file('tracked', 'gate.html', `<!doctype html><script type="application/json">${compact(gateFormat)}</script>\n`);
const noConnections = { format: FORMAT, version: '2.0' };
const noConnectionsJson = file('tracked', 'meta.json', compact(noConnections));
const noConnectionsHtml = file('tracked', 'docs/meta.html', `<pre>${compact(noConnections)}</pre>\n`);
const numericVersion = file('tracked', 'numeric.json', compact({ ...minimal(), version: 2.0 }));
const contractFormat = file('tracked', 'contract.json', compact({ contract: { format: FORMAT, version: '2.0' }, connections: [] }));
const contractFormatHtml = file('tracked', 'contract.html', `<script>window.config = {"contract":{"format":"${FORMAT}","major":2},"connections":[]};</script>\n`);
const depth7 = file('tracked', 'deep.json', compact({ a: { b: { c: { d: { e: { f: { g: minimal() } } } } } } }));
const depth6 = file('tracked', 'deep6.json', compact({ a: { b: { c: { d: { e: { f: minimal() } } } } } }));
const jsInTree = file('tracked', 'src/fixtures.js', `export const doc = JSON.parse('${compact(minimal())}');\n`);

// Embedded.
const viewerConfig = { document: VALID['database-sqlite-indexes'](), changes: null, defaultConnection: null };
const offlineHtml = file(
    'tracked',
    'docs/schema-viewer.html',
    `<!doctype html><html><head><meta charset="utf-8"><script type="module">console.log(1)</script></head><body><div id="schema-viewer"></div><script type="application/json" id="schema-viewer-data">${compact(viewerConfig).replace(/</g, '\\u003c')}</script></body></html>\n`,
);
const parseBundle = file('artifacts', 'dist/assets/data-3f2a.js', `const e=JSON.parse(${JSON.stringify(compact(minimal()))});export{e as d};\n`);
const literalBundle = file('artifacts', 'dist/assets/index-9c1b.mjs', `const d={format:"${FORMAT}",version:"2.0",source:"database",connections:[{id:"connection:app",tables:[]}]};export{d};\n`);
const sourceMap = file(
    'artifacts',
    'dist/assets/index-9c1b.js.map',
    compact({ version: 3, sources: ['../src/data.ts'], sourcesContent: [`export const doc = ${compact(minimal())};\n`], mappings: 'AAAA' }),
);
const viewerGlobal = file('tracked', 'public/schema.html', `<!doctype html><script>window.__SCHEMA_VIEWER__ = {"document":${compact(minimal())},"editor":null};</script>\n`);
const viewerGlobalMissing = file('tracked', 'public/missing.html', `<!doctype html><script>window.__SCHEMA_VIEWER__ = {"missing":"Run the build command first"};</script>\n`);

// Uncertain.
const truncated = file('tracked', 'storage/partial.json', canonical.slice(0, Math.floor(canonical.length / 2)));
const truncatedTail = file('tracked', 'storage/tail.json', compact(minimal()).slice(0, -12));
const fragment = file('tracked', 'docs/fragment.html', `<pre>{"format": "${FORMAT}", "version": "2.0"}</pre>\n`);

// Allowlists.
const fixture = file('tracked', 'tests/fixtures/schema.json', canonical);
const crlfFixture = file('tracked', 'tests/fixtures/windows.json', canonical.replace(/\n/g, '\r\n'));
const tampered = file('tracked', 'tests/fixtures/schema.json', canonical.replace('"database"', '"declared"'));
const moved = file('tracked', 'tests/fixtures/elsewhere.json', canonical);
const cleaned = file('tracked', 'tests/fixtures/schema.json', '{"cleaned":true}\n');
const vendored = file('tracked', 'vendor/pkg/contract/fixtures/valid/schema.json', canonical);
const oversized = file('artifacts', 'dist/big.json', compact({ ...minimal(), note: 'x'.repeat(10000) }));

const ROOT = '.laranex-schema-allowlist.json';

export const SCAN_CASES: Record<string, ScanCase> = {
    'positive-canonical': scanCase('A canonical document is a confirmed exposure', [canonicalFile], [found(canonicalFile, 'confirmed', 'document', 'document')], 1),
    'positive-compact': scanCase('A compact document, found among the untracked files', [compactFile], [found(compactFile, 'confirmed', 'document', 'document')], 1),
    'positive-version-1-0': scanCase('Any major.minor version string matches: 1.0', [v10], [found(v10, 'confirmed', 'document', 'document')], 1),
    'positive-version-3-0': scanCase('Any major.minor version string matches: 3.0, four-space indented', [v30], [found(v30, 'confirmed', 'document', 'document')], 1),
    'positive-legacy-python-v1': scanCase('The Python v1 viewer format with its tables (legacy, temporary)', [pythonV1], [found(pythonV1, 'confirmed', 'legacy', 'viewer_v1')], 1),
    'positive-legacy-node-v1': scanCase('The Node.js v1 viewer format (legacy, temporary)', [nodeV1], [found(nodeV1, 'confirmed', 'legacy', 'viewer_v1')], 1),
    'positive-legacy-laravel-envelope': scanCase("Laravel's envelope, format 2 with document.connections (legacy, temporary)", [envelope], [found(envelope, 'confirmed', 'legacy', 'laravel_envelope')], 1),
    'positive-nested-depth-3': scanCase('A document three keys deep', [depth3], [found(depth3, 'confirmed', 'embedded', 'nested_document')], 1),
    'positive-nested-in-array': scanCase('A document inside an array, past its first items', [inArray], [found(inArray, 'confirmed', 'embedded', 'nested_document')], 1),
    'positive-nested-depth-6': scanCase('A document six keys deep, the deepest looked at', [depth6], [found(depth6, 'confirmed', 'embedded', 'nested_document')], 1),
    'positive-nested-legacy': scanCase("A nested Laravel envelope", [nestedLegacy], [found(nestedLegacy, 'confirmed', 'embedded', 'nested_legacy')], 1),
    'positive-byte-order-mark': scanCase('A document after a UTF-8 byte order mark', [bom], [found(bom, 'confirmed', 'document', 'document')], 1),

    'negative-package-manifests': scanCase('package.json, composer.json, their lock files and tsconfig.json that name the packages (composer.lock is not read: not .json)', [packageJson, composerJson, packageLock, composerLock, tsconfig], [], 0, { counted: 4 }),
    'negative-viewer-manifest': scanCase("The viewer's manifest.json names the format under contract, as JSON and inside a script", [manifestJson, manifestJs], [], 0),
    'negative-gate-report': scanCase('A laranex-schema-gate report is not a snapshot', [gateReport], [], 0),
    'negative-json-schemas': scanCase('The contract and gate report JSON Schemas say "format": { "const": … }', [documentSchema, gateSchema], [], 0),
    'negative-validator-code': scanCase("The viewer's minified validator compares the format and builds a JSON Schema, in a build artifact", [validatorCode], [], 0),

    'near-miss-gate-format': scanCase('laranex-schema-gate is not laranex-schema, in JSON and in HTML', [gateJson, gateHtml], [], 0),
    'near-miss-no-connections-json': scanCase('In JSON, the format without connections is not a document', [noConnectionsJson], [], 0),
    'near-miss-numeric-version': scanCase('A number as version is not a document', [numericVersion], [], 0),
    'near-miss-contract-format': scanCase("A nested contract.format (a manifest's) is not a document, in JSON and in HTML", [contractFormat, contractFormatHtml], [], 0),
    'near-miss-depth-7': scanCase('A document seven keys deep is past the depth looked at', [depth7], [], 0),
    'near-miss-javascript-in-tree': scanCase('JavaScript in the repository tree is not read; only build artifacts are', [jsInTree], [], 0, { counted: 0 }),
    'near-miss-viewer-global-without-schema': scanCase('window.__SCHEMA_VIEWER__ without schema data is clean', [viewerGlobalMissing], [], 0),

    'embedded-offline-html': scanCase("The shared viewer's offline page holds the document as plain JSON", [offlineHtml], [found(offlineHtml, 'confirmed', 'embedded', 'embedded_json')], 1),
    'embedded-json-parse-bundle': scanCase('A bundle with the document as a JSON.parse string', [parseBundle], [found(parseBundle, 'confirmed', 'embedded', 'embedded_json')], 1),
    'embedded-object-literal-bundle': scanCase('A bundle with the document inlined as an object literal', [literalBundle], [found(literalBundle, 'confirmed', 'embedded', 'object_literal')], 1),
    'embedded-source-map': scanCase("A source map's sourcesContent holds the document, escaped", [sourceMap], [found(sourceMap, 'confirmed', 'embedded', 'embedded_json')], 1),
    'embedded-viewer-global': scanCase('A page that assigns window.__SCHEMA_VIEWER__ a config with the document', [viewerGlobal], [found(viewerGlobal, 'confirmed', 'embedded', 'viewer_global')], 1),

    'uncertain-truncated-json': scanCase('Half of a canonical document is not JSON but shows its keys', [truncated], [found(truncated, 'uncertain', 'uncertain', 'unparseable_json')], 3),
    'uncertain-truncated-format': scanCase('A compact document cut short still has the format pair', [truncatedTail], [found(truncatedTail, 'uncertain', 'uncertain', 'unparseable_json')], 3),
    'uncertain-html-fragment': scanCase('In HTML, the format pair without connections', [noConnectionsHtml, fragment], [found(noConnectionsHtml, 'uncertain', 'uncertain', 'missing_connections'), found(fragment, 'uncertain', 'uncertain', 'missing_connections')], 3),

    'allowlist-exact': scanCase('A document listed with its path and digest is allowed', [fixture], [found(fixture, 'allowed', 'document', 'document')], 0, {
        allowlist: ROOT,
        allowlists: { [ROOT]: allowlist([fixture as { path: string; content: string }]) },
    }),
    'allowlist-crlf': scanCase('The digest reads CRLF as LF, so a Windows checkout matches', [crlfFixture], [found(crlfFixture, 'allowed', 'document', 'document')], 0, {
        allowlist: ROOT,
        allowlists: { [ROOT]: allowlist([{ path: crlfFixture.path, content: canonical }]) },
    }),
    'allowlist-tampered': scanCase('A listed path whose content changed is tampered: a confirmed exposure', [tampered], [found(tampered, 'tampered', 'document', 'document')], 1, {
        allowlist: ROOT,
        allowlists: { [ROOT]: allowlist([fixture as { path: string; content: string }]) },
    }),
    'allowlist-moved': scanCase('A listed digest at another path is moved: a confirmed exposure, and the entry at the clean path is stale', [moved, cleaned], [found(moved, 'moved', 'document', 'document'), { ...found(cleaned, 'stale', 'allowlist_entry', 'not_detected'), scope: 'allowlist', content: canonical }], 1, {
        allowlist: ROOT,
        allowlists: { [ROOT]: allowlist([fixture as { path: string; content: string }]) },
    }),
    'allowlist-stale-entry': scanCase('Entries that name a clean file or no file are stale: a warning, not a failure', [cleaned], [
        { ...found(cleaned, 'stale', 'allowlist_entry', 'not_detected'), scope: 'allowlist', content: canonical },
        { scope: 'allowlist', status: 'stale', kind: 'allowlist_entry', reason: 'not_found', path: 'tests/fixtures/gone.json', content: canonical },
    ], 0, {
        allowlist: ROOT,
        allowlists: { [ROOT]: allowlist([{ path: fixture.path, content: canonical }, { path: 'tests/fixtures/gone.json', content: canonical }]) },
    }),
    'allowlist-include-root': scanCase("An included allowlist's entries apply under its root", [vendored], [found(vendored, 'allowed', 'document', 'document')], 0, {
        allowlist: ROOT,
        allowlists: {
            [ROOT]: allowlist([], [{ path: 'vendor/pkg/contract/synthetic.json', root: 'vendor/pkg' }]),
            'vendor/pkg/contract/synthetic.json': allowlist([{ path: 'contract/fixtures/valid/schema.json', content: canonical }]),
        },
    }),
    'allowlist-invalid': scanCase('An invalid allowlist fails the scan, which still reports what it found', [fixture], [found(fixture, 'confirmed', 'document', 'document')], 2, {
        allowlist: ROOT,
        allowlists: { [ROOT]: { format: 'laranex-schema-allowlist', version: '1.0', entries: [{ path: '/abs/schema.json', sha256: digest(canonical) }] } },
        errors: [{ kind: 'allowlist_invalid', message: `Allowlist ${ROOT}: $.entries[0].path: "/abs/schema.json" does not match ^(?!/)(?!.*//)(?!.*/$)(?!(.*/)?\\.\\.?(/|$))[^\\\\\\u0000]+$` }],
    }),
    'allowlist-include-cycle': scanCase('An allowlist that includes itself fails the scan', [fixture], [found(fixture, 'allowed', 'document', 'document')], 2, {
        allowlist: ROOT,
        allowlists: { [ROOT]: allowlist([fixture as { path: string; content: string }], [{ path: ROOT, root: '.' }]) },
        errors: [{ kind: 'allowlist_invalid', message: `Allowlist ${ROOT} includes itself` }],
    }),
    'allowlist-missing-include': scanCase('An include that cannot be read fails the scan', [fixture], [found(fixture, 'confirmed', 'document', 'document')], 2, {
        allowlist: ROOT,
        allowlists: { [ROOT]: allowlist([], [{ path: 'missing.json', root: '.' }]) },
        errors: [{ kind: 'allowlist_invalid', message: 'Allowlist missing.json could not be read as JSON' }],
    }),

    'history-path-at-commit': scanCase(
        'History findings name the commit; an older version of an allowed file is tampered',
        [fixture, { ...tampered, scope: 'history', commit: COMMIT_A }, { ...canonicalFile, scope: 'history', commit: COMMIT_B }, { ...fixture, scope: 'history', commit: COMMIT_B }],
        [
            found(fixture, 'allowed', 'document', 'document'),
            found({ ...tampered, scope: 'history', commit: COMMIT_A }, 'tampered', 'document', 'document'),
            found({ ...canonicalFile, scope: 'history', commit: COMMIT_B }, 'moved', 'document', 'document'),
            found({ ...fixture, scope: 'history', commit: COMMIT_B }, 'allowed', 'document', 'document'),
        ],
        1,
        { allowlist: ROOT, allowlists: { [ROOT]: allowlist([fixture as { path: string; content: string }]) } },
    ),

    'precedence-clean': scanCase('Nothing found: exit 0', [packageJson], [], 0),
    'precedence-confirmed-over-uncertain': scanCase('A confirmed exposure beside an uncertain one exits 1', [canonicalFile, fragment], [found(canonicalFile, 'confirmed', 'document', 'document'), found(fragment, 'uncertain', 'uncertain', 'missing_connections')], 1),
    'precedence-incomplete-over-confirmed': scanCase('A file over the size limit makes the scan incomplete, which exits 2 whatever else was found', [canonicalFile, oversized], [found(canonicalFile, 'confirmed', 'document', 'document'), { ...found(oversized, 'incomplete', 'too_large', 'size_limit'), content: null }], 2, {
        limit: 9000,
    }),
};
