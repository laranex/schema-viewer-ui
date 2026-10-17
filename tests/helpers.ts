import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Paths from the package root: under jsdom, import.meta.url is not a file URL.
export const root = (...parts: string[]) => resolve(process.cwd(), ...parts);

export const fixture = (name: string): any => JSON.parse(readFileSync(root('tests/fixtures', name), 'utf8'));
