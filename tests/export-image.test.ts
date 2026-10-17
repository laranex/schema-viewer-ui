import { describe, expect, it } from 'vitest';
import { boundsOf, clip, cut, pngScale, toSvg, type Colors, type ImageModel } from '../src/viewer/exportImage';

const colors = Object.fromEntries(['bg', 'surface', 'surface-2', 'line', 'line-strong', 'fg', 'muted', 'accent', 'accent-ink', 'accent-soft', 'fk', 'both', 'declared', 'warning'].map((k) => [k, `#${k.length}${k.length}${k.length}`])) as Colors;

const node = (x: number, title: string) => ({ x, y: 0, width: 300, height: 110, title, subtitle: 'main', rows: [{ note: false, key: 'PK', name: 'id', type: 'bigint', flag: null }], more: 2, declaredOnly: false });
const model = (): ImageModel => {
    const nodes = [node(0, 'users <script>'), node(600, 'posts')];
    return {
        nodes,
        edges: [
            { kind: 'relationship', declaredOnly: false, sx: 600, sy: 60, cx: 450, tx: 300, ty: 60, label: { x: 450, y: 60, text: 'author & editor' } },
            { kind: 'foreign_key', declaredOnly: false, sx: 600, sy: 80, cx: 450, tx: 300, ty: 80, label: null },
        ],
        bounds: boundsOf(nodes),
    };
};

describe('image export', () => {
    it('draws cards and edges as SVG, escaping schema text', () => {
        const svg = toSvg(model(), colors);
        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
        expect(svg).toContain('users &lt;script&gt;');
        expect(svg).not.toContain('<script>');
        expect(svg).toContain('author &amp; editor');
        expect(svg).toContain('stroke-dasharray="7 5"');
        expect(svg).toContain('+ 2 columns');
    });

    it('keeps only what lies in the visible area', () => {
        const visible = clip(model(), { x: -10, y: -10, width: 350, height: 200 });
        expect(visible.nodes.map((n) => n.title)).toEqual(['users <script>']);
    });

    it('keeps large images under the canvas area limit', () => {
        expect(pngScale(1000, 1000, 2)).toBe(2);
        expect(pngScale(20000, 20000, 2)).toBeLessThan(1);
    });

    it('cuts long text with an ellipsis', () => {
        expect(cut('a'.repeat(100), 60, 10)).toMatch(/…$/);
        expect(cut('short', 300, 10)).toBe('short');
    });
});
