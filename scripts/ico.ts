// PNG and ICO encoding with no image dependency, for favicon.ico: same pixels in, same bytes out.
import { deflateSync } from 'node:zlib';

const CRC = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) {
        c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
};

function chunk(type: string, data: Buffer) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
}

// An 8-bit RGBA PNG of size×size pixels.
export function png(pixels: Uint8Array, size: number): Buffer {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header.set([8, 6, 0, 0, 0], 8);
    const raw = Buffer.concat(Array.from({ length: size }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.from(pixels.subarray(y * size * 4, (y + 1) * size * 4))])));
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// An ICO file with one PNG image per size.
export function ico(images: { size: number; png: Buffer }[]): Buffer {
    const head = Buffer.alloc(6 + 16 * images.length);
    head.writeUInt16LE(0, 0);
    head.writeUInt16LE(1, 2);
    head.writeUInt16LE(images.length, 4);
    let offset = head.length;
    images.forEach(({ size, png: data }, i) => {
        const at = 6 + 16 * i;
        head.writeUInt8(size % 256, at);
        head.writeUInt8(size % 256, at + 1);
        head.writeUInt8(0, at + 2);
        head.writeUInt8(0, at + 3);
        head.writeUInt16LE(1, at + 4);
        head.writeUInt16LE(32, at + 6);
        head.writeUInt32LE(data.length, at + 8);
        head.writeUInt32LE(offset, at + 12);
        offset += data.length;
    });
    return Buffer.concat([head, ...images.map((i) => i.png)]);
}
