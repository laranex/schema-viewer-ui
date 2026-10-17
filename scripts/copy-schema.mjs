// Publishes the contract's JSON Schema at dist/schema.json for hosts that validate snapshots without JavaScript.
import { copyFileSync } from 'node:fs';

copyFileSync(new URL('../src/contract/schema.json', import.meta.url), new URL('../dist/schema.json', import.meta.url));
