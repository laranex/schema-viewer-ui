import { describe, expect, it } from 'vitest';
import { boundsOf, clip, COLOR_TOKENS, cut, pngScale, toSvg, type Colors, type ImageModel } from '../src/viewer/exportImage';

const colors = Object.fromEntries(COLOR_TOKENS.map((k, i) => [k, `#${String(i).padStart(2, '0')}${k.length}${k.length}${k.length}${k.length}`.slice(0, 7)])) as Colors;

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
        expect(svg).toContain('+ 2 more columns');
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

    it('draws comparison marks, diagnostics counts, pivot tags, inferred associations, label chips and crow’s feet', () => {
        const nodes = [
            {
                ...node(0, 'posts'),
                issues: 3,
                pivot: true,
                chip: { change: 'changed' as const, text: '2', likely: true },
                rows: [{ note: false, key: 'FK', name: 'user_id', type: 'bigint', flag: null, mark: { change: 'missing' as const, likely: false } }],
            },
            node(600, 'users'),
        ];
        const svg = toSvg(
            {
                nodes,
                edges: [
                    { kind: 'foreign_key', declaredOnly: false, inferred: true, sx: 300, sy: 70, cx: 450, tx: 600, ty: 70, label: { x: 450, y: 70, text: 'Post → User', chip: 'FK · inferred' }, start: 'many', end: 'parent' },
                    { kind: 'through', declaredOnly: false, sx: 300, sy: 90, cx: 450, tx: 600, ty: 90, label: null, start: null, end: 'arrow' },
                ],
                bounds: boundsOf(nodes),
                fonts: "@font-face{font-family:'IBM Plex Mono';src:url(data:font/woff2;base64,AAAA) format('woff2');}",
            },
            colors,
        );
        expect(svg).toContain('~ 2 likely');
        expect(svg).toContain(`stroke="${colors.changed}" stroke-width="1" stroke-dasharray="3 2"`);
        expect(svg).toMatch(new RegExp(`fill="${colors.missing}" fill-opacity="0.1"`));
        expect(svg).toContain('>−</text>');
        expect(svg).toContain('>3</text>');
        expect(svg).toContain('>PIVOT</text>');
        expect(svg).toContain(`stroke="${colors.inferred}" stroke-width="1.8" stroke-dasharray="10 3 2 3"`);
        expect(svg).toContain('>FK · inferred</text>');
        // The crow's foot at the referencing end: three lines meeting 12px out from the card.
        expect(svg).toContain('<path d="M 312 70 L 300 64" fill="none"');
        expect(svg).toContain('<path d="M 312 70 L 300 76" fill="none"');
        // The double bar at the referenced end and the arrow of a through relationship.
        expect(svg).toContain('<path d="M 592 64 L 592 76" fill="none"');
        expect(svg).toContain(`<path d="M 590 85 L 600 90 L 590 95 Z" fill="${colors.accent}"/>`);
        expect(svg).toContain('<style><![CDATA[');
        expect(svg).toContain('@font-face');
        expect(svg).not.toContain('var(--');
    });

    it('keeps the fonts when cutting to the visible area', () => {
        const fonts = '@font-face{}';
        expect(clip({ ...model(), fonts }, { x: 0, y: 0, width: 10, height: 10 }).fonts).toBe(fonts);
    });
});
