// Generates the app icons as PNGs with no image dependencies: a dark tile with
// three rising green bars (the "progress" mark). Run: npm run icons -w @gym-nudge/web
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });

const BG = [0x0f, 0x11, 0x15];
const BAR = [0x34, 0xc7, 0x59];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** @param {number} size @param {number} inset fraction of size kept clear (maskable safe zone) */
function icon(size, inset) {
  const usable = size * (1 - 2 * inset);
  const origin = size * inset;
  const barW = usable * 0.18;
  const gap = usable * 0.1;
  const totalW = barW * 3 + gap * 2;
  const left = origin + (usable - totalW) / 2;
  const base = origin + usable * 0.8;
  const heights = [0.32, 0.5, 0.68].map((h) => h * usable);

  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let color = BG;
      for (let i = 0; i < 3; i++) {
        const x0 = left + i * (barW + gap);
        if (x >= x0 && x < x0 + barW && y < base && y >= base - heights[i]) color = BAR;
      }
      raw.set(color, row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = {
  'icon-192.png': icon(192, 0.08),
  'icon-512.png': icon(512, 0.08),
  'icon-maskable-512.png': icon(512, 0.2),
  'apple-touch-icon.png': icon(180, 0.08),
};
for (const [name, png] of Object.entries(files)) {
  writeFileSync(join(out, name), png);
  console.log(`wrote public/${name}`);
}
