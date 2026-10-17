import { sortedStrings } from './ids';
import type { MigrationHistory, MigrationRevision, MigrationStatus } from './types';

// Migration history and status rules every producer implements (docs/contract.md, "Migrations"), checked against
// contract/conformance/migrations. Producers compute the status; viewers display the stored one.

// A history from its revisions: revisions sorted by id with sorted parents and branch labels, heads (revisions no
// revision names as a parent) and missing (parents named but not present).
export function migrationHistory(revisions: MigrationRevision[]): MigrationHistory {
    const sorted = [...revisions]
        .map((r) => ({ id: r.id, parents: sortedStrings(r.parents), branchLabels: sortedStrings(r.branchLabels) }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const ids = new Set(sorted.map((r) => r.id));
    const parents = new Set(sorted.flatMap((r) => r.parents));
    return {
        revisions: sorted,
        heads: sortedStrings(sorted.filter((r) => !parents.has(r.id)).map((r) => r.id)),
        missing: sortedStrings([...parents].filter((p) => !ids.has(p))),
    };
}

export type MigrationState = { status: MigrationStatus; pending: string[] | null; unknownRevisions: string[] };

// The status of a database at revisions `current` against a history. In order:
// 1. current null (the version table could not be read): unknown.
// 2. current empty (no version table, or no revision recorded): uninitialized; pending is every revision.
// 3. history null (the scripts could not be read): unknown.
// 4. a current revision the history does not have: unknown, listed in unknownRevisions.
// 5. a current revision that is an ancestor of another current revision: diverged.
// 6. pending (revisions that are an ancestor-or-equal of a head but of no current revision) includes a missing
//    revision: unknown. Otherwise behind when pending is non-empty, and up_to_date when it is empty.
// pending is null whenever it cannot be determined: statuses unknown and diverged.
export function migrationState(history: MigrationHistory | null, current: string[] | null): MigrationState {
    const unknown = (unknownRevisions: string[] = []): MigrationState => ({ status: 'unknown', pending: null, unknownRevisions });
    if (current === null) {
        return unknown();
    }
    const parentsOf = new Map((history?.revisions ?? []).map((r) => [r.id, r.parents]));
    const ancestry = (from: Iterable<string>) => {
        const seen = new Set<string>();
        const stack = [...from];
        while (stack.length) {
            const id = stack.pop() as string;
            if (!seen.has(id)) {
                seen.add(id);
                stack.push(...(parentsOf.get(id) ?? []));
            }
        }
        return seen;
    };
    const missing = new Set(history?.missing ?? []);
    const pendingFrom = (applied: Set<string>) => {
        const pending = [...ancestry(history?.heads ?? [])].filter((r) => !applied.has(r));
        return pending.some((r) => missing.has(r)) ? null : sortedStrings(pending);
    };
    if (current.length === 0) {
        return { status: 'uninitialized', pending: history === null ? null : pendingFrom(new Set()), unknownRevisions: [] };
    }
    if (history === null) {
        return unknown();
    }
    const unknownRevisions = sortedStrings(current.filter((r) => !parentsOf.has(r)));
    if (unknownRevisions.length) {
        return unknown(unknownRevisions);
    }
    if (current.some((c) => current.some((other) => other !== c && ancestry(parentsOf.get(other) ?? []).has(c)))) {
        return { status: 'diverged', pending: null, unknownRevisions: [] };
    }
    const pending = pendingFrom(ancestry(current));
    if (pending === null) {
        return unknown();
    }
    return { status: pending.length ? 'behind' : 'up_to_date', pending, unknownRevisions: [] };
}
