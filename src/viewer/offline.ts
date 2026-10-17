import { sha256 } from '../contract/sha256';
import type { ViewerConfig } from '../contract/viewer-config';
import { FAVICON_DATA_URI } from './brand';
import { dataUrl } from './exportImage';

// The whole viewer as one self-contained HTML file, after Laranex Laravel Schema Viewer's "This page as HTML": the
// single-file viewer script (dist/viewer/offline.js, with the ELK layout engine inlined), its stylesheet with the fonts
// embedded, the brand mark as its favicon (brand.ts FAVICON_DATA_URI), and the document as data. It opens from file://
// with no network access and carries its own Content-Security-Policy: the one script is allowed by its SHA-256 hash,
// everything else comes from data: URLs.

// What the file is built from: the script and stylesheet texts.
export type OfflineBundle = { script: string; style: string };

const SCRIPT_ID = 'lsv-offline-app';
const STYLE_ID = 'lsv-offline-style';

// The bundle this page was built from, when it is itself an offline export, so it can export itself again.
export function bundleFromPage(): OfflineBundle | null {
    const script = document.getElementById(SCRIPT_ID)?.textContent;
    const style = document.getElementById(STYLE_ID)?.textContent;
    return script && style ? { script, style } : null;
}

async function text(url: URL): Promise<string> {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
        throw new Error(`Could not read ${url.pathname} (HTTP ${response.status}).`);
    }
    return response.text();
}

// The bundle from the standalone viewer's directory (dist/viewer as a host serves it): offline.js and app.css with its
// WOFF2 fonts as data URLs (WOFF fallbacks dropped). Only same-origin requests, which script-src 'self' pages may make.
export async function fetchOfflineBundle(base: string | URL): Promise<OfflineBundle> {
    const at = (path: string) => new URL(path, base);
    const [script, css] = await Promise.all([text(at('offline.js')), text(at('app.css'))]);
    const withoutWoff = css.replace(/,\s*url\(["']?[^"')]+\.woff["']?\)\s*format\(["']woff["']\)/g, '');
    const fonts = [...new Set(withoutWoff.match(/url\(["']?[^"')]+\.woff2["']?\)/g) ?? [])];
    const inlined = await Promise.all(fonts.map(async (ref) => [ref, `url(${await dataUrl(at(ref.slice(4, -1).replace(/["']/g, '')).href)})`] as const));
    return { script, style: inlined.reduce((out, [ref, data]) => out.split(ref).join(data), withoutWoff) };
}

const hexToBase64 = (hex: string) => btoa(String.fromCharCode(...(hex.match(/../g) ?? []).map((h) => parseInt(h, 16))));
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The document and its page settings for the file. Host-only settings are never written: no editor (it would leak
// local paths and open nothing offline) and no host downloads (the file makes its own); changes are kept.
export type OfflineConfig = Pick<ViewerConfig, 'document' | 'changes' | 'defaultConnection'>;

export function offlineHtml(bundle: OfflineBundle, config: OfflineConfig, title = 'Schema Viewer'): string {
    // Nothing inside may end its element early: "</script", "<!--" and "<script" become "\x3C…" (the same string in
    // JavaScript), "</style" becomes "<\/style" (the same in CSS), and "<" in the JSON becomes "<".
    const script = bundle.script.replace(/<(\/?script|!--)/gi, '\\x3C$1');
    const style = bundle.style.replace(/<\/style/gi, '<\\/style');
    const data = JSON.stringify({ document: config.document, changes: config.changes ?? null, defaultConnection: config.defaultConnection ?? null }).replace(/</g, '\\u003c');
    const policy = [
        "default-src 'none'",
        `script-src 'sha256-${hexToBase64(sha256(script))}'`,
        "style-src 'unsafe-inline'",
        'img-src data: blob:',
        'font-src data:',
        "connect-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
    ].join('; ');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="robots" content="noindex, nofollow">
<title>${escapeAttribute(title)}</title>
<link rel="icon" href="${escapeAttribute(FAVICON_DATA_URI)}" type="image/svg+xml">
<style id="${STYLE_ID}">${style}</style>
</head>
<body>
<div id="schema-viewer"></div>
<script type="application/json" id="schema-viewer-data">${data}</script>
<script type="module" id="${SCRIPT_ID}">${script}</script>
</body>
</html>
`;
}
