import { readdirSync, readFileSync, statSync } from 'node:fs';
import { allowlistDigest, scanContent, type Allowlist, type AllowlistEntry, type ScanMode } from '../../src/contract/scan';
import { byList } from '../../src/contract/ids';
import { root } from '../helpers';

// The allowlists npm run contract writes: contract/synthetic.json lists every synthetic document the package ships,
// by package-relative path and digest; .laranex-schema-allowlist.json lists the repository's own, in the directories
// that hold only synthetic documents, and the demo snapshots the docs site publishes. Only these directories are
// listed: anything the scanner finds elsewhere fails CI.

const SYNTHETIC_DIRECTORIES = ['tests/fixtures/export', 'tests/viewer-documents'];
export const DEMO_SNAPSHOTS = '.gh-page/.vitepress/dist/demo/snapshots';

const files = (dir: string): string[] =>
    readdirSync(root(dir))
        .sort()
        .flatMap((name) => (statSync(root(dir, name)).isDirectory() ? files(`${dir}/${name}`) : [`${dir}/${name}`]));

const detected = (dir: string, mode: ScanMode, skip: string[] = []): AllowlistEntry[] =>
    files(dir)
        .filter((path) => !skip.includes(path))
        .flatMap((path) => {
            const bytes = new Uint8Array(readFileSync(root(path)));
            return scanContent(path, bytes, { mode }) ? [{ path, sha256: allowlistDigest(bytes) }] : [];
        });

const sorted = (entries: AllowlistEntry[]) => [...entries].sort((a, b) => byList([a.path, a.sha256], [b.path, b.sha256]));

export function syntheticAllowlist(): Allowlist {
    return { format: 'laranex-schema-allowlist', version: '1.0', entries: sorted(detected('contract', 'artifact', ['contract/synthetic.json'])) };
}

export async function repositoryAllowlist(): Promise<Allowlist> {
    const { pages } = (await import(/* @vite-ignore */ root('.gh-page/scripts/prepare-demo.mjs'))) as { pages: Record<string, [string, string]> };
    const demo = Object.values(pages).map(([fixture]) => ({
        path: `${DEMO_SNAPSHOTS}/${fixture}.json`,
        sha256: allowlistDigest(new Uint8Array(readFileSync(root('contract/fixtures/valid', `${fixture}.json`)))),
    }));
    return {
        format: 'laranex-schema-allowlist',
        version: '1.0',
        entries: sorted([...SYNTHETIC_DIRECTORIES.flatMap((dir) => detected(dir, 'tree')), ...demo]),
        include: [{ path: 'contract/synthetic.json', root: '.' }],
    };
}
