import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bundleFromPage, offlineHtml } from '../src/viewer/offline';
import { VALID } from './fixtures/documents';

const doc = VALID['combined-eloquent']();
// A table comment that tries to end the data block, and a script that mentions its own closing tag.
const hostile = { ...doc, note: '</script><script>alert(1)</script><!--' };
const bundle = { script: 'const a = "</script>"; const b = "<!--"; console.log(a, b);', style: '.lsv{} </style><script>x</script>', icon: 'data:image/svg+xml;base64,PHN2Zy8+' };

describe('offline HTML', () => {
    const html = offlineHtml(bundle, { document: hostile, changes: [{ type: 'table', change: 'added', label: 'x' }], defaultConnection: 'connection:mysql' });
    const page = new DOMParser().parseFromString(html, 'text/html');

    it('embeds the document as data that cannot end its script element', () => {
        const data = page.getElementById('schema-viewer-data');
        expect(page.querySelectorAll('script')).toHaveLength(2);
        const config = JSON.parse(data?.textContent ?? '');
        expect(config.document).toEqual(hostile);
        expect(config.changes).toHaveLength(1);
        expect(config.defaultConnection).toBe('connection:mysql');
        // Host-only settings never reach the file.
        expect(Object.keys(config).sort()).toEqual(['changes', 'defaultConnection', 'document']);
    });

    it('allows exactly its own script by hash, and nothing from the network', () => {
        const script = page.getElementById('lsv-offline-app')?.textContent ?? '';
        expect(script).toBe('const a = "\\x3C/script>"; const b = "\\x3C!--"; console.log(a, b);');
        const policy = page.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
        const hash = createHash('sha256').update(script).digest('base64');
        expect(policy).toContain(`script-src 'sha256-${hash}'`);
        expect(policy).toContain("default-src 'none'");
        expect(policy).toContain("connect-src 'none'");
        expect(policy).not.toContain('unsafe-eval');
        expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
        expect(page.getElementById('lsv-offline-style')?.textContent).toBe('.lsv{} <\\/style><script>x</script>');
        expect(page.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe(bundle.icon);
        expect(html).not.toMatch(/(src|href)="https?:/);
    });

    it('can export itself again from its own elements, byte for byte', () => {
        document.documentElement.innerHTML = page.documentElement.innerHTML;
        const again = bundleFromPage();
        expect(again).not.toBeNull();
        expect(offlineHtml(again!, { document: hostile, changes: [{ type: 'table', change: 'added', label: 'x' }], defaultConnection: 'connection:mysql' })).toBe(html);
        document.documentElement.innerHTML = '<head></head><body></body>';
    });
});
