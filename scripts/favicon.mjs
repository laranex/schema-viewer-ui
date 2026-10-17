// The standalone viewer's favicon, from the Laranex mark (.gh-page/public/logo.svg): a dark rounded square, a light L
// and the accent dot. favicon.svg is the mark itself; favicon.ico wraps a 32×32 PNG rasterized here, with no image
// dependency, so every build writes byte-identical files.
import { deflateSync } from 'node:zlib';

const DARK = [0x18, 0x18, 0x1b];
const LIGHT = [0xfa, 0xfa, 0xfa];
const DOT = [0x5b, 0x7c, 0xf5];

export const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#18181b"/><path d="M13 10v20h15v-4.5H17.5V10z" fill="#fafafa"/><circle cx="29" cy="12" r="3" fill="#5b7cf5"/></svg>\n`;

// The mark's color at a point of its 40×40 box, or null outside it.
function colorAt(x, y) {
    if ((x - 29) ** 2 + (y - 12) ** 2 <= 9) {
        return DOT;
    }
    if ((x >= 13 && x <= 17.5 && y >= 10 && y <= 30) || (x >= 13 && x <= 28 && y >= 25.5 && y <= 30)) {
        return LIGHT;
    }
    const cx = Math.min(Math.max(x, 10), 30);
    const cy = Math.min(Math.max(y, 10), 30);
    return x >= 0 && x <= 40 && y >= 0 && y <= 40 && (x - cx) ** 2 + (y - cy) ** 2 <= 100 ? DARK : null;
}

// RGBA pixels, 4×4 samples a pixel.
export function rasterize(size) {
    const pixels = Buffer.alloc(size * size * 4);
    const n = 4;
    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            const sum = [0, 0, 0];
            let covered = 0;
            for (let sy = 0; sy < n; sy++) {
                for (let sx = 0; sx < n; sx++) {
                    const c = colorAt(((px + (sx + 0.5) / n) * 40) / size, ((py + (sy + 0.5) / n) * 40) / size);
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

const CRC = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
});
const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) {
        c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
}

export function png(size) {
    const pixels = rasterize(size);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
    const raw = Buffer.concat(Array.from({ length: size }, (_, y) => Buffer.concat([Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4)])));
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// An ICO file holding one 32×32 PNG image.
export function faviconIco(size = 32) {
    const image = png(size);
    const head = Buffer.alloc(22);
    head.writeUInt16LE(0, 0);
    head.writeUInt16LE(1, 2);
    head.writeUInt16LE(1, 4);
    head.writeUInt8(size, 6);
    head.writeUInt8(size, 7);
    head.writeUInt8(0, 8);
    head.writeUInt8(0, 9);
    head.writeUInt16LE(1, 10);
    head.writeUInt16LE(32, 12);
    head.writeUInt32LE(image.length, 14);
    head.writeUInt32LE(22, 18);
    return Buffer.concat([head, image]);
}
