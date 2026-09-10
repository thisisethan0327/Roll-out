// Home-screen icons in the house register: #050505 ground, #ffb733 corner
// brackets and a centred gold square — geometric, so it needs no font.
// node scripts/gen-icons.mjs  → public/icon-192.png, icon-512.png, apple-touch-icon.png
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const svg = (size) => {
    const s = size, m = s * 0.19, L = s * 0.19, w = Math.max(2, s * 0.052), c = s * 0.13;
    const b = (x, y, dx, dy) => `<path d="M${x} ${y + dy * L}V${y}H${x + dx * L}" fill="none" stroke="#ffb733" stroke-width="${w}" stroke-linecap="square"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#050505"/>
  ${b(m, m, 1, 1)}${b(s - m, m, -1, 1)}${b(m, s - m, 1, -1)}${b(s - m, s - m, -1, -1)}
  <rect x="${s / 2 - c / 2}" y="${s / 2 - c / 2}" width="${c}" height="${c}" fill="#ffb733"/>
</svg>`;
};

for (const [file, size] of [['public/icon-192.png', 192], ['public/icon-512.png', 512], ['public/apple-touch-icon.png', 180]]) {
    const png = await sharp(Buffer.from(svg(size))).png().toBuffer();
    writeFileSync(file, png);
    console.log(file, png.length, 'bytes');
}
