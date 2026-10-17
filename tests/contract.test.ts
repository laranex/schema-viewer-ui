import Ajv2020 from 'ajv/dist/2020.js';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertDocument, buildGraph, canonicalJson, documentRevision, InvalidDocumentError, jsonSchema, UnsupportedDocumentError, validateDocument } from '../src/contract';
import { sha256 } from '../src/contract/sha256';
import { VALID } from './fixtures/documents';
import { GRAPH_CASES } from './fixtures/graph-cases';
import { INVALID } from './fixtures/invalid';
import { root } from './helpers';

// The contract artifacts in contract/ are generated from the TypeScript definitions above; `npm run contract` rewrites
// them, and these tests fail when a committed artifact differs from what the definitions produce.
const update = !!process.env.UPDATE_CONTRACT;

function artifacts(dir: string, files: Record<string, unknown>) {
    const path = root('contract', dir);
    if (update) {
        rmSync(path, { recursive: true, force: true });
        mkdirSync(path, { recursive: true });
        for (const [name, value] of Object.entries(files)) {
            writeFileSync(`${path}/${name}.json`, canonicalJson(value));
        }
    }
    const committed = readdirSync(path).filter((f) => f.endsWith('.json')).sort();
    expect(committed).toEqual(Object.keys(files).map((n) => `${n}.json`).sort());
    for (const [name, value] of Object.entries(files)) {
        expect(readFileSync(`${path}/${name}.json`, 'utf8'), `${dir}/${name}.json is stale; run npm run contract`).toBe(canonicalJson(value));
    }
}

describe('contract artifacts', () => {
    it('schema.json is generated from the contract shapes', () => {
        const file = root('contract/schema.json');
        const generated = `${JSON.stringify(jsonSchema(), null, 2)}\n`;
        if (update) {
            writeFileSync(file, generated);
        }
        expect(readFileSync(file, 'utf8')).toBe(generated);
    });

    it('valid fixtures are current', () => artifacts('fixtures/valid', Object.fromEntries(Object.entries(VALID).map(([n, f]) => [n, f()]))));
    it('invalid fixtures are current', () => artifacts('fixtures/invalid', INVALID));
    it('graph conformance cases are current', () => artifacts('conformance/graph', GRAPH_CASES));
});

describe('valid fixtures', () => {
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(jsonSchema());
    for (const [name, build] of Object.entries(VALID)) {
        it(`${name} passes strict validation and the JSON Schema`, () => {
            const doc = build();
            expect(validateDocument(doc, { strict: true }).errors).toEqual([]);
            expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
        });

        it(`${name} stores the links the graph builder produces`, () => {
            const doc = build();
            expect({ links: doc.links, derivedLinks: doc.derivedLinks }).toEqual(buildGraph(doc));
        });
    }
});

describe('invalid fixtures', () => {
    for (const [name, c] of Object.entries(INVALID)) {
        it(`${name}: ${c.description}`, () => {
            const result = validateDocument(c.document, { strict: c.strict });
            expect(result.ok).toBe(false);
            for (const message of c.errors) {
                expect(result.errors.some((e) => e.includes(message)), `expected "${message}" in ${JSON.stringify(result.errors)}`).toBe(true);
            }
        });
    }

    it('is accepted in lenient mode when only unknown properties are wrong', () => {
        expect(validateDocument(INVALID['unknown-property-strict'].document).ok).toBe(true);
    });
});

describe('graph conformance', () => {
    for (const [name, c] of Object.entries(GRAPH_CASES)) {
        it(`${name}: ${c.description}`, () => {
            expect(buildGraph(c.input)).toEqual(c.expected);
        });
    }
});

describe('serialization', () => {
    it('sha256 agrees with node:crypto', () => {
        for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(64), 'é ✓ 𝄞', JSON.stringify(VALID['combined-eloquent']())]) {
            expect(sha256(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
        }
    });

    it('writes keys in code point order, two-space indented, with a trailing newline', () => {
        expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'é/' }, B: undefined })).toBe('{\n  "a": {\n    "c": "é/",\n    "d": [\n      3,\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n');
    });

    it('gives equal documents equal revisions whatever their key order', () => {
        const doc = VALID['database-sqlite-indexes']();
        const reverse = (v: unknown): unknown =>
            Array.isArray(v) ? v.map(reverse) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)])) : v;
        const reordered = reverse(doc);
        expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(doc));
        expect(documentRevision(reordered)).toBe(documentRevision(doc));
        expect(documentRevision(doc)).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('validateDocument', () => {
    it('accepts later 1.x minors and ignores their unknown properties', () => {
        const doc = { ...VALID['database-sqlite-indexes'](), version: '1.7', futureField: true };
        expect(validateDocument(doc).ok).toBe(true);
        expect(validateDocument(doc, { strict: true }).errors).toContain('$: unknown property futureField');
    });

    it('throws typed errors from assertDocument', () => {
        expect(() => assertDocument({ format: 'other' })).toThrow(UnsupportedDocumentError);
        expect(() => assertDocument({ ...VALID['database-sqlite-indexes'](), connections: 'none' })).toThrow(InvalidDocumentError);
    });
});
