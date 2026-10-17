import { Parser } from '@dbml/core';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { large } from '../dev/large';
import { buildGraph, canonicalJson, validateDocument, type SchemaDocument } from '../src/contract';
import { dbml, EXPORTERS, exportFileName, json, markdown, mermaid, scopeDocument, type Exporter, type ExportOptions } from '../src/export';
import { EXPORT_DOCUMENTS } from './fixtures/export-documents';
import { root } from './helpers';

// Golden files under tests/fixtures/export/: <document>[@<connection>][.orm].<extension> and the warnings of each in
// <document>[@<connection>][.orm].warnings.json. UPDATE_EXPORTS=1 writes them; review every change.

const GOLDEN = root('tests/fixtures/export');
const update = process.env.UPDATE_EXPORTS === '1';

const valid = Object.fromEntries(readdirSync(root('contract/fixtures/valid')).map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(root('contract/fixtures/valid', f), 'utf8')) as SchemaDocument]));
const DOCUMENTS: Record<string, SchemaDocument> = { ...valid, ...Object.fromEntries(Object.entries(EXPORT_DOCUMENTS).map(([k, f]) => [k, f()])) };
const TEXT: Exporter[] = [mermaid, dbml, markdown];

type Case = { name: string; doc: SchemaDocument; options: ExportOptions; exporters: Exporter[] };
const CASES: Case[] = Object.entries(DOCUMENTS).flatMap(([name, doc]): Case[] => [
    { name, doc, options: {}, exporters: TEXT },
    ...(doc.connections.length > 1 ? doc.connections.map((c) => ({ name: `${name}@${c.name}`, doc, options: { connections: [c.id] }, exporters: [...TEXT, json] })) : []),
    ...(doc.relationships.length || doc.inferredAssociations.length ? [{ name: `${name}.orm`, doc, options: { orm: true }, exporters: [mermaid, markdown] }] : []),
]);

function golden(file: string, actual: string) {
    const path = `${GOLDEN}/${file}`;
    if (update || !existsSync(path)) {
        mkdirSync(GOLDEN, { recursive: true });
        writeFileSync(path, actual);
    }
    expect(actual, file).toBe(readFileSync(path, 'utf8'));
}

describe('exporters against golden files', () => {
    it.each(Object.keys(EXPORT_DOCUMENTS))('the synthetic export document %s is strictly valid', (name) => {
        expect(validateDocument(DOCUMENTS[name], { strict: true }).errors).toEqual([]);
    });

    it.each(CASES.map((c) => [c.name, c] as const))('%s', (_, { name, doc, options, exporters }) => {
        const warnings: Record<string, unknown> = {};
        for (const exporter of exporters) {
            const result = exporter.export(doc, options);
            golden(`${name}.${exporter.extension}`, result.content);
            warnings[exporter.id] = result.warnings;
            // Pure and deterministic: the same bytes and warnings again.
            expect(exporter.export(doc, options)).toEqual(result);
        }
        golden(`${name}.warnings.json`, `${JSON.stringify(warnings, null, 2)}\n`);
    });
});

// The lines where the shared exporters differ from Laranex Laravel Schema Viewer's output for the same input, each a
// documented improvement (docs/exports.md).
describe('Laravel parity', () => {
    const doc = DOCUMENTS['export-laravel-parity'];
    const laravel = (ext: string) => readFileSync(root('tests/fixtures/export/laravel', `laravel-schema-mysql.${ext}`), 'utf8');
    // The lines only one side has, each once, sorted.
    const diff = (ours: string, theirs: string) => {
        const a = ours.split('\n');
        const b = theirs.split('\n');
        const only = (x: string[], y: string[]) => [...new Set(x.filter((l) => !y.includes(l)))].sort();
        return { added: only(a, b), removed: only(b, a) };
    };

    it('writes Laravel’s Mermaid, adding UK markers for single-column unique keys', () => {
        expect(diff(mermaid.export(doc).content, laravel('mmd'))).toEqual({
            added: ['        bigint user_id FK, UK', '        varchar email UK'],
            removed: ['        bigint user_id FK', '        varchar email'],
        });
    });

    it('writes Laravel’s DBML, keeping the expression index Laravel drops', () => {
        expect(diff(dbml.export(doc).content, laravel('dbml'))).toEqual({ added: ["    `lower(email)` [name: 'users_lower_email_index']"], removed: [] });
    });

    it('writes Laravel’s Markdown, stating expression and partial indexes, unique keys, auto-increment and the framework table', () => {
        expect(diff(markdown.export(doc).content, laravel('md'))).toEqual({
            added: [
                '- `users_active_partial` (status), partial',
                '- `users_lower_email_index` (`lower(email)`)',
                'Framework table.',
                '| `email` | varchar(255) |  |  | UK | Login name |',
                '| `id` | bigint unsigned auto-increment |  |  | PK |  |',
                '| `id` | integer auto-increment |  |  | PK |  |',
            ],
            removed: ['- `users_active_partial` (status)', '- `users_lower_email_index` ()', '| `email` | varchar(255) |  |  |  | Login name |', '| `id` | bigint unsigned |  |  | PK |  |', '| `id` | integer |  |  | PK |  |'],
        });
    });
});

describe('what the exports may and may not say', () => {
    it('never turns an ORM relationship, a relationship-only link or an inferred association into a foreign key', () => {
        for (const [name, doc] of Object.entries(DOCUMENTS)) {
            const physical = doc.connections.flatMap((c) => c.tables.flatMap((t) => t.foreignKeys.filter((f) => doc.source !== 'combined' || f.provenance.includes('database'))));
            const refs = dbml.export(doc).content.split('\n').filter((l) => l.startsWith('Ref'));
            expect(refs.length, name).toBeLessThanOrEqual(physical.length);
            const fkLines = mermaid.export(doc).content.split('\n').filter((l) => /--/.test(l));
            expect(fkLines.length, name).toBeLessThanOrEqual(physical.length);
            expect(mermaid.export(doc).content, name).not.toContain('..');
            const md = markdown.export(doc).content;
            const listed = md.split('\n').filter((l) => l.startsWith('- ') && l.includes(' → ') && /, on update /.test(l));
            const names = new Set(physical.map((f) => `\`${f.name}\``));
            expect(listed.every((l) => names.has(l.slice(2, l.indexOf(':')))), name).toBe(true);
            expect(listed.length, name).toBeLessThanOrEqual(physical.length);
            for (const r of doc.relationships) {
                expect(md, `${name}: ${r.id}`).not.toContain(`::${r.name}`);
            }
        }
    });

    it('leaves out a foreign key only the ORM declares in a combined document, and says so', () => {
        const doc = DOCUMENTS['combined-drift'];
        for (const exporter of TEXT) {
            const { content, warnings } = exporter.export(doc);
            expect(content).not.toContain('fk_users_team');
            expect(content).not.toMatch(/teams \|\|--o\{ users|users\.team_id > teams|FK → public\.teams/);
            expect(warnings).toContainEqual(expect.objectContaining({ code: 'skipped_entity', subject: expect.objectContaining({ type: 'foreignKey' }) }));
            expect(content).not.toContain('nickname');
        }
    });

    it('labels ORM relationships and inferred associations as what they are, only when asked', () => {
        const eloquent = DOCUMENTS['combined-eloquent'];
        const withOrm = mermaid.export(eloquent, { orm: true }).content;
        const ormLines = withOrm.split('\n').filter((l) => l.includes('..'));
        expect(ormLines.length).toBeGreaterThan(0);
        expect(ormLines.every((l) => /: "(ORM: |inferred: )/.test(l))).toBe(true);
        const inferred = mermaid.export(DOCUMENTS['inferred-associations'], { orm: true }).content;
        expect(inferred).toContain('inferred: ');
        expect(inferred).toContain('(no ORM attribute declared)');
        const md = markdown.export(DOCUMENTS['inferred-associations'], { orm: true }).content;
        expect(md).toContain('# ORM declarations');
        expect(md).toContain('These are not database constraints');
        expect(md).toContain('## Inferred associations');
        expect(dbml.export(eloquent, { orm: true }).content).toBe(dbml.export(eloquent).content);
    });

    it('invents nothing: no default, unique or not-null the document does not state', () => {
        const doc = DOCUMENTS['export-laravel-parity'];
        const out = dbml.export(doc).content;
        expect(out.match(/default:/g)).toHaveLength(1);
        expect(out.match(/unique/g)).toHaveLength(2);
        expect(out).toContain('"meta data" json [note:');
        expect(out).not.toMatch(/"meta data" json \[[^\]]*not null/);
    });

    it('reports what each format cannot state', () => {
        const doc = DOCUMENTS['export-edge-cases'];
        const messages = (exporter: Exporter) => exporter.export(doc).warnings.map((w) => `${w.code}: ${w.message}`);
        const d = messages(dbml);
        for (const expected of [/predicate WHERE \(quantity > 0\)/, /included columns \(price\)/, /prefix length 10/, /operator class text_pattern_ops/, /method gin/, /dialect options \(postgresql\)/, /odd_opaque_idx .* not reported/, /generated \(stored\) column/, /column collation/, /deferrable, initially deferred/, /same columns as children_parent_id_fkey/, /parents_opaque_check .* no reported expression/, /parents_codes_key .* unique index/, /backtick/, /incomplete \(indexPredicates: partial\)/]) {
            expect(d.some((m) => expected.test(m)), String(expected)).toBe(true);
        }
        const m = messages(mermaid);
        expect(m.some((x) => /indexes, .*check constraint/.test(x))).toBe(true);
        expect(m.some((x) => /order "items" <b> → my_schema_order__items___b_/.test(x))).toBe(true);
        expect(m.some((x) => /2fa_secret → _2fa_secret/.test(x))).toBe(true);
        expect(m.some((x) => /Composite foreign key children_parent_codes_fkey/.test(x))).toBe(true);
    });
});

describe('escaping', () => {
    const doc = DOCUMENTS['export-edge-cases'];

    it('keeps every Markdown table row at six cells and no raw HTML outside code spans', () => {
        const md = markdown.export(doc).content;
        const rows = md.split('\n').filter((l) => l.startsWith('| '));
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            const cells = row.replace(/\\\|/g, '').split('|').slice(1, -1);
            expect(cells, row).toHaveLength(6);
        }
        const outside = md.replace(/`[^`\n]*`/g, '');
        expect(outside).not.toMatch(/<[a-z/]/i);
        expect(md).toContain('&lt;script&gt;');
    });

    it('keeps Mermaid identifiers and labels inside the grammar', () => {
        const lines = mermaid.export(doc, { orm: true }).content.trimEnd().split('\n');
        expect(lines[0]).toBe('erDiagram');
        for (const line of lines.slice(1)) {
            expect(line, line).toMatch(/^( {4}[A-Za-z_][A-Za-z0-9_]* \{| {8}[A-Za-z_][A-Za-z0-9_]* [A-Za-z_][A-Za-z0-9_]*( (PK|FK|UK)(, (PK|FK|UK))*)?| {4}\}| {4}[A-Za-z_][A-Za-z0-9_]* (\|\||\|o|\}o)(--|\.\.)(o\||o\{) [A-Za-z_][A-Za-z0-9_]* : "[^"\n]*")$/);
        }
    });

    it('quotes and escapes DBML names, types and notes so dbdiagram.io reads them back', () => {
        const out = dbml.export(doc).content;
        expect(out).toContain('Table "my schema"."order \\"items\\" <b>" {');
        expect(out).toContain('"na|me" "character varying(80)"');
        expect(out).toContain("note: 'Pipe | and <script>alert(1)</script> second line · It\\'s a `note` with \\\\ backslash'");
    });
});

describe('DBML parsed back with @dbml/core', () => {
    const parse = (text: string) => new Parser().parse(text, 'dbmlv2');
    it.each(CASES.filter((c) => c.exporters.includes(dbml)).map((c) => [c.name, c] as const))('%s', (_, { doc, options }) => {
        const content = dbml.export(doc, options).content;
        const db = parse(content);
        // DBML puts an unqualified table in its default schema, public.
        const parsed = new Map(db.schemas.flatMap((s) => s.tables.map((t) => [`${s.name}|${t.name}`, t.fields.map((f) => f.name)] as const)));
        const scoped = doc.connections.filter((c) => !options.connections || options.connections.includes(c.id));
        const several = scoped.length > 1;
        const expected = new Map(
            scoped.flatMap((c) =>
                c.tables
                    .filter((t) => doc.source !== 'combined' || t.provenance.includes('database'))
                    .map((t) => [several ? `public|${c.name}.${t.schema ? `${t.schema}.` : ''}${t.name}` : `${t.schema ?? 'public'}|${t.name}`, t.columns.filter((col) => doc.source !== 'combined' || col.provenance.includes('database')).map((col) => col.name)] as const),
            ),
        );
        expect(parsed).toEqual(expected);
        const refs = db.schemas.flatMap((s) => s.refs);
        expect(refs.length).toBe(content.split('\n').filter((l) => l.startsWith('Ref')).length);
    });
});

describe('scoped JSON documents', () => {
    const several = Object.entries(DOCUMENTS).filter(([, doc]) => doc.connections.length > 1);

    it.each(several.flatMap(([name, doc]) => doc.connections.map((c) => [`${name}@${c.name}`, doc, c.id] as const)))('%s is a strictly valid document of one connection', (_, doc, id) => {
        const { document } = scopeDocument(doc, [id]);
        expect(validateDocument(document, { strict: true }).errors).toEqual([]);
        expect(document.connections.map((c) => c.id)).toEqual([id]);
        const tables = new Set(document.connections[0].tables.map((t) => t.id));
        expect(canonicalJson(buildGraph(document))).toBe(canonicalJson({ links: document.links, derivedLinks: document.derivedLinks }));
        for (const r of document.relationships) {
            expect(tables.has(r.table)).toBe(true);
            expect(r.relatedTable === null || tables.has(r.relatedTable)).toBe(true);
        }
        expect(document.models.every((m) => m.tables.every((t) => tables.has(t)))).toBe(true);
        expect(JSON.parse(json.export(doc, { connections: [id] }).content)).toEqual(document);
    });

    it('leaves out relationships that cross to another connection, and says so', () => {
        const doc = DOCUMENTS['combined-multi-connection'];
        const { document, warnings } = scopeDocument(doc, ['connection:cache']);
        expect(document.relationships.map((r) => r.id)).toEqual([]);
        expect(warnings.map((w) => w.subject.id)).toEqual(expect.arrayContaining(['App\\Models\\Session::user']));
        expect(document.diagnostics.map((d) => d.kind)).not.toContain('relationship_without_foreign_key');
    });

    it('writes the whole document when every connection is chosen', () => {
        const doc = DOCUMENTS['combined-multi-connection'];
        expect(json.export(doc).content).toBe(`${JSON.stringify(doc, null, 2)}\n`);
        expect(json.export(doc, { connections: doc.connections.map((c) => c.id) }).content).toBe(`${JSON.stringify(doc, null, 2)}\n`);
    });
});

describe('scope and file names', () => {
    it('names files after the connection, as Laravel does', () => {
        const doc = DOCUMENTS['combined-multi-connection'];
        expect(exportFileName(doc, 'mmd', ['connection:app'])).toBe('schema-app.mmd');
        expect(exportFileName(doc, 'dbml')).toBe('schema-all.dbml');
        expect(exportFileName(DOCUMENTS['export-edge-cases'], 'md')).toBe('schema-edge-cases.md');
    });

    it('refuses an unknown connection', () => {
        expect(() => mermaid.export(DOCUMENTS['combined-multi-connection'], { connections: ['connection:nope'] })).toThrow('Unknown connection: connection:nope');
    });

    it('lists every exporter once, with a file extension and media type', () => {
        expect(EXPORTERS.map((e) => [e.id, e.extension, e.mediaType])).toEqual([
            ['mermaid', 'mmd', 'text/plain'],
            ['dbml', 'dbml', 'text/plain'],
            ['markdown', 'md', 'text/markdown'],
            ['json', 'json', 'application/json'],
        ]);
    });
});

describe('performance', () => {
    it('exports a 250-table schema in every format within the budget', () => {
        const doc = large(250);
        const start = performance.now();
        for (const exporter of EXPORTERS) {
            exporter.export(doc);
        }
        mermaid.export(doc, { orm: true });
        markdown.export(doc, { orm: true });
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(1500);
    });
});
