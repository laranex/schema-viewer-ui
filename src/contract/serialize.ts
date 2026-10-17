import { sha256 } from './sha256';
import type { SchemaDocument } from './types';

// Object keys in Unicode code point order, as Python's sort_keys and PHP's ksort (with SORT_STRING) order ASCII keys.
const byCodePoint = (a: string, b: string) => {
    const x = [...a];
    const y = [...b];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
        const d = (x[i].codePointAt(0) as number) - (y[i].codePointAt(0) as number);
        if (d !== 0) {
            return d;
        }
    }
    return x.length - y.length;
};

const sorted = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(sorted);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
                .sort(byCodePoint)
                .map((k) => [k, sorted((value as Record<string, unknown>)[k])]),
        );
    }
    return value;
};

// The canonical form every producer writes: keys sorted recursively, two-space indentation, non-ASCII characters and
// slashes unescaped, a trailing newline. Arrays keep the order the contract gives them. Equal documents are equal bytes.
export function canonicalJson(document: SchemaDocument | unknown): string {
    return `${JSON.stringify(sorted(document), null, 2)}\n`;
}

// sha256 of the canonical form: what MCP tools and viewers call a snapshot's revision.
export function documentRevision(document: SchemaDocument | unknown): string {
    return sha256(canonicalJson(document));
}

// A short stable id from parts, as compact JSON: the same in TypeScript, Python (json.dumps(parts,
// separators=(",", ":"), ensure_ascii=False)) and PHP (json_encode with JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE).
export const hashId = (prefix: string, parts: unknown[]) => `${prefix}${sha256(JSON.stringify(parts)).slice(0, 16)}`;
