import { byCodePoint, byList } from './ids';
import { array, integer, literal, nullable, object, oneOf, string, type JsonSchema, type Shape } from './shape';
import { sha256Bytes } from './sha256';
import { FORMAT } from './types';

// Snapshot scanning: finds laranex-schema documents (and the legacy formats still in use) in files a repository tracks,
// files it would add, build artifacts and, optionally, its history, so a private schema is not committed or published
// by accident. docs/contract.md, "Snapshot scanning", is the normative description; contract/conformance/scan/ checks
// it. Everything here is pure: contract/scan.mjs reads Git and the file system and hands the bytes to scanFiles().

export const SCAN_FORMAT = 'laranex-schema-scan';
export const SCAN_VERSION = '1.0';
export const ALLOWLIST_FORMAT = 'laranex-schema-allowlist';
export const ALLOWLIST_VERSION = '1.0';
// Files larger than this are not read; the scan is then incomplete (exit 2).
export const SCAN_SIZE_LIMIT = 64 * 1024 * 1024;

export const SCAN_SCOPES = ['artifacts', 'history', 'tracked', 'untracked'] as const;
export type ScanScope = (typeof SCAN_SCOPES)[number];
// tree: what a repository holds (tracked, untracked, history): JSON and HTML. artifact: build output, where
// JavaScript and source maps are checked too.
export type ScanMode = 'tree' | 'artifact';
export const scanMode = (scope: ScanScope): ScanMode => (scope === 'artifacts' ? 'artifact' : 'tree');

export const SCAN_KINDS = ['allowlist_entry', 'document', 'embedded', 'legacy', 'too_large', 'uncertain', 'unreadable'] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];
export const SCAN_STATUSES = ['allowed', 'confirmed', 'incomplete', 'moved', 'stale', 'tampered', 'uncertain'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];
export const SCAN_REASONS = [
    'document',
    'embedded_json',
    'laravel_envelope',
    'missing_connections',
    'nested_document',
    'nested_legacy',
    'not_detected',
    'not_found',
    'object_literal',
    'read_error',
    'size_limit',
    'symlinked_directory',
    'unparseable_json',
    'viewer_global',
    'viewer_v1',
] as const;
export type ScanReason = (typeof SCAN_REASONS)[number];
export const SCAN_ERROR_KINDS = ['allowlist_invalid', 'artifact_missing', 'git_failed', 'history_unavailable', 'not_a_repository'] as const;
export type ScanErrorKind = (typeof SCAN_ERROR_KINDS)[number];

// What scanContent() found in one file.
export type ScanMatch = { kind: 'document' | 'legacy' | 'embedded' | 'uncertain' | 'too_large'; reason: ScanReason };

const EXTENSIONS: Record<ScanMode, string[]> = { tree: ['.json', '.html', '.htm'], artifact: ['.json', '.html', '.htm', '.js', '.mjs', '.cjs', '.map'] };
const extension = (path: string) => {
    const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    const dot = name.lastIndexOf('.');
    return dot <= 0 ? '' : name.slice(dot);
};

// Whether a file of this name is read at all in this mode. Other files are not content-checked.
export const isScanCandidate = (path: string, mode: ScanMode) => EXTENSIONS[mode].includes(extension(path));

const VERSION_TEXT = /^\d+\.\d+$/;
const LEGACY_V1 = `${FORMAT}-viewer`;
// The deepest a nested document is looked for: the number of keys and indexes from the top-level value to it.
const MAX_DEPTH = 6;

type Json = unknown;
const isObject = (v: Json): v is Record<string, Json> => v !== null && typeof v === 'object' && !Array.isArray(v);

const isDocument = (v: Json) => isObject(v) && v.format === FORMAT && typeof v.version === 'string' && VERSION_TEXT.test(v.version) && Array.isArray(v.connections);
// Temporary (decision 6), until Laravel and the Python and Node.js v1 snapshots are gone: Laravel's envelope, format 2
// with document.connections, and the v1 viewer format with its tables.
const isLaravelEnvelope = (v: Json) => isObject(v) && v.format === 2 && isObject(v.document) && Array.isArray(v.document.connections);
const isViewerV1 = (v: Json) => isObject(v) && v.format === LEGACY_V1 && Array.isArray(v.tables);
const legacyReason = (v: Json): ScanReason | null => (isLaravelEnvelope(v) ? 'laravel_envelope' : isViewerV1(v) ? 'viewer_v1' : null);

// A nested document or legacy snapshot at depth 1..MAX_DEPTH; a document wins over a legacy one.
function nested(value: Json): ScanReason | null {
    let legacy = false;
    const stack: [Json, number][] = [[value, 0]];
    while (stack.length) {
        const [v, depth] = stack.pop() as [Json, number];
        if (depth > 0 && isDocument(v)) {
            return 'nested_document';
        }
        if (depth > 0 && legacyReason(v)) {
            legacy = true;
            continue;
        }
        if (depth < MAX_DEPTH && v !== null && typeof v === 'object') {
            for (const child of Array.isArray(v) ? v : Object.values(v)) {
                stack.push([child, depth + 1]);
            }
        }
    }
    return legacy ? 'nested_legacy' : null;
}

// Text patterns. Quotes may be escaped up to three times (JSON in a JavaScript string in a source map); the value must
// be exactly the format, so laranex-schema-gate and a JSON Schema's "format": { "const": … } never match.
const ESC = '\\\\{0,3}';
const Q = `${ESC}["']`;
const QUOTED_FORMAT = new RegExp(`${ESC}"format${ESC}"\\s*:\\s*${ESC}"${FORMAT}${ESC}"`, 'g');
const LITERAL_FORMAT = new RegExp(`[{,]\\s*format\\s*:\\s*${Q}${FORMAT}${Q}\\s*[,}]`, 'g');
const CONNECTIONS = new RegExp(`${ESC}["']?connections${ESC}["']?\\s*:\\s*\\[`);
// What else an unparseable document would show when its format key was cut off.
const DOCUMENT_KEYS = /"(derivedLinks|comparisons|inferredAssociations|relationships|models)"\s*:/;
// The viewer manifest's contract: { format, major } names the format without being a document.
const IN_CONTRACT = new RegExp(`contract${ESC}["']?\\s*:\\s*\\{[^{}]*$`);
const VIEWER_GLOBAL = /window\.__SCHEMA_VIEWER__\s*=\s*\{/;

// The first format pair in the text that is not a manifest's contract, as "quoted" or "literal".
function formatHit(text: string): 'quoted' | 'literal' | null {
    for (const [pattern, kind] of [
        [QUOTED_FORMAT, 'quoted'],
        [LITERAL_FORMAT, 'literal'],
    ] as const) {
        pattern.lastIndex = 0;
        for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
            const at = m.index + m[0].indexOf('format');
            if (!IN_CONTRACT.test(text.slice(Math.max(0, at - 200), at))) {
                return kind;
            }
        }
    }
    return null;
}

const decode = (bytes: Uint8Array) => {
    const text = new TextDecoder('utf-8').decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
};

function scanJson(text: string): ScanMatch | null {
    let value: Json;
    try {
        value = JSON.parse(text);
    } catch {
        return formatHit(text) || (CONNECTIONS.test(text) && DOCUMENT_KEYS.test(text)) ? { kind: 'uncertain', reason: 'unparseable_json' } : null;
    }
    if (isDocument(value)) {
        return { kind: 'document', reason: 'document' };
    }
    const legacy = legacyReason(value);
    if (legacy) {
        return { kind: 'legacy', reason: legacy };
    }
    const inner = nested(value);
    return inner ? { kind: 'embedded', reason: inner } : null;
}

function scanText(text: string): ScanMatch | null {
    const hit = formatHit(text);
    if (!hit) {
        return null;
    }
    if (!CONNECTIONS.test(text)) {
        return { kind: 'uncertain', reason: 'missing_connections' };
    }
    return { kind: 'embedded', reason: VIEWER_GLOBAL.test(text) ? 'viewer_global' : hit === 'quoted' ? 'embedded_json' : 'object_literal' };
}

export type ScanContentOptions = { mode?: ScanMode; limit?: number };

// Classifies one file by its content. Null when the file is clean or not read in this mode (see isScanCandidate).
// Never throws and never returns any of the content.
export function scanContent(path: string, bytes: Uint8Array, options: ScanContentOptions = {}): ScanMatch | null {
    if (!isScanCandidate(path, options.mode ?? 'tree')) {
        return null;
    }
    if (bytes.length > (options.limit ?? SCAN_SIZE_LIMIT)) {
        return { kind: 'too_large', reason: 'size_limit' };
    }
    const text = decode(bytes);
    return extension(path) === '.json' ? scanJson(text) : text.includes(FORMAT) ? scanText(text) : null;
}

// The allowlist digest: SHA-256 of the bytes with every CRLF read as LF, so a Windows checkout matches.
export function allowlistDigest(bytes: Uint8Array): string {
    let crlf = 0;
    for (let i = 0; i + 1 < bytes.length; i++) {
        if (bytes[i] === 13 && bytes[i + 1] === 10) {
            crlf++;
        }
    }
    if (crlf === 0) {
        return sha256Bytes(bytes);
    }
    const out = new Uint8Array(bytes.length - crlf);
    let j = 0;
    for (let i = 0; i < bytes.length; i++) {
        if (!(bytes[i] === 13 && bytes[i + 1] === 10)) {
            out[j++] = bytes[i];
        }
    }
    return sha256Bytes(out);
}

// Allowlists.

export type AllowlistEntry = { path: string; sha256: string };
export type AllowlistInclude = { path: string; root: string };
export type Allowlist = { format: typeof ALLOWLIST_FORMAT; version: string; entries: AllowlistEntry[]; include?: AllowlistInclude[] };

// A relative POSIX path: no leading slash, no backslash, no empty, "." or ".." segment, no trailing slash.
const RELATIVE_PATH = '^(?!/)(?!.*//)(?!.*/$)(?!(.*/)?\\.\\.?(/|$))[^\\\\\\u0000]+$';
const SHA256 = '^[0-9a-f]{64}$';
const relativePath = () => string({ pattern: RELATIVE_PATH });

export const allowlistShape: Shape = object({
    format: literal(ALLOWLIST_FORMAT),
    version: literal(ALLOWLIST_VERSION),
    entries: array(object({ path: relativePath(), sha256: string({ pattern: SHA256 }) })),
    'include?': array(object({ path: relativePath(), root: string({ pattern: `^\\.$|${RELATIVE_PATH}` }) })),
});

export function allowlistJsonSchema(): JsonSchema {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://laranex.github.io/schema-viewer-ui/laranex-schema-allowlist/1.0.json',
        title: 'laranex-schema-allowlist 1.0',
        ...allowlistShape.schema,
    };
}

export type AllowlistValidationResult = { ok: boolean; errors: string[] };

// Allowlists are always read strictly: an unknown property or another version is an error, never ignored.
export function validateAllowlist(value: unknown): AllowlistValidationResult {
    const errors: string[] = [];
    allowlistShape.check(value, '$', { errors, strict: true });
    if (errors.length === 0) {
        const seen = new Set<string>();
        (value as Allowlist).entries.forEach((e, i) => {
            const key = `${e.path}\u0000${e.sha256}`;
            if (seen.has(key)) {
                errors.push(`$.entries[${i}]: ${e.path} with this sha256 is listed more than once`);
            }
            seen.add(key);
        });
    }
    return { ok: errors.length === 0, errors };
}

const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const join = (dir: string, path: string) => (dir === '' || dir === '.' ? path : path === '.' ? dir : `${dir}/${path}`);

export type ResolvedAllowlist = { entries: AllowlistEntry[]; errors: string[] };

// Reads an allowlist and its includes. load(path) returns the parsed JSON of the file at path (POSIX, include paths
// joined to the including file's directory) and throws when it cannot. Entries of an included file have its root
// prepended, roots of nested includes compose, and a cycle is an error.
export function resolveAllowlist(path: string, load: (path: string) => unknown): ResolvedAllowlist {
    const entries = new Map<string, AllowlistEntry>();
    const errors: string[] = [];
    const visit = (file: string, root: string, chain: string[]) => {
        if (chain.includes(file)) {
            errors.push(`Allowlist ${file} includes itself`);
            return;
        }
        let value: unknown;
        try {
            value = load(file);
        } catch {
            errors.push(`Allowlist ${file} could not be read as JSON`);
            return;
        }
        const result = validateAllowlist(value);
        if (!result.ok) {
            errors.push(...result.errors.map((e) => `Allowlist ${file}: ${e}`));
            return;
        }
        const list = value as Allowlist;
        for (const e of list.entries) {
            const entry = { path: join(root, e.path), sha256: e.sha256 };
            entries.set(`${entry.path}\u0000${entry.sha256}`, entry);
        }
        for (const include of list.include ?? []) {
            visit(join(dirname(file), include.path), join(root, include.root), [...chain, file]);
        }
    };
    visit(path, '.', []);
    return { entries: [...entries.values()].sort((a, b) => byList([a.path, a.sha256], [b.path, b.sha256])), errors };
}

// Reports.

export type ScanFinding = {
    scope: ScanScope | 'allowlist';
    status: ScanStatus;
    kind: ScanKind;
    // Repository-relative POSIX path, or <artifact-dir>/<relative> for artifacts, or the stale entry's path.
    path: string;
    // The commit a history finding was seen in; null otherwise.
    commit: string | null;
    // allowlistDigest() of the file, or a stale entry's; null when the file was not read.
    sha256: string | null;
    reason: ScanReason;
};
export type ScanError = { kind: ScanErrorKind; message: string };
export type ScanCounts = { files: number; confirmed: number; tampered: number; moved: number; uncertain: number; allowed: number; incomplete: number; stale: number };
export type ScanReport = {
    format: typeof SCAN_FORMAT;
    version: string;
    // 0 clean, 1 confirmed exposure, 2 scan failure or incomplete scan, 3 uncertain exposure; 2 > 1 > 3 > 0.
    exitCode: 0 | 1 | 2 | 3;
    scopes: ScanScope[];
    limit: number;
    counts: ScanCounts;
    findings: ScanFinding[];
    errors: ScanError[];
};

const count = () => integer({ minimum: 0 });
export const scanReportShape: Shape = object({
    format: literal(SCAN_FORMAT),
    version: string({ pattern: '^1\\.(0|[1-9][0-9]*)$' }),
    exitCode: {
        schema: { enum: [0, 1, 2, 3] },
        check: (v, path, { errors }) => {
            if (v !== 0 && v !== 1 && v !== 2 && v !== 3) {
                errors.push(`${path}: expected 0, 1, 2 or 3, got ${JSON.stringify(v)}`);
            }
        },
    },
    scopes: array(oneOf(SCAN_SCOPES), { uniqueItems: true }),
    limit: integer({ minimum: 1 }),
    counts: object({ files: count(), confirmed: count(), tampered: count(), moved: count(), uncertain: count(), allowed: count(), incomplete: count(), stale: count() }),
    findings: array(
        object({
            scope: oneOf([...SCAN_SCOPES, 'allowlist']),
            status: oneOf(SCAN_STATUSES),
            kind: oneOf(SCAN_KINDS),
            path: string({ minLength: 1 }),
            commit: nullable(string({ pattern: '^[0-9a-f]{40}([0-9a-f]{24})?$' })),
            sha256: nullable(string({ pattern: SHA256 })),
            reason: oneOf(SCAN_REASONS),
        }),
    ),
    errors: array(object({ kind: oneOf(SCAN_ERROR_KINDS), message: string({ minLength: 1 }) })),
});

export function scanReportJsonSchema(): JsonSchema {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://laranex.github.io/schema-viewer-ui/laranex-schema-scan/1.0.json',
        title: 'laranex-schema-scan 1.x report',
        ...scanReportShape.schema,
    };
}

const findingOrder = (f: ScanFinding) => [f.path, f.commit ?? '', f.scope, f.status, f.reason];
const EXPOSED: ScanStatus[] = ['confirmed', 'tampered', 'moved'];

export const scanExitCode = (findings: Pick<ScanFinding, 'status'>[], errors: unknown[]): ScanReport['exitCode'] =>
    errors.length || findings.some((f) => f.status === 'incomplete') ? 2 : findings.some((f) => EXPOSED.includes(f.status)) ? 1 : findings.some((f) => f.status === 'uncertain') ? 3 : 0;

export type ScanFile = {
    scope: ScanScope;
    path: string;
    commit?: string | null;
    // The file's bytes, or why it could not be read.
    bytes?: Uint8Array;
    error?: 'read_error' | 'size_limit' | 'symlinked_directory';
};

export type ScanInput = {
    scopes: ScanScope[];
    files: ScanFile[];
    // The resolved allowlist, or null without one.
    allowlist?: ResolvedAllowlist | null;
    errors?: ScanError[];
    limit?: number;
    // Whether the scan covered this path, so an entry naming it that matched nothing is stale even if the file is
    // gone. Paths the scan read are always covered. Defaults to every path.
    covered?: (path: string) => boolean;
};

// The scan: classifies every file, judges what it found against the allowlist, and reports.
export function scanFiles(input: ScanInput): ScanReport {
    const limit = input.limit ?? SCAN_SIZE_LIMIT;
    const entries = input.allowlist?.entries ?? [];
    const errors = [...(input.errors ?? []), ...(input.allowlist?.errors ?? []).map((message) => ({ kind: 'allowlist_invalid' as const, message }))];
    const byPath = new Map<string, AllowlistEntry[]>();
    entries.forEach((e) => byPath.set(e.path, [...(byPath.get(e.path) ?? []), e]));
    const byHash = new Set(entries.map((e) => e.sha256));
    const matched = new Set<AllowlistEntry>();
    const examined = new Map<string, 'clean' | 'judged'>();
    const findings: ScanFinding[] = [];
    let files = 0;
    for (const file of input.files) {
        // A file that could not be read is always reported; others are read only when their name makes them candidates.
        if (!file.error && !isScanCandidate(file.path, scanMode(file.scope))) {
            continue;
        }
        files++;
        const commit = file.commit ?? null;
        const remember = (state: 'clean' | 'judged') => {
            if (file.scope !== 'history' && examined.get(file.path) !== 'judged') {
                examined.set(file.path, state);
            }
        };
        if (file.error || !file.bytes) {
            const reason = file.error ?? 'read_error';
            findings.push({ scope: file.scope, status: 'incomplete', kind: reason === 'size_limit' ? 'too_large' : 'unreadable', path: file.path, commit, sha256: null, reason });
            remember('judged');
            continue;
        }
        const match = scanContent(file.path, file.bytes, { mode: scanMode(file.scope), limit });
        if (!match) {
            remember('clean');
            continue;
        }
        remember('judged');
        if (match.kind === 'too_large') {
            findings.push({ scope: file.scope, status: 'incomplete', kind: 'too_large', path: file.path, commit, sha256: null, reason: 'size_limit' });
            continue;
        }
        const digest = allowlistDigest(file.bytes);
        const listed = byPath.get(file.path) ?? [];
        const allowed = listed.find((e) => e.sha256 === digest);
        if (allowed) {
            matched.add(allowed);
        }
        const status: ScanStatus = allowed ? 'allowed' : listed.length ? 'tampered' : byHash.has(digest) ? 'moved' : match.kind === 'uncertain' ? 'uncertain' : 'confirmed';
        findings.push({ scope: file.scope, status, kind: match.kind, path: file.path, commit, sha256: digest, reason: match.reason });
    }
    const covered = input.covered ?? (() => true);
    for (const entry of entries) {
        if (matched.has(entry) || (byPath.get(entry.path) ?? []).some((e) => matched.has(e))) {
            continue;
        }
        const state = examined.get(entry.path);
        if (state === 'clean' || (state === undefined && covered(entry.path))) {
            findings.push({ scope: 'allowlist', status: 'stale', kind: 'allowlist_entry', path: entry.path, commit: null, sha256: entry.sha256, reason: state === 'clean' ? 'not_detected' : 'not_found' });
        }
    }
    findings.sort((a, b) => byList(findingOrder(a), findingOrder(b)));
    const sortedErrors = [...new Map(errors.map((e) => [`${e.kind}\u0000${e.message}`, e])).values()].sort((a, b) => byList([a.kind, a.message], [b.kind, b.message]));
    const by = (s: ScanStatus) => findings.filter((f) => f.status === s).length;
    return {
        format: SCAN_FORMAT,
        version: SCAN_VERSION,
        exitCode: scanExitCode(findings, sortedErrors),
        scopes: [...new Set(input.scopes)].sort(byCodePoint),
        limit,
        counts: { files, confirmed: by('confirmed'), tampered: by('tampered'), moved: by('moved'), uncertain: by('uncertain'), allowed: by('allowed'), incomplete: by('incomplete'), stale: by('stale') },
        findings,
        errors: sortedErrors,
    };
}

export type ScanReportValidationResult = { ok: boolean; errors: string[] };

export function validateScanReport(value: unknown, options: { strict?: boolean } = {}): ScanReportValidationResult {
    const errors: string[] = [];
    scanReportShape.check(value, '$', { errors, strict: options.strict ?? false });
    if (errors.length === 0) {
        const r = value as ScanReport;
        if (options.strict && r.version !== SCAN_VERSION) {
            errors.push(`$.version: strict validation is for version ${SCAN_VERSION}, got ${JSON.stringify(r.version)}`);
        }
        const expected = scanExitCode(r.findings, r.errors);
        if (r.exitCode !== expected) {
            errors.push(`Exit code ${r.exitCode} does not follow the errors and findings (expected ${expected})`);
        }
        const by = (s: ScanStatus) => r.findings.filter((f) => f.status === s).length;
        const statuses = ['confirmed', 'tampered', 'moved', 'uncertain', 'allowed', 'incomplete', 'stale'] as const;
        if (statuses.some((s) => r.counts[s] !== by(s))) {
            errors.push('Counts do not count the findings');
        }
        r.findings.forEach((f, i) => {
            if (i > 0 && byList(findingOrder(r.findings[i - 1]), findingOrder(f)) > 0) {
                errors.push(`Findings are not sorted by path, commit, scope, status and reason: findings[${i}]`);
            }
            if ((f.scope === 'history') !== (f.commit !== null)) {
                errors.push(`A finding has a commit exactly when it is from the history: findings[${i}]`);
            }
            if ((f.scope === 'allowlist') !== (f.status === 'stale')) {
                errors.push(`Only a stale allowlist entry has the scope allowlist: findings[${i}]`);
            }
        });
    }
    return { ok: errors.length === 0, errors };
}
