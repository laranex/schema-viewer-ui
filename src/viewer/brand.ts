// The Laranex Schema Viewer brand mark: two tables joined by a relationship, from Laranex Laravel Schema Viewer (MIT,
// ui/src/App.tsx; see NOTICE), on its 24-unit grid with its 1.8 stroke. The header draws it in var(--accent); the
// favicon, which has no stylesheet, uses the literal values of the viewer's theme tokens below. One module for every
// place the mark appears: the header, favicon.svg and favicon.ico (written at build time), the docs site and any page
// that needs the favicon inline (FAVICON_DATA_URI).

export const BRAND_VIEWBOX = '0 0 24 24';
export const BRAND_STROKE = 1.8;
export const BRAND_RECTS = [
    { x: 2.5, y: 3.5, width: 8, height: 7, rx: 1.5 },
    { x: 13.5, y: 13.5, width: 8, height: 7, rx: 1.5 },
] as const;
export const BRAND_PATH = 'M10.5 7 H14 a2 2 0 0 1 2 2 V13.5';

// The light and dark themes' --surface, --line and --accent (src/viewer/styles.css).
export const FAVICON_COLORS = {
    light: { tile: '#ffffff', edge: '#e4e4e7', mark: '#1e3a8a' },
    dark: { tile: '#141417', edge: '#2a2a30', mark: '#6d8dff' },
} as const;

// The favicon's rounded tile behind the mark.
const TILE = { x: 0.5, y: 0.5, width: 23, height: 23, rx: 5 };

const mark = (stroke: string) =>
    `<g fill="none" stroke="${stroke}" stroke-width="${BRAND_STROKE}" stroke-linecap="round" stroke-linejoin="round">${BRAND_RECTS.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}"/>`).join('')}<path d="${BRAND_PATH}"/></g>`;

// favicon.svg: the light tile, and the dark one when the browser asks for a dark scheme.
export const FAVICON_SVG =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BRAND_VIEWBOX}">` +
    `<style>.t{fill:${FAVICON_COLORS.light.tile};stroke:${FAVICON_COLORS.light.edge}}.m{stroke:${FAVICON_COLORS.light.mark}}` +
    `@media (prefers-color-scheme:dark){.t{fill:${FAVICON_COLORS.dark.tile};stroke:${FAVICON_COLORS.dark.edge}}.m{stroke:${FAVICON_COLORS.dark.mark}}}</style>` +
    `<rect class="t" x="${TILE.x}" y="${TILE.y}" width="${TILE.width}" height="${TILE.height}" rx="${TILE.rx}" stroke-width="1"/>` +
    mark(FAVICON_COLORS.light.mark).replace('<g ', '<g class="m" ') +
    `</svg>\n`;

// The favicon as a data: URI, for a page that carries everything inline (an offline export).
export const FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG.trim())}`;

// The mark alone in one color, for the docs site's logo.
export const brandMarkSvg = (stroke: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BRAND_VIEWBOX}">${mark(stroke)}</svg>\n`;

// The favicon in the light theme as RGBA pixels, for favicon.ico: the same geometry, rasterized with 4×4 samples per
// pixel and no image library, so every build writes the same bytes.
type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

// Signed distance to a rounded rectangle's outline: negative inside.
function roundRect(x: number, y: number, r: { x: number; y: number; width: number; height: number; rx: number }) {
    const hx = r.width / 2 - r.rx;
    const hy = r.height / 2 - r.rx;
    const qx = Math.abs(x - (r.x + r.width / 2)) - hx;
    const qy = Math.abs(y - (r.y + r.height / 2)) - hy;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r.rx;
}

const segment = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
};

// Distance to BRAND_PATH: a line, a quarter circle around (14, 9) from (14, 7) to (16, 9), and a line.
function pathDistance(x: number, y: number) {
    const arc = x >= 14 && y <= 9 ? Math.abs(Math.hypot(x - 14, y - 9) - 2) : Infinity;
    return Math.min(segment(x, y, 10.5, 7, 14, 7), arc, segment(x, y, 16, 9, 16, 13.5));
}

function colorAt(x: number, y: number): Rgb | null {
    const { tile, edge, mark: ink } = FAVICON_COLORS.light;
    const half = BRAND_STROKE / 2;
    if (pathDistance(x, y) <= half || BRAND_RECTS.some((r) => Math.abs(roundRect(x, y, r)) <= half)) {
        return rgb(ink);
    }
    const d = roundRect(x, y, TILE);
    return Math.abs(d) <= 0.5 ? rgb(edge) : d < 0 ? rgb(tile) : null;
}

export function faviconPixels(size: number): Uint8Array {
    const pixels = new Uint8Array(size * size * 4);
    const n = 4;
    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            const sum = [0, 0, 0];
            let covered = 0;
            for (let sy = 0; sy < n; sy++) {
                for (let sx = 0; sx < n; sx++) {
                    const c = colorAt(((px + (sx + 0.5) / n) * 24) / size, ((py + (sy + 0.5) / n) * 24) / size);
                    if (c) {
                        covered++;
                        c.forEach((v, i) => (sum[i] += v));
                    }
                }
            }
            const at = (py * size + px) * 4;
            if (covered) {
                sum.forEach((v, i) => (pixels[at + i] = Math.round(v / covered)));
                pixels[at + 3] = Math.round((covered / (n * n)) * 255);
            }
        }
    }
    return pixels;
}
