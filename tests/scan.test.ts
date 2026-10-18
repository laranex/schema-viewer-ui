// @vitest-environment node
import Ajv2020 from 'ajv/dist/2020.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    allowlistDigest,
    allowlistJsonSchema,
    canonicalJson,
    resolveAllowlist,
    scanContent,
    scanFiles,
    scanReportJsonSchema,
    validateAllowlist,
    validateScanReport,
    type ScanReport,
} from '../src/contract';
import { SCAN_CASES, type ScanCase } from './fixtures/scan-cases';
import { VALID } from './fixtures/documents';
import { root } from './helpers';

const ajv = new Ajv2020({ strict: true, allErrors: true });
const reportSchema = ajv.compile(scanReportJsonSchema());
const allowlistSchema = ajv.compile(allowlistJsonSchema());

const bytesOf = (f: ScanCase['input']['files'][number]) => new Uint8Array(f.contentBase64 !== undefined ? Buffer.from(f.contentBase64, 'base64') : Buffer.from(f.content ?? '', 'utf8'));

// What every implementation does with a case: resolve the allowlist from the case's files, scan, report.
function runCase(c: ScanCase): ScanReport {
    const allowlist =
        c.input.allowlist === null
            ? null
            : resolveAllowlist(c.input.allowlist, (path) => {
                  if (!(path in c.input.allowlists)) {
                      throw new Error('missing');
                  }
                  return c.input.allowlists[path];
              });
    return scanFiles({ scopes: c.input.scopes, files: c.input.files.map((f) => ({ scope: f.scope, path: f.path, commit: f.commit, bytes: bytesOf(f) })), allowlist, limit: c.input.limit ?? undefined });
}

describe('scan conformance', () => {
    for (const [name, c] of Object.entries(SCAN_CASES)) {
        it(`${name}: ${c.description}`, () => {
            expect(validateScanReport(c.expected, { strict: true }).errors).toEqual([]);
            expect(reportSchema(c.expected), JSON.stringify(reportSchema.errors)).toBe(true);
            expect(runCase(c)).toEqual(c.expected);
        });
    }

    it('reads the committed cases as written', () => {
        for (const name of Object.keys(SCAN_CASES)) {
            const c = JSON.parse(readFileSync(root('contract/conformance/scan', `${name}.json`), 'utf8')) as ScanCase;
            expect(runCase(c), name).toEqual(c.expected);
        }
    });

    it('covers every exit code, status and reason', () => {
        const reports = Object.values(SCAN_CASES).map((c) => c.expected);
        expect(new Set(reports.map((r) => r.exitCode))).toEqual(new Set([0, 1, 2, 3]));
        const findings = reports.flatMap((r) => r.findings);
        expect(new Set(findings.map((f) => f.status))).toEqual(new Set(['allowed', 'confirmed', 'incomplete', 'moved', 'stale', 'tampered', 'uncertain']));
        expect(new Set(findings.map((f) => f.reason))).toEqual(
            new Set(['document', 'embedded_json', 'laravel_envelope', 'missing_connections', 'nested_document', 'nested_legacy', 'not_detected', 'not_found', 'object_literal', 'size_limit', 'unparseable_json', 'viewer_global', 'viewer_v1']),
        );
    });

    it('never echoes file content into a report', () => {
        for (const c of Object.values(SCAN_CASES)) {
            for (const f of c.expected.findings) {
                expect(Object.values(f).every((v) => v === null || !/[{}"<]/.test(String(v)))).toBe(true);
            }
        }
    });
});

describe('scanContent', () => {
    const doc = new TextEncoder().encode(canonicalJson(VALID['combined-eloquent']()));

    it('classifies by content, not by file name', () => {
        expect(scanContent('anything.json', doc)).toEqual({ kind: 'document', reason: 'document' });
        expect(scanContent('ANY.JSON', doc)).toEqual({ kind: 'document', reason: 'document' });
        expect(scanContent('schema-viewer.json', new TextEncoder().encode('{"name":"schema-viewer"}'))).toBeNull();
    });

    it('reads only JSON and HTML in the tree, and JavaScript and source maps in artifacts too', () => {
        const literal = new TextEncoder().encode('const d={format:"laranex-schema",version:"2.0",connections:[]};');
        for (const ext of ['.js', '.mjs', '.cjs', '.map']) {
            expect(scanContent(`a${ext}`, literal, { mode: 'tree' }), ext).toBeNull();
            expect(scanContent(`a${ext}`, literal, { mode: 'artifact' })?.kind, ext).toBe('embedded');
        }
        for (const path of ['a.ts', 'a.md', 'a.txt', 'a.svg', 'json', '.json']) {
            expect(scanContent(path, doc, { mode: 'artifact' }), path).toBeNull();
        }
    });

    it('reports a file over the limit as too large without reading it', () => {
        expect(scanContent('a.json', doc, { limit: 10 })).toEqual({ kind: 'too_large', reason: 'size_limit' });
    });

    it('does not decode compressed or encoded payloads', () => {
        const encoded = Buffer.from(canonicalJson(VALID['combined-eloquent']())).toString('base64');
        expect(scanContent('export.html', new TextEncoder().encode(`<script type="application/octet-stream" id="schema-viewer-config">${encoded}</script>`))).toBeNull();
    });

    it('never throws on arbitrary bytes', () => {
        for (const bytes of [new Uint8Array([0xff, 0xfe, 0x00, 0x7b]), new Uint8Array(0), new TextEncoder().encode('{"format":"laranex-schema"'), new TextEncoder().encode('[[[[[[[[[[[[[[[[[[]]]]]]]]]]]]]]]]]]')]) {
            expect(() => scanContent('x.json', bytes)).not.toThrow();
            expect(() => scanContent('x.html', bytes)).not.toThrow();
        }
    });
});

describe('allowlists', () => {
    it('digests bytes with CRLF read as LF', () => {
        const lf = new TextEncoder().encode('a\nb\r\nc\r');
        expect(allowlistDigest(lf)).toBe(createHash('sha256').update('a\nb\nc\r').digest('hex'));
        expect(allowlistDigest(new Uint8Array(0))).toBe(createHash('sha256').update('').digest('hex'));
    });

    it('the generated allowlists pass validation and their JSON Schema', () => {
        for (const file of ['contract/synthetic.json', '.laranex-schema-allowlist.json']) {
            const value = JSON.parse(readFileSync(root(file), 'utf8'));
            expect(validateAllowlist(value).errors, file).toEqual([]);
            expect(allowlistSchema(value), JSON.stringify(allowlistSchema.errors)).toBe(true);
        }
    });

    it('rejects what is not a plain relative POSIX path, a digest or a known property', () => {
        const entry = { path: 'a/b.json', sha256: '0'.repeat(64) };
        const list = (entries: unknown[], extra: object = {}) => ({ format: 'laranex-schema-allowlist', version: '1.0', entries, ...extra });
        for (const path of ['/abs.json', '../up.json', 'a/../b.json', './a.json', 'a//b.json', 'a\\b.json', 'dir/', '']) {
            const value = list([{ ...entry, path }]);
            expect(validateAllowlist(value).ok, path).toBe(false);
            expect(allowlistSchema(value), path).toBe(false);
        }
        for (const value of [list([{ ...entry, sha256: 'ABC' }]), list([entry], { extra: true }), { ...list([entry]), version: '1.1' }, list([entry, entry]), list([], { include: [{ path: 'x.json', root: '/' }] })]) {
            expect(validateAllowlist(value).ok, JSON.stringify(value)).toBe(false);
        }
        expect(validateAllowlist(list([entry, { ...entry, sha256: '1'.repeat(64) }], { include: [{ path: '.hidden/x.json', root: '.' }] })).errors).toEqual([]);
    });

    it('composes the roots of nested includes', () => {
        const files: Record<string, unknown> = {
            'a.json': { format: 'laranex-schema-allowlist', version: '1.0', entries: [], include: [{ path: 'b/b.json', root: 'one' }] },
            'b/b.json': { format: 'laranex-schema-allowlist', version: '1.0', entries: [{ path: 'x.json', sha256: '0'.repeat(64) }], include: [{ path: 'c.json', root: 'two' }] },
            'b/c.json': { format: 'laranex-schema-allowlist', version: '1.0', entries: [{ path: 'y.json', sha256: '0'.repeat(64) }] },
        };
        expect(resolveAllowlist('a.json', (p) => files[p])).toEqual({
            entries: [
                { path: 'one/two/y.json', sha256: '0'.repeat(64) },
                { path: 'one/x.json', sha256: '0'.repeat(64) },
            ],
            errors: [],
        });
    });
});

// The command line on temporary Git repositories, run in-process on the sources.
describe('scan.mjs', () => {
    type Run = (argv: string[], options: { cwd: string; stdout: { write: (s: string) => void }; stderr: { write: (s: string) => void }; limit?: number }) => number;
    let run: Run;
    let work: string;
    const SECRET = 'secret_payroll_table';
    const documentText = canonicalJson({ ...VALID['database-sqlite-indexes'](), note: SECRET });
    const fragmentText = `<pre>{"format":"laranex-schema","version":"2.0","note":"${SECRET}"}</pre>\n`;

    beforeAll(async () => {
        ({ run } = (await import(/* @vite-ignore */ root('contract/scan.mjs'))) as { run: Run });
        work = mkdtempSync(join(tmpdir(), 'lsv-scan-'));
    });
    afterAll(() => rmSync(work, { recursive: true, force: true }));

    let n = 0;
    const repo = (files: Record<string, string> = {}) => {
        const dir = join(work, `repo-${n++}`);
        mkdirSync(dir);
        git(dir, 'init', '-q', '-b', 'main');
        write(dir, files);
        return dir;
    };
    const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
    const write = (dir: string, files: Record<string, string>) => {
        for (const [path, content] of Object.entries(files)) {
            mkdirSync(dirname(join(dir, path)), { recursive: true });
            writeFileSync(join(dir, path), content);
        }
    };
    const commit = (dir: string, message = 'c') => {
        git(dir, 'add', '-A');
        git(dir, 'commit', '-q', '--allow-empty', '-m', message);
        return git(dir, 'rev-parse', 'HEAD').trim();
    };
    const scan = (cwd: string, argv: string[], limit?: number) => {
        let out = '';
        let err = '';
        const code = run([...argv, '--json'], { cwd, stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) }, limit });
        const report = out ? (JSON.parse(out) as ScanReport) : null;
        if (report) {
            expect(validateScanReport(report, { strict: true }).errors).toEqual([]);
            expect(reportSchema(report), JSON.stringify(reportSchema.errors)).toBe(true);
            expect(out).not.toContain(SECRET);
            expect(report.exitCode).toBe(code);
        }
        expect(err).not.toContain(SECRET);
        return { code, report: report as ScanReport, err };
    };
    const summary = (report: ScanReport) => report.findings.map((f) => `${f.scope} ${f.status} ${f.path}${f.commit ? `@${f.commit.slice(0, 7)}` : ''}`);
    const digest = (text: string) => createHash('sha256').update(text).digest('hex');
    const allow = (entries: [string, string][], include?: unknown) => JSON.stringify({ format: 'laranex-schema-allowlist', version: '1.0', entries: entries.map(([path, text]) => ({ path, sha256: digest(text) })), ...(include ? { include } : {}) });

    it('finds a tracked snapshot, also one tracked before it was ignored', () => {
        const dir = repo({ 'build/schema-viewer.json': documentText, 'package.json': '{"name":"x"}' });
        commit(dir);
        write(dir, { '.gitignore': 'build/\n' });
        commit(dir);
        const { code, report } = scan(dir, ['--tracked']);
        expect(code).toBe(1);
        expect(summary(report)).toEqual(['tracked confirmed build/schema-viewer.json']);
        expect(report.findings[0]).toMatchObject({ kind: 'document', reason: 'document', commit: null, sha256: digest(documentText) });
        expect(report.counts.files).toBe(2);
    });

    it('reads the staged bytes, not the working tree', () => {
        const dir = repo({ 'a.json': documentText, 'b.json': '{}' });
        git(dir, 'add', '-A');
        write(dir, { 'a.json': '{}', 'b.json': documentText });
        expect(summary(scan(dir, ['--tracked']).report)).toEqual(['tracked confirmed a.json']);
    });

    it('finds untracked files Git would add, and leaves ignored ones to the artifact scope', () => {
        const dir = repo({ '.gitignore': '/dist/\n/ignored.json\n', 'new.json': documentText, 'ignored.json': documentText, 'dist/app.js': `const d=JSON.parse(${JSON.stringify(JSON.stringify(VALID['database-sqlite-indexes']()))});` });
        commit(dir);
        write(dir, { 'later.json': documentText });
        const { code, report } = scan(dir, ['--untracked']);
        expect(code).toBe(1);
        expect(summary(report)).toEqual(['untracked confirmed later.json']);
        expect(summary(scan(dir, ['--tracked', '--untracked', '--artifacts', 'dist']).report)).toEqual(['artifacts confirmed dist/app.js', 'untracked confirmed later.json', 'tracked confirmed new.json']);
    });

    it('scans artifact directories without ignore rules, from any directory, with or without Git', () => {
        const plain = join(work, 'plain');
        write(plain, { 'out/deep/page.html': `<script>window.__SCHEMA_VIEWER__ = ${JSON.stringify({ document: VALID['database-sqlite-indexes']() })};</script>`, 'out/app.js.map': '{}' });
        const { code, report } = scan(plain, ['--artifacts', 'out']);
        expect(code).toBe(1);
        expect(report.findings.map((f) => [f.path, f.reason])).toEqual([['out/deep/page.html', 'viewer_global']]);
        expect(scan(join(plain, 'out'), ['--artifacts', '.']).report.findings.map((f) => f.path)).toEqual(['deep/page.html']);
        expect(scan(plain, ['--artifacts', 'missing'])).toMatchObject({ code: 2, report: { errors: [{ kind: 'artifact_missing', message: 'The artifact directory missing does not exist.' }] } });
    });

    it('does not follow a symbolic link to a directory: the scan is incomplete', () => {
        const dir = join(work, 'links');
        write(dir, { 'target/a.json': '{}', 'out/x.json': '{}' });
        symlinkSync(join(dir, 'target'), join(dir, 'out/linked'));
        const { code, report } = scan(dir, ['--artifacts', 'out']);
        expect(code).toBe(2);
        expect(report.findings).toEqual([{ scope: 'artifacts', status: 'incomplete', kind: 'unreadable', path: 'out/linked', commit: null, sha256: null, reason: 'symlinked_directory' }]);
    });

    it('scans the history on request, naming the commit, and refuses a shallow clone', () => {
        const dir = repo({ 'old.json': documentText });
        const first = commit(dir);
        rmSync(join(dir, 'old.json'));
        commit(dir);
        expect(scan(dir, ['--tracked']).code).toBe(0);
        const { code, report } = scan(dir, ['--history']);
        expect(code).toBe(1);
        expect(report.findings).toEqual([{ scope: 'history', status: 'confirmed', kind: 'document', path: 'old.json', commit: first, sha256: digest(documentText), reason: 'document' }]);
        const shallow = join(work, `shallow-${n++}`);
        execFileSync('git', ['clone', '-q', '--depth', '1', `file://${dir}`, shallow]);
        expect(scan(shallow, ['--history'])).toMatchObject({ code: 2, report: { errors: [{ kind: 'history_unavailable' }] } });
    });

    it('finds blobs only a branch or a merge holds', () => {
        const dir = repo({ 'a.json': '{}' });
        commit(dir);
        git(dir, 'checkout', '-q', '-b', 'side');
        write(dir, { 'side.json': documentText });
        const side = commit(dir);
        git(dir, 'checkout', '-q', 'main');
        expect(summary(scan(dir, ['--history']).report)).toEqual([`history confirmed side.json@${side.slice(0, 7)}`]);
    });

    it('applies the allowlist: allowed, tampered, moved and stale', () => {
        const dir = repo({ 'fixtures/a.json': documentText, '.laranex-schema-allowlist.json': allow([['fixtures/a.json', documentText], ['fixtures/gone.json', documentText]]) });
        commit(dir);
        const ok = scan(dir, ['--tracked', '--untracked']);
        expect(ok.code).toBe(0);
        expect(summary(ok.report)).toEqual(['tracked allowed fixtures/a.json', 'allowlist stale fixtures/gone.json']);
        write(dir, { 'fixtures/a.json': documentText.replace('sqlite', 'mysql') });
        expect(summary(scan(dir, ['--tracked']).report)).toEqual(['tracked allowed fixtures/a.json']);
        git(dir, 'add', '-A');
        expect(scan(dir, ['--tracked'])).toMatchObject({ code: 1, report: { counts: { tampered: 1 } } });
        git(dir, 'mv', 'fixtures/a.json', 'b.json');
        git(dir, 'checkout', 'HEAD', '--', 'fixtures/a.json');
        write(dir, { 'b.json': documentText });
        git(dir, 'add', '-A');
        expect(summary(scan(dir, ['--tracked']).report)).toEqual(['tracked moved b.json', 'tracked allowed fixtures/a.json']);
    });

    it('takes another allowlist, with includes under a root, and fails closed on an invalid one', () => {
        const dir = repo({
            'vendor/pkg/contract/fixtures/x.json': documentText,
            'ci/allow.json': allow([], [{ path: '../vendor/pkg/contract/synthetic.json', root: 'vendor/pkg' }]),
            'ci/vendor.json': allow([], [{ path: 'pkg/synthetic.json', root: 'vendor/pkg' }]),
            'ci/pkg/synthetic.json': allow([['contract/fixtures/x.json', documentText]]),
            'broken.json': '{"format":"laranex-schema-allowlist"}',
        });
        commit(dir);
        expect(scan(dir, ['--tracked', '--allowlist', 'ci/vendor.json']).code).toBe(0);
        expect(scan(dir, ['--tracked', '--allowlist', 'ci/allow.json']).report.errors.map((e) => e.kind)).toEqual(['allowlist_invalid']);
        expect(scan(dir, ['--tracked', '--allowlist', 'broken.json'])).toMatchObject({ code: 2, report: { counts: { confirmed: 1 } } });
        expect(scan(dir, ['--tracked', '--allowlist', 'nowhere.json']).code).toBe(2);
    });

    it('exits 3 for uncertain findings, 1 when a confirmed one is beside them, and 2 for an incomplete scan', () => {
        const dir = repo({ 'docs/page.html': fragmentText });
        commit(dir);
        expect(scan(dir, ['--tracked']).code).toBe(3);
        write(dir, { 'b.json': documentText });
        expect(scan(dir, ['--tracked', '--untracked']).code).toBe(1);
        const big = scan(dir, ['--tracked', '--untracked'], 50);
        expect(big.code).toBe(2);
        expect(summary(big.report)).toEqual(['untracked incomplete b.json', 'tracked incomplete docs/page.html']);
        expect(big.report.findings.every((f) => f.kind === 'too_large' && f.sha256 === null)).toBe(true);
    });

    it('fails outside a Git work tree and on usage errors, and prints only counts', () => {
        const plain = join(work, `plain-${n++}`);
        mkdirSync(plain);
        expect(scan(plain, ['--tracked'])).toMatchObject({ code: 2, report: { errors: [{ kind: 'not_a_repository' }] } });
        expect(scan(plain, []).code).toBe(2);
        expect(scan(plain, ['--bogus']).code).toBe(2);
        const dir = repo({ 'a.json': documentText });
        commit(dir);
        let out = '';
        const reportFile = join(work, 'report.json');
        expect(run(['--tracked', '--report', reportFile], { cwd: dir, stdout: { write: (s) => (out += s) }, stderr: { write: () => undefined } })).toBe(1);
        expect(out).toBe('laranex-schema-scan: 1 files (tracked); 1 confirmed, 0 tampered, 0 moved, 0 uncertain, 0 incomplete, 0 allowed, 0 stale; exit 1\n');
        const report = JSON.parse(readFileSync(reportFile, 'utf8'));
        expect(summary(report)).toEqual(['tracked confirmed a.json']);
        expect(readFileSync(reportFile, 'utf8')).not.toContain(SECRET);
    });

    it('passes on this repository with its allowlist', () => {
        expect(summary(scan(root(), ['--tracked']).report).filter((f) => !f.startsWith('tracked allowed'))).toEqual([]);
    });
});
