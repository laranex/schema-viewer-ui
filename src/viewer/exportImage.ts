import { HEADER_HEIGHT, ROW_HEIGHT, MORE_HEIGHT, type EdgeKind } from './graph';
import { orthogonal } from './routing';

// The diagram as an image, after Laranex Laravel Schema Viewer's ui/src/exportImage.ts: a model of what the viewer
// shows, turned into one list of shapes that is written either as SVG text or straight onto a canvas for PNG, so the
// two always agree. The PNG never loads an image from a blob or data URL, so it works under a Content-Security-Policy
// without img-src blob: or data:.

export type Change = 'missing' | 'extra' | 'changed';
// A comparison mark: the kind of difference, and whether it rests on a heuristic.
export type ImageMark = { change: Change; likely: boolean };

export type ImageRow = { note: boolean; key: string; name: string; type: string; flag: 'drift' | 'declared-only' | null; mark?: ImageMark | null };
// external: a table on another connection, drawn as a dashed reference. issues: the diagnostics about the table.
// chip: the table's comparison chip, such as "~ 3" or "− missing".
export type ImageNode = {
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    subtitle: string;
    rows: ImageRow[];
    more: number;
    declaredOnly: boolean;
    external?: boolean;
    issues?: number;
    pivot?: boolean;
    chip?: (ImageMark & { text: string }) | null;
};
// The frame around one connection's tables, when every connection is on the diagram.
export type ImageFrame = { x: number; y: number; width: number; height: number; title: string; meta: string };
// The marks at an edge's ends: crow's foot (many), bar (one), double bar (the referenced parent), or an arrow.
export type EdgeEnd = 'many' | 'one' | 'parent' | 'arrow' | null;
export type ImageEdge = {
    kind: EdgeKind;
    declaredOnly: boolean;
    // A foreign key an inferred association rests on, while inferred associations are shown.
    inferred?: boolean;
    sx: number;
    sy: number;
    cx: number;
    tx: number;
    ty: number;
    label: { x: number; y: number; text: string; chip?: string } | null;
    start?: EdgeEnd;
    end?: EdgeEnd;
};
export type Bounds = { x: number; y: number; width: number; height: number };
// fonts: @font-face rules with embedded font data, so the SVG renders the same anywhere.
export type ImageModel = { nodes: ImageNode[]; edges: ImageEdge[]; frames?: ImageFrame[]; bounds: Bounds; fonts?: string };

export const COLOR_TOKENS = ['bg', 'surface', 'surface-2', 'line', 'line-strong', 'fg', 'muted', 'accent', 'accent-ink', 'accent-soft', 'fk', 'both', 'declared', 'warning', 'inferred', 'missing', 'extra', 'changed'] as const;
export type Colors = Record<(typeof COLOR_TOKENS)[number], string>;

export function colorsOf(element: Element): Colors {
    const style = getComputedStyle(element);
    return Object.fromEntries(COLOR_TOKENS.map((t) => [t, style.getPropertyValue(`--${t}`).trim() || '#888'])) as Colors;
}

const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";
const SANS = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif";

export function boundsOf(nodes: Bounds[], padding = 32): Bounds {
    if (!nodes.length) {
        return { x: 0, y: 0, width: 400, height: 200 };
    }
    const left = Math.min(...nodes.map((n) => n.x));
    const top = Math.min(...nodes.map((n) => n.y));
    const right = Math.max(...nodes.map((n) => n.x + n.width));
    const bottom = Math.max(...nodes.map((n) => n.y + n.height));
    return { x: left - padding, y: top - padding, width: right - left + padding * 2, height: bottom - top + padding * 2 };
}

// Only what lies in the given area, for "what's on screen" exports.
export function clip(model: ImageModel, area: Bounds): ImageModel {
    const inside = (x: number, y: number, w: number, h: number) => x < area.x + area.width && x + w > area.x && y < area.y + area.height && y + h > area.y;
    return {
        ...model,
        nodes: model.nodes.filter((n) => inside(n.x, n.y, n.width, n.height)),
        frames: model.frames?.filter((f) => inside(f.x, f.y, f.width, f.height)),
        edges: model.edges.filter((e) => inside(Math.min(e.sx, e.tx, e.cx), Math.min(e.sy, e.ty), Math.abs(e.tx - e.sx) + 1, Math.abs(e.ty - e.sy) + 1)),
        bounds: area,
    };
}

// Text cut to a width by the average advance of the font.
export function cut(text: string, width: number, size: number, mono = true): string {
    const max = Math.floor(width / (size * (mono ? 0.6 : 0.56)));
    return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}
const advance = (text: string, size: number, mono = true) => text.length * size * (mono ? 0.6 : 0.56);

const STROKE: Record<EdgeKind, { color: keyof Colors; width: number; dash: number[] }> = {
    both: { color: 'both', width: 1.8, dash: [] },
    foreign_key: { color: 'fk', width: 1.6, dash: [] },
    relationship: { color: 'accent', width: 1.8, dash: [7, 5] },
    through: { color: 'accent', width: 1.8, dash: [2, 4] },
};

// As on screen: an inferred association's styling wins over a declared-only foreign key's, which wins over the kind's.
const strokeOf = (e: ImageEdge, c: Colors) =>
    e.inferred ? { color: c.inferred, width: 1.8, dash: [10, 3, 2, 3] } : e.declaredOnly ? { color: c.declared, width: 1.6, dash: [7, 5] } : { ...STROKE[e.kind], color: c[STROKE[e.kind].color] };

// The shapes both writers draw.
type Font = { family: string; size: number; weight?: number; italic?: boolean };
type Shape =
    | { type: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: string; fillOpacity?: number; stroke?: string; strokeWidth?: number; dash?: number[] }
    | { type: 'path'; d: string; stroke?: string; width?: number; dash?: number[]; fill?: string }
    | { type: 'text'; x: number; y: number; text: string; font: Font; fill: string; anchor?: 'start' | 'middle' | 'end'; halo?: string };

// An end mark in a 14 × 14 box whose x = 13 touches the card, turned to face it: dir is +1 when the card lies towards
// +x from the line's end.
const END_PATHS: Record<Exclude<EdgeEnd, null>, number[][][]> = {
    many: [
        [
            [1, 7],
            [13, 1],
        ],
        [
            [1, 7],
            [13, 7],
        ],
        [
            [1, 7],
            [13, 13],
        ],
    ],
    one: [
        [
            [8, 1],
            [8, 13],
        ],
    ],
    parent: [
        [
            [5, 1],
            [5, 13],
        ],
        [
            [9, 1],
            [9, 13],
        ],
    ],
    arrow: [
        [
            [3, 2],
            [13, 7],
            [3, 12],
        ],
    ],
};

function endShapes(end: EdgeEnd | undefined, x: number, y: number, dir: number, color: string): Shape[] {
    if (!end) {
        return [];
    }
    const at = ([px, py]: number[]) => `${x + dir * (px - 13)} ${y + py - 7}`;
    return END_PATHS[end].map((points) =>
        end === 'arrow' ? { type: 'path', d: `M ${points.map(at).join(' L ')} Z`, fill: color } : { type: 'path', d: `M ${points.map(at).join(' L ')}`, stroke: color, width: 1.6 },
    );
}

const CHANGE_SYMBOL: Record<Change, string> = { missing: '−', extra: '+', changed: '~' };

function scene(model: ImageModel, c: Colors): Shape[] {
    const out: Shape[] = [];
    const text = (x: number, y: number, value: string, font: Font, fill: string, anchor?: 'start' | 'middle' | 'end', halo?: string): Shape => ({ type: 'text', x, y, text: value, font, fill, anchor, halo });
    for (const f of model.frames ?? []) {
        out.push({ type: 'rect', x: f.x, y: f.y, w: f.width, h: f.height, r: 22, fill: c['accent-soft'], fillOpacity: 0.4, stroke: c['line-strong'], strokeWidth: 1.5, dash: [6, 6] });
        out.push(text(f.x + 24, f.y + 40, cut(f.title, f.width / 2, 22), { family: MONO, size: 22, weight: 500 }, c.fg));
        out.push(text(f.x + 24, f.y + 60, cut(f.meta, f.width - 48, 13, false), { family: SANS, size: 13 }, c.muted));
    }
    for (const e of model.edges) {
        const s = strokeOf(e, c);
        out.push({ type: 'path', d: orthogonal(e.sx, e.sy, e.cx, e.tx, e.ty), stroke: s.color, width: s.width, dash: s.dash });
        out.push(...endShapes(e.start, e.sx, e.sy, -(Math.sign(e.cx - e.sx) || 1), s.color));
        out.push(...endShapes(e.end, e.tx, e.ty, Math.sign(e.tx - e.cx) || 1, s.color));
    }
    for (const n of model.nodes) {
        if (n.external) {
            out.push({ type: 'rect', x: n.x, y: n.y, w: n.width, h: n.height, r: 10, fill: c['accent-soft'], stroke: c.accent, strokeWidth: 1.5, dash: [6, 4] });
            out.push(text(n.x + 14, n.y + 26, cut(n.subtitle.toUpperCase(), n.width - 28, 10, false), { family: SANS, size: 10, weight: 600 }, c['accent-ink']));
            out.push(text(n.x + 14, n.y + 46, cut(n.title, n.width - 28, 12), { family: MONO, size: 12, weight: 600 }, c.fg));
            continue;
        }
        const change = n.chip?.change;
        const border = change === 'missing' || change === 'extra' ? c[change] : n.declaredOnly ? c.declared : c['line-strong'];
        out.push({ type: 'rect', x: n.x, y: n.y, w: n.width, h: n.height, r: 10, fill: c.surface, stroke: border, strokeWidth: 1, dash: n.declaredOnly ? [6, 4] : undefined });
        if (change) {
            out.push({ type: 'rect', x: n.x + 1, y: n.y + 6, w: 3, h: HEADER_HEIGHT - 12, fill: c[change] });
        }
        out.push({ type: 'path', d: `M ${n.x} ${n.y + HEADER_HEIGHT} H ${n.x + n.width}`, stroke: c.line, width: 1 });
        // Badges at the right of the header: the comparison chip, then the diagnostics count.
        let right = n.x + n.width - 12;
        if (n.chip) {
            const label = `${CHANGE_SYMBOL[n.chip.change]} ${n.chip.text}${n.chip.likely ? ' likely' : ''}`;
            const w = advance(label, 9.5) + 10;
            out.push({ type: 'rect', x: right - w, y: n.y + 10, w, h: 16, r: 4, fill: c.surface, stroke: c[n.chip.change], strokeWidth: 1, dash: n.chip.likely ? [3, 2] : undefined });
            out.push(text(right - w / 2, n.y + 21.5, label, { family: MONO, size: 9.5, weight: 600 }, c[n.chip.change], 'middle'));
            right -= w + 6;
        }
        if (n.issues) {
            const label = String(n.issues);
            const w = Math.max(18, advance(label, 10) + 10);
            out.push({ type: 'rect', x: right - w, y: n.y + 9, w, h: 18, r: 9, fill: c.warning, fillOpacity: 0.16 });
            out.push(text(right - w / 2, n.y + 21.5, label, { family: MONO, size: 10, weight: 600 }, c.warning, 'middle'));
            right -= w + 6;
        }
        out.push(text(n.x + 12, n.y + 24, cut(n.title, right - n.x - 12, 12), { family: MONO, size: 12, weight: 600 }, c.fg));
        const subtitle = cut(n.subtitle, n.width - 24 - (n.pivot ? 44 : 0), 10, false);
        out.push(text(n.x + 12, n.y + 40, subtitle, { family: SANS, size: 10 }, c.muted));
        if (n.pivot) {
            const x = n.x + 12 + advance(subtitle, 10, false) + (subtitle ? 6 : 0);
            out.push({ type: 'rect', x, y: n.y + 31, w: 34, h: 12, r: 3, stroke: c.accent, strokeWidth: 1 });
            out.push(text(x + 17, n.y + 40, 'PIVOT', { family: MONO, size: 8.5, weight: 600 }, c['accent-ink'], 'middle'));
        }
        n.rows.forEach((r, i) => {
            const y = n.y + HEADER_HEIGHT + i * ROW_HEIGHT;
            const tint = r.mark ? c[r.mark.change] : r.flag ? c.warning : null;
            if (tint) {
                out.push({ type: 'rect', x: n.x + 1, y, w: n.width - 2, h: ROW_HEIGHT, fill: tint, fillOpacity: 0.1 });
            }
            if (r.note) {
                out.push(text(n.x + 37, y + 17, cut(r.name, n.width - 50, 11, false), { family: SANS, size: 11, italic: true }, c['accent-ink']));
            } else {
                const typeEnd = n.x + n.width - 12 - (r.mark ? 22 : 0);
                out.push(text(n.x + 12, y + 17, r.key, { family: MONO, size: 9, weight: 600 }, r.key === 'PK' ? c['accent-ink'] : c.muted));
                out.push(text(n.x + 37, y + 17, cut(r.name, 150, 11), { family: MONO, size: 11 }, r.flag === 'declared-only' ? c.declared : c.fg));
                out.push(text(typeEnd, y + 17, cut(r.type, 110 - (r.mark ? 22 : 0), 11), { family: MONO, size: 11 }, c.muted, 'end'));
                if (r.mark) {
                    const x = n.x + n.width - 28;
                    out.push({ type: 'rect', x, y: y + 5.5, w: 16, h: 16, r: 4, stroke: c[r.mark.change], strokeWidth: 1, dash: r.mark.likely ? [3, 2] : undefined });
                    out.push(text(x + 8, y + 17.5, CHANGE_SYMBOL[r.mark.change], { family: MONO, size: 11, weight: 700 }, c[r.mark.change], 'middle'));
                }
            }
            out.push({ type: 'path', d: `M ${n.x} ${y + ROW_HEIGHT} H ${n.x + n.width}`, stroke: c.line, width: 1 });
        });
        if (n.more > 0 && n.rows.length) {
            out.push(text(n.x + 12, n.y + n.height - MORE_HEIGHT / 2 + 3, `+ ${n.more} columns`, { family: SANS, size: 10 }, c.muted));
        }
    }
    for (const e of model.edges) {
        if (!e.label) {
            continue;
        }
        const { x, y } = e.label;
        const label = cut(e.label.text, 180, 10);
        const chip = e.label.chip ? cut(e.label.chip, 120, 8.5) : '';
        const tw = advance(label, 10);
        const cw = chip ? advance(chip, 8.5) + 8 : 0;
        const w = tw + (chip ? cw + 6 : 0) + 14;
        const x0 = x - w / 2;
        out.push({ type: 'rect', x: x0, y: y - 9, w, h: 18, r: 9, fill: c.surface, stroke: e.inferred ? c.inferred : c.line, strokeWidth: 1 });
        out.push(text(x0 + 7, y + 3.5, label, { family: MONO, size: 10 }, c['accent-ink']));
        if (chip) {
            const tone = e.inferred ? c.inferred : c.accent;
            out.push({ type: 'rect', x: x0 + 7 + tw + 6, y: y - 6, w: cw, h: 12, r: 3, fill: tone, fillOpacity: 0.14 });
            out.push(text(x0 + 7 + tw + 6 + cw / 2, y + 3, chip, { family: MONO, size: 8.5, weight: 600 }, e.inferred ? c.inferred : c['accent-ink'], 'middle'));
        }
    }
    return out;
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number) => String(Math.round(n * 100) / 100);

function svgShape(s: Shape): string {
    if (s.type === 'rect') {
        return `<rect x="${num(s.x)}" y="${num(s.y)}" width="${num(s.w)}" height="${num(s.h)}"${s.r ? ` rx="${s.r}"` : ''} fill="${s.fill ?? 'none'}"${s.fillOpacity !== undefined ? ` fill-opacity="${s.fillOpacity}"` : ''}${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.strokeWidth ?? 1}"` : ''}${s.dash?.length ? ` stroke-dasharray="${s.dash.join(' ')}"` : ''}/>`;
    }
    if (s.type === 'path') {
        return `<path d="${s.d}" fill="${s.fill ?? 'none'}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.width ?? 1}"` : ''}${s.dash?.length ? ` stroke-dasharray="${s.dash.join(' ')}"` : ''}/>`;
    }
    const f = s.font;
    return `<text x="${num(s.x)}" y="${num(s.y)}"${s.anchor && s.anchor !== 'start' ? ` text-anchor="${s.anchor}"` : ''} font-family="${escape(f.family)}" font-size="${f.size}"${f.weight ? ` font-weight="${f.weight}"` : ''}${f.italic ? ' font-style="italic"' : ''} fill="${s.fill}"${s.halo ? ` stroke="${s.halo}" stroke-width="4" paint-order="stroke"` : ''}>${escape(s.text)}</text>`;
}

export function toSvg(model: ImageModel, c: Colors): string {
    const { bounds: b } = model;
    const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${num(b.width)}" height="${num(b.height)}" viewBox="${num(b.x)} ${num(b.y)} ${num(b.width)} ${num(b.height)}">`];
    if (model.fonts) {
        out.push(`<defs><style><![CDATA[\n${model.fonts.replace(/]]>/g, '')}\n]]></style></defs>`);
    }
    out.push(`<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.width)}" height="${num(b.height)}" fill="${c.bg}"/>`);
    out.push(...scene(model, c).map(svgShape));
    out.push('</svg>');
    return `${out.join('\n')}\n`;
}

// The largest scale up to wanted that keeps the canvas under the browser's area limit.
export const pngScale = (width: number, height: number, wanted: number, area = 16_000_000) => Math.max(0.1, Math.min(wanted, Math.sqrt(area / (width * height))));

export function toCanvas(model: ImageModel, c: Colors, wanted = 2): HTMLCanvasElement {
    const { bounds: b } = model;
    const scale = pngScale(b.width, b.height, wanted);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(b.width * scale);
    canvas.height = Math.ceil(b.height * scale);
    const g = canvas.getContext('2d');
    if (!g) {
        throw new Error('This browser cannot draw the image.');
    }
    g.scale(scale, scale);
    g.translate(-b.x, -b.y);
    g.fillStyle = c.bg;
    g.fillRect(b.x, b.y, b.width, b.height);
    for (const s of scene(model, c)) {
        g.save();
        if (s.type === 'rect') {
            g.beginPath();
            g.roundRect(s.x, s.y, s.w, s.h, s.r ?? 0);
            if (s.fill) {
                g.globalAlpha = s.fillOpacity ?? 1;
                g.fillStyle = s.fill;
                g.fill();
                g.globalAlpha = 1;
            }
            if (s.stroke) {
                g.strokeStyle = s.stroke;
                g.lineWidth = s.strokeWidth ?? 1;
                g.setLineDash(s.dash ?? []);
                g.stroke();
            }
        } else if (s.type === 'path') {
            const path = new Path2D(s.d);
            if (s.fill) {
                g.fillStyle = s.fill;
                g.fill(path);
            }
            if (s.stroke) {
                g.strokeStyle = s.stroke;
                g.lineWidth = s.width ?? 1;
                g.setLineDash(s.dash ?? []);
                g.stroke(path);
            }
        } else {
            const f = s.font;
            g.font = `${f.italic ? 'italic ' : ''}${f.weight ?? 400} ${f.size}px ${f.family}`;
            g.textAlign = s.anchor === 'middle' ? 'center' : s.anchor === 'end' ? 'right' : 'left';
            if (s.halo) {
                g.lineWidth = 4;
                g.strokeStyle = s.halo;
                g.strokeText(s.text, s.x, s.y);
            }
            g.fillStyle = s.fill;
            g.fillText(s.text, s.x, s.y);
        }
        g.restore();
    }
    return canvas;
}

export function save(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const toPngBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))), 'image/png'));

// The weights the image draws, by family.
const USED_FACES = new Set(['IBM Plex Mono|400', 'IBM Plex Mono|500', 'IBM Plex Mono|600', 'IBM Plex Mono|700', 'IBM Plex Sans|400', 'IBM Plex Sans|600']);

async function dataUrl(url: string): Promise<string> {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) {
        throw new Error(`Could not read ${url} (HTTP ${response.status}).`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:font/woff2;base64,${btoa(binary)}`;
}

let faces: Promise<string> | null = null;

// The page's IBM Plex @font-face rules the image uses, with their WOFF2 files embedded as data URLs (fetched from the
// page's own origin, which a strict CSP allows), so a downloaded SVG renders with the viewer's fonts anywhere. Empty
// when the page has none or they cannot be read; the SVG then falls back to the system fonts it names.
export function fontFaces(): Promise<string> {
    faces ??= (async () => {
        const found = new Map<string, string>();
        for (const sheet of Array.from(document.styleSheets ?? [])) {
            let rules: CSSRuleList;
            try {
                rules = sheet.cssRules;
            } catch {
                continue;
            }
            for (const rule of Array.from(rules)) {
                if (!rule.cssText.startsWith('@font-face') || !('style' in rule)) {
                    continue;
                }
                const style = (rule as CSSStyleRule).style;
                const family = style.getPropertyValue('font-family').replace(/["']/g, '').trim();
                const weight = style.getPropertyValue('font-weight').trim() || '400';
                const key = `${family}|${weight}`;
                const source = /url\(\s*["']?((?:data:font\/woff2[^"')]+)|[^"')]+\.woff2(?:\?[^"')]*)?)["']?\s*\)/.exec(style.getPropertyValue('src'));
                if (!USED_FACES.has(key) || found.has(key) || !source) {
                    continue;
                }
                try {
                    const url = source[1].startsWith('data:') ? source[1] : await dataUrl(new URL(source[1], sheet.href ?? document.baseURI).href);
                    const range = style.getPropertyValue('unicode-range').trim();
                    found.set(key, `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(${url}) format('woff2');${range ? `unicode-range:${range};` : ''}}`);
                } catch {
                    // Leave this face out; the SVG falls back to the next font it names.
                }
            }
        }
        return [...found.values()].join('\n');
    })();
    return faces;
}
