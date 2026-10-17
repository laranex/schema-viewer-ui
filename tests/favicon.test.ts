import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain build script, without type declarations.
import { faviconIco, faviconSvg, rasterize } from '../scripts/favicon.mjs';

describe('favicon', () => {
    it('is deterministic: an ICO wrapping a 32×32 PNG of the Laranex mark', () => {
        const ico: Buffer = faviconIco();
        expect(faviconIco().equals(ico)).toBe(true);
        expect(ico.readUInt16LE(2)).toBe(1);
        expect(ico.readUInt16LE(4)).toBe(1);
        expect([ico[6], ico[7]]).toEqual([32, 32]);
        expect(ico.readUInt32LE(14)).toBe(ico.length - 22);
        expect(ico.subarray(22, 30).toString('hex')).toBe('89504e470d0a1a0a');
        expect(faviconSvg).toContain('viewBox="0 0 40 40"');
    });

    it('draws the dark square, the light L and the accent dot, with transparent corners', () => {
        const pixels: Buffer = rasterize(32);
        const at = (x: number, y: number) => [...pixels.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)];
        expect(at(0, 0)[3]).toBe(0);
        expect(at(4, 16)).toEqual([0x18, 0x18, 0x1b, 255]);
        expect(at(12, 16)).toEqual([0xfa, 0xfa, 0xfa, 255]);
        expect(at(23, 9)).toEqual([0x5b, 0x7c, 0xf5, 255]);
    });
});
