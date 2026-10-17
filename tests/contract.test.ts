import Ajv2020 from 'ajv/dist/2020.js';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertDocument, buildGraph, canonicalJson, compareScopes, comparisonId, diagnosticId, documentRevision, gateDocument, gateReportJsonSchema, inferAssociations, InvalidDocumentError, jsonSchema, migrationHistory, migrationState, UnsupportedDocumentError, validateDocument, validateGateReport } from '../src/contract';
import { sha256 } from '../src/contract/sha256';
import { VALID } from './fixtures/documents';
import { COMPARISON_CASES } from './fixtures/comparison-cases';
import { GATE_INVALID, GATE_VALID } from './fixtures/gate';
import { GATE_CASES } from './fixtures/gate-cases';
import { GRAPH_CASES } from './fixtures/graph-cases';
import { INFERENCE_CASES } from './fixtures/inference-cases';
import { MIGRATION_CASES } from './fixtures/migration-cases';
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

    it('gate-report.schema.json is generated from the gate report shape', () => {
        const file = root('contract/gate-report.schema.json');
        const generated = `${JSON.stringify(gateReportJsonSchema(), null, 2)}\n`;
        if (update) {
            writeFileSync(file, generated);
        }
        expect(readFileSync(file, 'utf8')).toBe(generated);
    });

    it('gate report fixtures are current', () => {
        artifacts('fixtures/gate/valid', GATE_VALID);
        artifacts('fixtures/gate/invalid', GATE_INVALID);
    });

    it('valid fixtures are current', () => artifacts('fixtures/valid', Object.fromEntries(Object.entries(VALID).map(([n, f]) => [n, f()]))));
    it('invalid fixtures are current', () => artifacts('fixtures/invalid', INVALID));
    it('graph conformance cases are current', () => artifacts('conformance/graph', GRAPH_CASES));
    it('comparison conformance cases are current', () => artifacts('conformance/comparison', COMPARISON_CASES));
    it('migration conformance cases are current', () => artifacts('conformance/migrations', MIGRATION_CASES));
    it('inference conformance cases are current', () => artifacts('conformance/inference', INFERENCE_CASES));
    it('gate conformance cases are current', () => artifacts('conformance/gate', GATE_CASES));
});

describe('valid fixtures', () => {
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(jsonSchema());
    for (const [name, build] of Object.entries(VALID)) {
        it(`${name} passes strict validation and the JSON Schema`, () => {
            const doc = build();
            expect(validateDocument(doc, { strict: true }).errors).toEqual([]);
            expect(validate(doc), JSON.stringify(validate.errors)).toBe(true);
        });

        it(`${name} stores the links the graph builder produces and the associations inference produces`, () => {
            const doc = build();
            expect({ links: doc.links, derivedLinks: doc.derivedLinks }).toEqual(buildGraph(doc));
            expect(doc.inferredAssociations).toEqual(inferAssociations(doc));
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

describe('comparison conformance', () => {
    for (const [name, c] of Object.entries(COMPARISON_CASES)) {
        it(`${name}: ${c.description}`, () => {
            expect(compareScopes(c.input.document, c.input.baseline, c.input.target, { overrides: c.input.overrides, limit: c.input.limit })).toEqual(c.expected);
        });
    }
});

describe('migration conformance', () => {
    for (const [name, c] of Object.entries(MIGRATION_CASES)) {
        it(`${name}: ${c.description}`, () => {
            const history = c.input.revisions === null ? null : migrationHistory(c.input.revisions);
            expect({ history, ...migrationState(history, c.input.current) }).toEqual(c.expected);
        });
    }
});

describe('inference conformance', () => {
    for (const [name, c] of Object.entries(INFERENCE_CASES)) {
        it(`${name}: ${c.description}`, () => {
            expect(c.input.links).toEqual(buildGraph(c.input).links);
            expect(inferAssociations(c.input)).toEqual(c.expected.inferredAssociations);
        });
    }
});

describe('gate reports', () => {
    const schema = new Ajv2020({ strict: true, allErrors: true }).compile(gateReportJsonSchema());
    for (const [name, r] of Object.entries(GATE_VALID)) {
        it(`${name} passes strict validation and the JSON Schema`, () => {
            expect(validateGateReport(r, { strict: true }).errors).toEqual([]);
            expect(schema(r), JSON.stringify(schema.errors)).toBe(true);
        });
    }
    for (const [name, c] of Object.entries(GATE_INVALID)) {
        it(`${name}: ${c.description}`, () => {
            const result = validateGateReport(c.report, { strict: true });
            expect(result.ok).toBe(false);
            for (const message of c.errors) {
                expect(result.errors.some((e) => e.includes(message)), `expected "${message}" in ${JSON.stringify(result.errors)}`).toBe(true);
            }
        });
    }
    it('exits 2 for an incomplete comparison, 1 for qualifying drift and 0 otherwise', () => {
        expect([GATE_VALID.passed.exitCode, GATE_VALID.drift.exitCode, GATE_VALID.incomplete.exitCode]).toEqual([0, 1, 2]);
    });
});

describe('gate conformance', () => {
    const schema = new Ajv2020({ strict: true, allErrors: true }).compile(gateReportJsonSchema());
    for (const [name, c] of Object.entries(GATE_CASES)) {
        it(`${name}: ${c.description}`, () => {
            expect(validateGateReport(c.expected, { strict: true }).errors).toEqual([]);
            expect(schema(c.expected), JSON.stringify(schema.errors)).toBe(true);
            expect(gateDocument(c.input.document, { thresholds: c.input.thresholds, requested: c.input.requested })).toEqual(c.expected);
        });
    }

    it('reads valid case documents strictly, so only the invalid and newer-minor cases test validation', () => {
        for (const [name, c] of Object.entries(GATE_CASES)) {
            const invalid = c.expected.errors.some((e) => e.kind === 'invalid_document' || e.kind === 'validation_incomplete');
            expect(validateDocument(c.input.document, { strict: true }).ok, name).toBe(!invalid);
        }
    });
});

describe('gateDocument', () => {
    const tenants = VALID['comparison-tenant-schemas']();
    const request = (target: string | null, connection = 'app') => ({ baseline: { connection: 'app', schema: 'tenant_a' }, target: { connection, schema: target } });

    it('reports input that could not be parsed as JSON', () => {
        expect(gateDocument(undefined).errors).toEqual([{ kind: 'invalid_document', message: 'The input could not be parsed as JSON.' }]);
    });

    it('defaults each threshold separately', () => {
        expect(gateDocument(tenants).thresholds).toEqual({ severity: 'warning', certainty: 'certain' });
        expect(gateDocument(tenants, { thresholds: { certainty: 'likely' } }).thresholds).toEqual({ severity: 'warning', certainty: 'likely' });
        expect(gateDocument(tenants, { thresholds: null }).thresholds).toEqual({ severity: 'warning', certainty: 'certain' });
    });

    it('sorts and deduplicates requested comparisons', () => {
        const r = gateDocument(tenants, { requested: [request('tenant_b'), request('*'), request('tenant_b')] });
        expect(r.requested).toEqual([request('*'), request('tenant_b')]);
        expect(r.comparisons).toEqual([tenants.comparisons[0].id]);
        expect(r.errors).toEqual([]);
    });

    it('cannot expand a * target without the schemas the inspection read', () => {
        const doc = VALID['comparison-multi-connection']();
        const r = gateDocument({ ...doc, connections: doc.connections.map((c) => ({ ...c, coverage: { ...c.coverage, database: { ...c.coverage.database, schemas: null } } })) }, { requested: [{ baseline: { connection: 'primary', schema: null }, target: { connection: 'replica', schema: '*' } }] });
        expect(r.errors).toEqual([{ kind: 'comparison_not_found', message: 'Requested comparison primary → replica:* cannot be expanded: the inspection of connection replica lists no schemas.' }]);
    });

    it('excludes the baseline\'s own scope from a * expansion, also when the baseline is the default schema', () => {
        const r = gateDocument(tenants, { requested: [{ baseline: { connection: 'app', schema: null }, target: { connection: 'app', schema: '*' } }] });
        expect(r.errors.map((e) => e.message)).toEqual(['Requested comparison app → app:tenant_a is not in the document.', 'Requested comparison app → app:tenant_b is not in the document.']);
    });

    it('reports a request naming a connection the document does not have', () => {
        const r = gateDocument(tenants, { requested: [request(null, 'nowhere')] });
        expect(r.errors).toEqual([{ kind: 'comparison_not_found', message: 'Requested comparison app:tenant_a → nowhere names connection nowhere, which the document does not have.' }]);
    });

    it('labels diagnostics by their subject label, else what their id names, else the id', () => {
        const doc = VALID['combined-multi-connection']();
        const r = gateDocument(doc);
        const labels = r.findings.filter((f) => f.source === 'diagnostic').map((f) => f.label);
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.every((l) => l.length > 0)).toBe(true);
    });

    it('produces valid reports for every valid fixture, and the same bytes on every run', () => {
        for (const build of Object.values(VALID)) {
            const r = gateDocument(build());
            expect(validateGateReport(r, { strict: true }).errors).toEqual([]);
            expect(canonicalJson(gateDocument(build()))).toBe(canonicalJson(r));
        }
    });

    it('never throws, whatever the input', () => {
        for (const input of [null, 0, 'text', [], {}, { format: 'laranex-schema' }, { format: 'laranex-schema', version: 2 }, { format: 'laranex-schema', version: '2.0' }]) {
            expect(gateDocument(input).exitCode).toBe(2);
        }
    });
});

describe('id rules', () => {
    const digest = (prefix: string, parts: unknown[]) => prefix + createHash('sha256').update(JSON.stringify(parts), 'utf8').digest('hex').slice(0, 16);
    it('follow the compact-JSON SHA-256 rule', () => {
        const scope = (schema: string | null) => ({ connection: 'connection:app', schema });
        expect(comparisonId(scope('tenant_a'), scope(null))).toBe(digest('c', ['comparison', 'connection:app', 'tenant_a', 'connection:app', null]));
        const d = { kind: 'k', subject: { type: 'column' as const, id: 't', columns: ['é'], label: null }, message: 'm/x' };
        expect(diagnosticId(d)).toBe(digest('n', ['diagnostic', 'k', 'column', 't', ['é'], 'm/x']));
    });
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
    it('reads later 2.x minors leniently, ignoring their unknown properties, and validates only 2.0 strictly', () => {
        const doc = { ...VALID['database-sqlite-indexes'](), version: '2.7', futureField: true };
        expect(validateDocument(doc).ok).toBe(true);
        expect(validateDocument(doc, { strict: true }).errors).toEqual(['$.version: strict validation is for version 2.0, got "2.7"', '$: unknown property futureField']);
    });

    it('rejects 1.x documents with one clear error', () => {
        expect(validateDocument({ ...VALID['database-sqlite-indexes'](), version: '1.0' }).errors).toEqual(['Unsupported laranex-schema version "1.0"; this reader supports 2.x']);
    });

    it('throws typed errors from assertDocument', () => {
        expect(() => assertDocument({ format: 'other' })).toThrow(UnsupportedDocumentError);
        expect(() => assertDocument({ ...VALID['database-sqlite-indexes'](), connections: 'none' })).toThrow(InvalidDocumentError);
    });
});
