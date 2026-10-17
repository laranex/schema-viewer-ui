import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ico, png } from '../scripts/ico';
import { BRAND_PATH, BRAND_RECTS, brandMarkSvg, FAVICON_COLORS, FAVICON_DATA_URI, FAVICON_SVG, faviconPixels } from '../src/viewer/brand';
import { root } from './helpers';

const favicon = () => ico([16, 32].map((size) => ({ size, png: png(faviconPixels(size), size) })));

describe('brand mark and favicon', () => {
    it('is Laravel Schema Viewer’s mark: two tables joined by a relationship on a 24-unit grid', () => {
        expect(BRAND_RECTS).toEqual([
            { x: 2.5, y: 3.5, width: 8, height: 7, rx: 1.5 },
            { x: 13.5, y: 13.5, width: 8, height: 7, rx: 1.5 },
        ]);
        expect(BRAND_PATH).toBe('M10.5 7 H14 a2 2 0 0 1 2 2 V13.5');
        expect(FAVICON_SVG).toContain('viewBox="0 0 24 24"');
        expect(brandMarkSvg('#000')).toContain(`d="${BRAND_PATH}"`);
    });

    it('uses only the theme tokens’ colors, with a dark variant', () => {
        const styles = readFileSync(root('src/viewer/styles.css'), 'utf8');
        const light = styles.slice(styles.indexOf('.lsv {'), styles.indexOf(".lsv[data-theme='dark']"));
        const dark = styles.slice(styles.indexOf(".lsv[data-theme='dark']"), styles.indexOf('.lsv *,'));
        const token = (block: string, name: string) => new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(block)?.[1];
        for (const [block, colors] of [
            [light, FAVICON_COLORS.light],
            [dark, FAVICON_COLORS.dark],
        ] as const) {
            expect(colors).toEqual({ tile: token(block, 'surface'), edge: token(block, 'line'), mark: token(block, 'accent') });
        }
        const used = new Set(FAVICON_SVG.match(/#[0-9a-f]{6}/g));
        expect(used).toEqual(new Set([...Object.values(FAVICON_COLORS.light), ...Object.values(FAVICON_COLORS.dark)]));
        expect(FAVICON_SVG).toContain('prefers-color-scheme:dark');
        expect(decodeURIComponent(FAVICON_DATA_URI.replace('data:image/svg+xml,', ''))).toBe(FAVICON_SVG.trim());
    });

    it('writes a deterministic ICO with 16 and 32 pixel PNG images', () => {
        const file = favicon();
        expect(favicon().equals(file)).toBe(true);
        expect(file.readUInt16LE(2)).toBe(1);
        expect(file.readUInt16LE(4)).toBe(2);
        expect([file[6], file[7], file[22], file[23]]).toEqual([16, 16, 32, 32]);
        const first = file.readUInt32LE(18);
        expect(first).toBe(38);
        expect(file.subarray(first, first + 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(file.readUInt32LE(34)).toBe(first + file.readUInt32LE(14));
    });

    it('draws the mark in the accent on the light tile, with transparent corners', () => {
        const pixels = faviconPixels(32);
        const at = (x: number, y: number) => [...pixels.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)];
        expect(at(0, 0)[3]).toBe(0);
        // Inside the first table's outline, and on its left edge (x 2.5 of 24 → 3.3 px).
        expect(at(9, 9)).toEqual([0xff, 0xff, 0xff, 255]);
        expect(at(3, 9)).toEqual([0x1e, 0x3a, 0x8a, 255]);
        // On the relationship's vertical stroke (x 16 of 24).
        expect(at(21, 15)).toEqual([0x1e, 0x3a, 0x8a, 255]);
    });
});
