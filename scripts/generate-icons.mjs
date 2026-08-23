#!/usr/bin/env node
// Rasterises every icon in public/ from a single source, public/icon.svg.
// Workflow: edit public/icon.svg -> npm run icons:generate -> commit the output.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));

// Matches theme_color / background_color in public/manifest.json.
const BACKDROP = '#020617';

// Rasterise well above the target size, then downscale, so thin strokes stay
// smooth at 16x16.
const RASTER_DENSITY = 384;

// `flatten` decides who paints the background behind the mark:
//   false - ship transparent pixels. iOS reads the opaque pixels as the icon's
//           foreground and generates its own backdrop plus Liquid Glass lighting;
//           baking in an opaque background opts the icon out of that treatment.
//   true  - bake BACKDROP in. Browser tab bars and Android's adaptive-icon mask
//           provide no generated backdrop, so the line art needs its own.
const OUTPUTS = [
  { out: 'favicon-16x16.png', size: 16, flatten: true },
  { out: 'favicon-32x32.png', size: 32, flatten: true },
  { out: 'apple-touch-icon.png', size: 180, flatten: false },
  { out: 'android-chrome-192x192.png', size: 192, flatten: false },
  { out: 'android-chrome-512x512.png', size: 512, flatten: false },
  { out: 'icon-maskable-512.png', size: 512, flatten: true },
];

// favicon.ico carries several sizes in one file, for the surfaces that still
// request it (bookmarks, some browser chrome).
const ICO_SIZES = [16, 32, 48];

// A tripwire, not a spec. iOS only applies Liquid Glass to a mark thin enough to
// leave most of the canvas transparent; this ratio is the cheapest proxy for the
// real rule, which is "do not fill enclosed areas". Warn below the lowest ratio
// observed on device to still get the treatment.
const MIN_TRANSPARENT_RATIO = 0.763;
const COVERAGE_PROBE = 'apple-touch-icon.png';

const SOURCE = 'icon.svg';

function render({ size, flatten }) {
  const pipeline = sharp(path.join(publicDir, SOURCE), { density: RASTER_DENSITY })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });

  return (flatten ? pipeline.flatten({ background: BACKDROP }) : pipeline).png();
}

// ICO is a directory header followed by the image payloads. sharp cannot write
// .ico, but PNG payloads are legal entries and every current browser decodes
// them, so no extra dependency is needed.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let payloadOffset = header.length + directory.length;

  images.forEach(({ size, data }, i) => {
    const entry = i * 16;
    // A 256px side is encoded as 0; nothing here is that large, but keep the rule explicit.
    directory.writeUInt8(size >= 256 ? 0 : size, entry);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette size: none
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(payloadOffset, entry + 12);
    payloadOffset += data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

for (const output of OUTPUTS) {
  await render(output).toFile(path.join(publicDir, output.out));
  const backdrop = output.flatten ? BACKDROP : 'transparent';
  console.log(`${output.out.padEnd(28)} ${String(output.size).padStart(3)}px  ${backdrop}`);
}

const icoImages = await Promise.all(
  ICO_SIZES.map(async (size) => ({
    size,
    data: await render({ size, flatten: true }).toBuffer(),
  })),
);

await writeFile(path.join(publicDir, 'favicon.ico'), buildIco(icoImages));
console.log(`${'favicon.ico'.padEnd(28)} ${ICO_SIZES.join('/')}px  ${BACKDROP}`);

// An alpha channel alone proves nothing here - `sips -g hasAlpha` reports yes
// for icons that have no transparent pixel at all - so count the actual values.
const { data, info } = await sharp(path.join(publicDir, COVERAGE_PROBE))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

let transparent = 0;
for (let i = 0; i < data.length; i += info.channels) {
  if (data[i + 3] === 0) transparent += 1;
}

const ratio = transparent / (info.width * info.height);
const percent = (ratio * 100).toFixed(1);

if (ratio < MIN_TRANSPARENT_RATIO) {
  console.log(
    `\nWARNING  ${COVERAGE_PROBE} is ${percent}% fully transparent, below the ${MIN_TRANSPARENT_RATIO * 100}% that was\n` +
      `         observed to still get the iOS Liquid Glass treatment. The mark is too solid:\n` +
      `         remove a filled area or thin the strokes - shrinking it does not help much.`,
  );
} else {
  console.log(`\n${COVERAGE_PROBE} is ${percent}% fully transparent - at or above the ratio observed to get Liquid Glass.`);
}
