import { byCodePoint, hashId } from './serialize';
import type { Diagnostic, ObjectType, Scope } from './types';

// Opaque ids the contract defines by rule: a prefix and the first 16 hex digits of the SHA-256 of compact JSON parts.
// Link and derived-link ids are in graph.ts.

export const diagnosticId = (d: Pick<Diagnostic, 'kind' | 'subject' | 'message'>) =>
    hashId('n', ['diagnostic', d.kind, d.subject.type, d.subject.id, d.subject.columns, d.message]);

export const comparisonId = (baseline: Scope, target: Scope) => hashId('c', ['comparison', baseline.connection, baseline.schema, target.connection, target.schema]);

export const differenceId = (comparison: string, objectType: ObjectType, key: string[]) => hashId('x', ['difference', comparison, objectType, key]);

export const migrationTrackId = (provider: string, connection: string, schema: string | null) => hashId('m', ['migration', provider, connection, schema]);

export const inferredAssociationId = (kind: string, foreignKeys: string[], via: string | null) => hashId('i', ['inferred', kind, [...foreignKeys].sort(byCodePoint), via]);

// Element-wise code point order of string lists; a prefix sorts first.
export function byList(a: readonly string[], b: readonly string[]): number {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const d = byCodePoint(a[i], b[i]);
        if (d !== 0) {
            return d;
        }
    }
    return a.length - b.length;
}

export { byCodePoint };

export const sortedStrings = (values: Iterable<string>) => [...new Set(values)].sort(byCodePoint);
