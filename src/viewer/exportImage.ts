import { HEADER_HEIGHT, ROW_HEIGHT, MORE_HEIGHT, type EdgeKind } from './graph';
import { orthogonal } from './routing';

// The diagram as an image, after Laranex Laravel Schema Viewer's ui/src/exportImage.ts: a model of what the viewer
// shows, drawn either as SVG text or straight onto a canvas for PNG. The PNG never loads an image from a blob or data
// URL, so it works under a Content-Security-Policy without img-src blob: or data:.

export type ImageRow = { note: boolean; key: string; name: string; type: string; flag: 'drift' | 'declared-only' | null };
export type ImageNode = { x: number; y: number; width: number; height: number; title: string; subtitle: string; rows: ImageRow[]; more: number; declaredOnly: boolean };
export type ImageEdge = { kind: EdgeKind; declaredOnly: boolean; sx: number; sy: number; cx: number; tx: number; ty: number; label: { x: number; y: number; text: string } | null };
export type Bounds = { x: number; y: number; width: number; height: number };
export type ImageModel = { nodes: ImageNode[]; edges: ImageEdge[]; bounds: Bounds };

export const COLOR_TOKENS = ['bg', 'surface', 'surface-2', 'line', 'line-strong', 'fg', 'muted', 'accent', 'accent-ink', 'accent-soft', 'fk', 'both', 'declared', 'warning'] as const;
export type Colors = Record<(typeof COLOR_TOKENS)[number], string>;

export function colorsOf(element: Element): Colors {
    const style = getComputedStyle(element);
    return Object.fromEntries(COLOR_TOKENS.map((t) => [t, style.getPropertyValue(`--${t}`).trim() || '#888'])) as Colors;
}

const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";
const SANS = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif";

export function boundsOf(nodes: ImageNode[], padding = 32): Bounds {
    if (!nodes.length) {
        return { x: 0, y: 0, width: 400, height: 200 };
    }
    const left = Math.min(...nodes.map((n) => n.x));
    const top = Math.min(...nodes.map((n) => n.y));
    const right = Math.max(...nodes.map((n) => n.x + n.width));
    const bottom = Math.max(...nodes.map((n) => n.y + n.height));
    return { x: left - padding, y: top - padding, width: right - left + padding * 2, height: bottom - top + padding * 2 };
}

// Only what lies in the given area, for "visible area" exports.
export function clip(model: ImageModel, area: Bounds): ImageModel {
    const inside = (x: number, y: number, w: number, h: number) => x < area.x + area.width && x + w > area.x && y < area.y + area.height && y + h > area.y;
    return {
        nodes: model.nodes.filter((n) => inside(n.x, n.y, n.width, n.height)),
        edges: model.edges.filter((e) => inside(Math.min(e.sx, e.tx, e.cx), Math.min(e.sy, e.ty), Math.abs(e.tx - e.sx) + 1, Math.abs(e.ty - e.sy) + 1)),
        bounds: area,
    };
}

// Text cut to a width by the average advance of the font.
export function cut(text: string, width: number, size: number, mono = true): string {
    const max = Math.floor(width / (size * (mono ? 0.6 : 0.56)));
    return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

const STROKE: Record<EdgeKind, { color: keyof Colors; width: number; dash: number[] }> = {
    both: { color: 'both', width: 1.8, dash: [] },
    foreign_key: { color: 'fk', width: 1.6, dash: [] },
    relationship: { color: 'accent', width: 1.8, dash: [7, 5] },
    through: { color: 'accent', width: 1.8, dash: [2, 4] },
};

const strokeOf = (e: ImageEdge, c: Colors) => (e.declaredOnly ? { color: c.declared, width: 1.6, dash: [7, 5] } : { ...STROKE[e.kind], color: c[STROKE[e.kind].color] });
const pathOf = (e: ImageEdge) => orthogonal(e.sx, e.sy, e.cx, e.tx, e.ty);

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toSvg(model: ImageModel, c: Colors): string {
    const { bounds: b } = model;
    const out: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${b.width}" height="${b.height}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}">`,
        `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c.fk}"/></marker>`,
        `<marker id="o" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c.accent}"/></marker></defs>`,
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${c.bg}"/>`,
    ];
    for (const e of model.edges) {
        const s = strokeOf(e, c);
        const marker = e.kind === 'relationship' || e.kind === 'through' ? 'o' : 'a';
        out.push(`<path d="${pathOf(e)}" fill="none" stroke="${s.color}" stroke-width="${s.width}"${s.dash.length ? ` stroke-dasharray="${s.dash.join(' ')}"` : ''} marker-end="url(#${marker})"/>`);
    }
    for (const n of model.nodes) {
        out.push(`<g><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="10" fill="${c.surface}" stroke="${n.declaredOnly ? c.declared : c['line-strong']}"${n.declaredOnly ? ' stroke-dasharray="6 4"' : ''}/>`);
        out.push(`<path d="M${n.x} ${n.y + HEADER_HEIGHT}H${n.x + n.width}" stroke="${c.line}"/>`);
        out.push(`<text x="${n.x + 12}" y="${n.y + 24}" font-family="${escape(MONO)}" font-size="12" font-weight="600" fill="${c.fg}">${escape(cut(n.title, n.width - 24, 12))}</text>`);
        out.push(`<text x="${n.x + 12}" y="${n.y + 40}" font-family="${escape(SANS)}" font-size="10" fill="${c.muted}">${escape(cut(n.subtitle, n.width - 24, 10, false))}</text>`);
        n.rows.forEach((r, i) => {
            const y = n.y + HEADER_HEIGHT + i * ROW_HEIGHT;
            if (r.flag) {
                out.push(`<rect x="${n.x + 1}" y="${y}" width="${n.width - 2}" height="${ROW_HEIGHT}" fill="${c.warning}" fill-opacity="0.1"/>`);
            }
            if (r.note) {
                out.push(`<text x="${n.x + 37}" y="${y + 17}" font-family="${escape(SANS)}" font-size="11" font-style="italic" fill="${c['accent-ink']}">${escape(cut(r.name, n.width - 50, 11, false))}</text>`);
            } else {
                out.push(`<text x="${n.x + 12}" y="${y + 17}" font-family="${escape(MONO)}" font-size="9" font-weight="600" fill="${r.key === 'PK' ? c['accent-ink'] : c.muted}">${r.key}</text>`);
                out.push(`<text x="${n.x + 37}" y="${y + 17}" font-family="${escape(MONO)}" font-size="11" fill="${r.flag === 'declared-only' ? c.declared : c.fg}">${escape(cut(r.name, 150, 11))}</text>`);
                out.push(`<text x="${n.x + n.width - 12}" y="${y + 17}" text-anchor="end" font-family="${escape(MONO)}" font-size="11" fill="${c.muted}">${escape(cut(r.type, 110, 11))}</text>`);
            }
            out.push(`<path d="M${n.x} ${y + ROW_HEIGHT}H${n.x + n.width}" stroke="${c.line}"/>`);
        });
        if (n.more > 0 && n.rows.length) {
            out.push(`<text x="${n.x + 12}" y="${n.y + n.height - MORE_HEIGHT / 2 + 3}" font-family="${escape(SANS)}" font-size="10" fill="${c.muted}">+ ${n.more} columns</text>`);
        }
        out.push('</g>');
    }
    for (const e of model.edges) {
        if (e.label) {
            out.push(`<text x="${e.label.x}" y="${e.label.y + 3}" text-anchor="middle" font-family="${escape(MONO)}" font-size="10" fill="${c['accent-ink']}" stroke="${c.bg}" stroke-width="4" paint-order="stroke">${escape(cut(e.label.text, 210, 10))}</text>`);
        }
    }
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
    const text = (value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') => {
        g.font = font;
        g.fillStyle = color;
        g.textAlign = align;
        g.fillText(value, x, y);
    };
    const arrow = (e: ImageEdge, color: string) => {
        const dir = Math.sign(e.tx - e.cx) || 1;
        g.save();
        g.setLineDash([]);
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(e.tx, e.ty);
        g.lineTo(e.tx - dir * 8, e.ty - 4);
        g.lineTo(e.tx - dir * 8, e.ty + 4);
        g.closePath();
        g.fill();
        g.restore();
    };
    for (const e of model.edges) {
        const s = strokeOf(e, c);
        g.strokeStyle = s.color;
        g.lineWidth = s.width;
        g.setLineDash(s.dash);
        g.stroke(new Path2D(pathOf(e)));
        arrow(e, s.color);
    }
    g.setLineDash([]);
    for (const n of model.nodes) {
        g.fillStyle = c.surface;
        g.strokeStyle = n.declaredOnly ? c.declared : c['line-strong'];
        g.setLineDash(n.declaredOnly ? [6, 4] : []);
        g.beginPath();
        g.roundRect(n.x, n.y, n.width, n.height, 10);
        g.fill();
        g.stroke();
        g.setLineDash([]);
        g.strokeStyle = c.line;
        g.beginPath();
        g.moveTo(n.x, n.y + HEADER_HEIGHT);
        g.lineTo(n.x + n.width, n.y + HEADER_HEIGHT);
        g.stroke();
        text(cut(n.title, n.width - 24, 12), n.x + 12, n.y + 24, `600 12px ${MONO}`, c.fg);
        text(cut(n.subtitle, n.width - 24, 10, false), n.x + 12, n.y + 40, `10px ${SANS}`, c.muted);
        n.rows.forEach((r, i) => {
            const y = n.y + HEADER_HEIGHT + i * ROW_HEIGHT;
            if (r.flag) {
                g.globalAlpha = 0.1;
                g.fillStyle = c.warning;
                g.fillRect(n.x + 1, y, n.width - 2, ROW_HEIGHT);
                g.globalAlpha = 1;
            }
            if (r.note) {
                text(cut(r.name, n.width - 50, 11, false), n.x + 37, y + 17, `italic 11px ${SANS}`, c['accent-ink']);
            } else {
                text(r.key, n.x + 12, y + 17, `600 9px ${MONO}`, r.key === 'PK' ? c['accent-ink'] : c.muted);
                text(cut(r.name, 150, 11), n.x + 37, y + 17, `11px ${MONO}`, r.flag === 'declared-only' ? c.declared : c.fg);
                text(cut(r.type, 110, 11), n.x + n.width - 12, y + 17, `11px ${MONO}`, c.muted, 'right');
            }
            g.strokeStyle = c.line;
            g.beginPath();
            g.moveTo(n.x, y + ROW_HEIGHT);
            g.lineTo(n.x + n.width, y + ROW_HEIGHT);
            g.stroke();
        });
        if (n.more > 0 && n.rows.length) {
            text(`+ ${n.more} columns`, n.x + 12, n.y + n.height - MORE_HEIGHT / 2 + 3, `10px ${SANS}`, c.muted);
        }
    }
    for (const e of model.edges) {
        if (e.label) {
            g.font = `10px ${MONO}`;
            g.textAlign = 'center';
            g.lineWidth = 4;
            g.strokeStyle = c.bg;
            const value = cut(e.label.text, 210, 10);
            g.strokeText(value, e.label.x, e.label.y + 3);
            g.fillStyle = c['accent-ink'];
            g.fillText(value, e.label.x, e.label.y + 3);
        }
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
