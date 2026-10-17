#!/usr/bin/env node
// Checks laranex-schema documents a producer wrote, for Laravel, Python and Node.js CI alike:
//
//   node node_modules/laranex-schema-viewer-ui/contract/check.mjs [--lenient] [--no-graph] [--no-canonical] FILE...
//
// By default a document must pass strict validation, store exactly the links the shared graph builder produces, and
// be written in canonical form. Exits 1 when any file fails.
import { readFileSync } from 'node:fs';
import { buildGraph, canonicalJson, validateDocument } from '../dist/lib/contract.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const files = args.filter((a) => !a.startsWith('--'));
if (files.length === 0 || flags.has('--help')) {
    console.error('usage: check.mjs [--lenient] [--no-graph] [--no-canonical] FILE...');
    process.exit(files.length === 0 ? 2 : 0);
}

let failed = false;
for (const file of files) {
    const problems = [];
    const text = readFileSync(file, 'utf8');
    let doc;
    try {
        doc = JSON.parse(text);
    } catch (error) {
        problems.push(`not JSON: ${error.message}`);
    }
    if (doc !== undefined) {
        const result = validateDocument(doc, { strict: !flags.has('--lenient') });
        problems.push(...result.errors);
        if (result.ok && !flags.has('--no-graph')) {
            const expected = buildGraph(doc);
            if (canonicalJson(expected.links) !== canonicalJson(doc.links)) {
                problems.push('links differ from the shared graph builder');
            }
            if (canonicalJson(expected.derivedLinks) !== canonicalJson(doc.derivedLinks)) {
                problems.push('derivedLinks differ from the shared graph builder');
            }
        }
        if (!flags.has('--no-canonical') && canonicalJson(doc) !== text) {
            problems.push('not in canonical form (sorted keys, two-space indentation, trailing newline)');
        }
    }
    if (problems.length) {
        failed = true;
        console.error(`✗ ${file}`);
        problems.forEach((p) => console.error(`  ${p}`));
    } else {
        console.log(`✓ ${file}`);
    }
}
process.exit(failed ? 1 : 0);
