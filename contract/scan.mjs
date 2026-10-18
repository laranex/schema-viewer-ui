#!/usr/bin/env node
// Scans a repository and its build output for laranex-schema snapshots, so a private schema is not committed or
// published by accident. Node.js 20 or later, Git for the Git scopes, no other dependencies:
//
//   node node_modules/laranex-schema-viewer-ui/contract/scan.mjs [--tracked] [--untracked] [--artifacts DIR]...
//       [--history] [--allowlist FILE] [--report FILE] [--json]
//
//   --tracked      every file in the Git index, read from the index (staged bytes, and files tracked before they were
//                  ignored)
//   --untracked    files Git would add: untracked and not ignored
//   --artifacts    a build output directory, every file, ignore rules not applied (repeatable)
//   --history      every version of a .json, .html or .htm file reachable from any ref (fails on a shallow clone)
//   --allowlist    a laranex-schema-allowlist file (default: .laranex-schema-allowlist.json at the scan root, if any)
//   --report       write the laranex-schema-scan report (JSON) to FILE
//   --json         print the report instead of the summary
//
// Exit codes: 0 clean, 1 confirmed exposure, 2 scan failure or incomplete scan, 3 uncertain exposure (2 > 1 > 3 > 0).
// The summary prints counts only; paths and reasons are in the report, which never contains file content. The rules
// are in docs/contract.md, "Snapshot scanning"; the classifier is scanContent() in the package's contract module.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, isScanCandidate, resolveAllowlist, SCAN_SIZE_LIMIT, scanFiles } from '../dist/lib/contract.js';

const USAGE = 'usage: scan.mjs [--tracked] [--untracked] [--artifacts DIR]... [--history] [--allowlist FILE] [--report FILE] [--json]';
const DEFAULT_ALLOWLIST = '.laranex-schema-allowlist.json';
// Blob reads are batched so that one batch holds at most this many bytes.
const BATCH_BYTES = 256 * 1024 * 1024;

class GitError extends Error {}

const posix = (path) => path.split(sep).join('/');

function parseArgs(argv) {
    const options = { tracked: false, untracked: false, history: false, artifacts: [], allowlist: null, report: null, json: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => {
            if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
                throw new Error(`${arg} needs a value`);
            }
            return argv[++i];
        };
        if (arg === '--tracked' || arg === '--untracked' || arg === '--history') {
            options[arg.slice(2)] = true;
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg === '--artifacts') {
            options.artifacts.push(value());
        } else if (arg === '--allowlist') {
            options.allowlist = value();
        } else if (arg === '--report') {
            options.report = value();
        } else {
            throw new Error(`unknown argument ${arg}`);
        }
    }
    if (!options.tracked && !options.untracked && !options.history && options.artifacts.length === 0) {
        throw new Error('name at least one scope');
    }
    return options;
}

function git(root, args, input) {
    const result = spawnSync('git', ['-C', root, '-c', 'core.quotePath=false', ...args], { input, maxBuffer: 2 ** 31 - 1 });
    if (result.error || result.status !== 0) {
        throw new GitError(`git ${args[0]} failed`);
    }
    return result.stdout;
}

const topLevel = (cwd) => {
    const result = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    return result.status === 0 ? realpathSync(result.stdout.trim()) : null;
};

// Reads blobs by id: { [oid]: { bytes } | { error } }, never more than the limit per blob.
function readBlobs(root, oids, limit) {
    const unique = [...new Set(oids)];
    const result = new Map();
    if (unique.length === 0) {
        return result;
    }
    const sizes = new Map();
    git(root, ['cat-file', '--batch-check'], `${unique.join('\n')}\n`)
        .toString('utf8')
        .trim()
        .split('\n')
        .forEach((line) => {
            const [oid, type, size] = line.split(' ');
            if (type !== 'blob') {
                result.set(oid, { error: 'read_error' });
            } else if (Number(size) > limit) {
                result.set(oid, { error: 'size_limit' });
            } else {
                sizes.set(oid, Number(size));
            }
        });
    const batches = [[]];
    let total = 0;
    for (const [oid, size] of sizes) {
        if (total + size > BATCH_BYTES && batches.at(-1).length) {
            batches.push([]);
            total = 0;
        }
        batches.at(-1).push(oid);
        total += size;
    }
    for (const batch of batches.filter((b) => b.length)) {
        const out = git(root, ['cat-file', '--batch'], `${batch.join('\n')}\n`);
        let at = 0;
        while (at < out.length) {
            const end = out.indexOf(10, at);
            const [oid, , size] = out.subarray(at, end).toString('utf8').split(' ');
            const start = end + 1;
            result.set(oid, { bytes: new Uint8Array(out.subarray(start, start + Number(size))) });
            at = start + Number(size) + 1;
        }
    }
    return result;
}

const blobFiles = (root, entries, scope, limit) => {
    const blobs = readBlobs(root, entries.map((e) => e.oid), limit);
    return entries.map((e) => ({ scope, path: e.path, commit: e.commit ?? null, ...blobs.get(e.oid) }));
};

// The index, read from the index: staged content, whatever the working tree holds. Symbolic links and submodules are
// not files.
function trackedFiles(root, limit) {
    const entries = git(root, ['ls-files', '-s', '-z'])
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
        .map((line) => {
            const tab = line.indexOf('\t');
            const [mode, oid] = line.slice(0, tab).split(' ');
            return { mode, oid, path: line.slice(tab + 1) };
        })
        .filter((e) => (e.mode === '100644' || e.mode === '100755') && isScanCandidate(e.path, 'tree'));
    return blobFiles(root, entries, 'tracked', limit);
}

const readFile = (file, display, scope, limit) => {
    try {
        if (statSync(file).size > limit) {
            return { scope, path: display, error: 'size_limit' };
        }
        return { scope, path: display, bytes: new Uint8Array(readFileSync(file)) };
    } catch {
        return { scope, path: display, error: 'read_error' };
    }
};

function untrackedFiles(root, limit) {
    return git(root, ['ls-files', '-z', '--others', '--exclude-standard'])
        .toString('utf8')
        .split('\0')
        .filter((path) => path && !path.endsWith('/') && isScanCandidate(path, 'tree'))
        .flatMap((path) => {
            const file = resolve(root, path);
            try {
                if (!lstatSync(file).isFile()) {
                    return [];
                }
            } catch {
                return [{ scope: 'untracked', path, error: 'read_error' }];
            }
            return [readFile(file, path, 'untracked', limit)];
        });
}

// Every file under the directory: symbolic links to files are read, symbolic links to directories are not followed
// (incomplete).
function artifactFiles(dir, display, limit) {
    const files = [];
    const walk = (abs, rel) => {
        for (const entry of readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
            const path = resolve(abs, entry.name);
            const shown = rel ? `${rel}/${entry.name}` : entry.name;
            const name = display ? `${display}/${shown}` : shown;
            let isDirectory = entry.isDirectory();
            if (entry.isSymbolicLink()) {
                try {
                    isDirectory = statSync(path).isDirectory();
                } catch {
                    files.push({ scope: 'artifacts', path: name, error: 'read_error' });
                    continue;
                }
                if (isDirectory) {
                    files.push({ scope: 'artifacts', path: name, error: 'symlinked_directory' });
                    continue;
                }
            }
            if (isDirectory) {
                walk(path, shown);
            } else if (isScanCandidate(name, 'artifact')) {
                files.push(readFile(path, name, 'artifacts', limit));
            }
        }
    };
    walk(dir, '');
    return files;
}

// Every version of a candidate file that a commit reachable from any ref introduced, merges included, once per path
// and blob, with the first commit git log lists for it.
function historyFiles(root, limit) {
    if (git(root, ['rev-parse', '--is-shallow-repository']).toString('utf8').trim() === 'true') {
        return { error: 'The repository is a shallow clone; its history is not available.' };
    }
    if (git(root, ['for-each-ref', '--count=1']).toString('utf8').trim() === '') {
        return { files: [] };
    }
    const tokens = git(root, ['log', '--all', '--no-renames', '--raw', '--no-abbrev', '-m', '--root', '-z', '--format=%x01%H']).toString('utf8').split('\0');
    const seen = new Map();
    let commit = null;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i].replace(/^\n/, '');
        if (token.startsWith('\x01')) {
            commit = token.slice(1);
        } else if (token.startsWith(':')) {
            const [, mode, , oid] = token.slice(1).split(' ');
            const path = tokens[++i];
            const key = `${path}\0${oid}`;
            if ((mode === '100644' || mode === '100755') && !/^0+$/.test(oid) && isScanCandidate(path, 'tree') && !seen.has(key)) {
                seen.set(key, { path, oid, commit });
            }
        }
    }
    return { files: blobFiles(root, [...seen.values()], 'history', limit) };
}

function ignoredPaths(root, paths) {
    if (paths.length === 0) {
        return new Set();
    }
    const result = spawnSync('git', ['-C', root, 'check-ignore', '-z', '--stdin'], { input: `${paths.join('\0')}\0`, maxBuffer: 2 ** 31 - 1 });
    if (result.status !== 0 && result.status !== 1) {
        throw new GitError('git check-ignore failed');
    }
    return new Set(result.stdout.toString('utf8').split('\0').filter(Boolean));
}

export function run(argv, { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr, limit = SCAN_SIZE_LIMIT } = {}) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        stderr.write(`scan.mjs: ${error.message}\n${USAGE}\n`);
        return 2;
    }
    const usesGit = options.tracked || options.untracked || options.history;
    cwd = realpathSync(cwd);
    const top = topLevel(cwd);
    const root = top ?? cwd;
    const errors = [];
    const files = [];
    const scopes = [];
    const artifactDirs = [];
    if (usesGit && !top) {
        errors.push({ kind: 'not_a_repository', message: 'The Git scopes need a Git work tree; this is not one.' });
    } else {
        try {
            if (options.tracked) {
                scopes.push('tracked');
                files.push(...trackedFiles(root, limit));
            }
            if (options.untracked) {
                scopes.push('untracked');
                files.push(...untrackedFiles(root, limit));
            }
            if (options.history) {
                scopes.push('history');
                const history = historyFiles(root, limit);
                if (history.error) {
                    errors.push({ kind: 'history_unavailable', message: history.error });
                } else {
                    files.push(...history.files);
                }
            }
        } catch (error) {
            errors.push({ kind: 'git_failed', message: error instanceof GitError ? error.message : 'Git could not be run.' });
        }
    }
    for (const dir of options.artifacts) {
        scopes.push('artifacts');
        let abs = resolve(cwd, dir);
        try {
            abs = realpathSync(abs);
        } catch {
            // Reported as missing below.
        }
        const rel = posix(relative(root, abs));
        const display = rel === '' ? '' : rel.startsWith('../') || rel === '..' || isAbsolute(rel) ? posix(abs) : rel;
        if (!existsSync(abs) || !statSync(abs).isDirectory()) {
            errors.push({ kind: 'artifact_missing', message: `The artifact directory ${dir} does not exist.` });
            continue;
        }
        artifactDirs.push(display);
        files.push(...artifactFiles(abs, display, limit));
    }

    let allowlist = null;
    const allowlistFile = options.allowlist ? resolve(cwd, options.allowlist) : resolve(root, DEFAULT_ALLOWLIST);
    if (options.allowlist || existsSync(allowlistFile)) {
        const base = dirname(allowlistFile);
        allowlist = resolveAllowlist(posix(relative(base, allowlistFile)), (path) => JSON.parse(readFileSync(resolve(base, path), 'utf8')));
    }

    // A stale entry names a path the scan covered: under a scanned artifact directory, or anywhere Git does not
    // ignore when both the tracked and the untracked files were scanned.
    const underArtifacts = (path) => artifactDirs.some((d) => d === '' || path === d || path.startsWith(`${d}/`));
    let ignored = new Set();
    if (options.tracked && options.untracked && top && allowlist) {
        try {
            ignored = ignoredPaths(root, allowlist.entries.map((e) => e.path).filter((p) => !underArtifacts(p)));
        } catch (error) {
            errors.push({ kind: 'git_failed', message: error.message });
        }
    }
    const covered = (path) => underArtifacts(path) || (options.tracked && options.untracked && !!top && !ignored.has(path));

    const report = scanFiles({ scopes, files, allowlist, errors, limit, covered });
    if (options.report) {
        writeFileSync(resolve(cwd, options.report), canonicalJson(report));
    }
    if (options.json) {
        stdout.write(canonicalJson(report));
    } else {
        const c = report.counts;
        stdout.write(
            `laranex-schema-scan: ${c.files} files (${scopes.join(', ')}); ${c.confirmed} confirmed, ${c.tampered} tampered, ${c.moved} moved, ${c.uncertain} uncertain, ${c.incomplete} incomplete, ${c.allowed} allowed, ${c.stale} stale; exit ${report.exitCode}\n`,
        );
        if (report.exitCode !== 0 && !options.report) {
            stdout.write('Paths and reasons are in the report: --report FILE or --json.\n');
        }
    }
    for (const error of report.errors) {
        stderr.write(`scan.mjs: ${error.kind}: ${error.message}\n`);
    }
    return report.exitCode;
}

const invoked = (() => {
    try {
        return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
})();
if (invoked) {
    process.exitCode = run(process.argv.slice(2));
}
