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
//   false - ship transparent pixels and let iOS supply the backdrop, which is
//           what makes the mark eligible for Liquid Glass. Baking an opaque
//           background in is understood to opt the icon out of that treatment
//           (inherited from the Cozy-Pocket script, not verified here).
//   true  - bake BACKDROP in. Browser tab bars and Android's adaptive-icon mask
//           provide no generated backdrop, so the line art needs its own.
//
// A transparent output therefore only works if the mark stays legible against
// whatever backdrop iOS supplies. One home-screen observation: a near-white mark
// (mean saturation 0.08) rendered almost invisible on a light tile. Hence the
// saturation check at the end of this script - it guards the same output the
// transparency check does. See the MIN_SATURATION comment for what that
// observation does and does not establish.
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

// A tripwire, not a spec. The premise is that iOS only applies Liquid Glass to a
// mark thin enough to leave most of the canvas transparent, and that this ratio
// proxies the real rule, "do not fill enclosed areas".
//
// Inherited unverified from the Cozy-Pocket script this one was adapted from.
// Nothing in this project reproduced it on a device, so treat the figure as a
// convention carried over, not as a measurement.
const MIN_TRANSPARENT_RATIO = 0.763;

// Mean saturation of the mark's opaque pixels.
//
// One failure was actually seen on a home screen: at 0.08 the mark rendered as
// near-invisible pale line art on a light tile. The contrasting case, 0.86,
// was reported to render dark, but only its icon file was measured here.
//
// Why they differ is NOT established - "iOS derives the backdrop from the mark's
// colours" fits, but so does "iOS picks the backdrop by system appearance and a
// mid-luminance mark survives either way". One screenshot cannot separate those,
// so this is a guard against the one observed failure, not a model of iOS. The
// durable fix is a mark legible on any backdrop; check new artwork by
// compositing it over white, iOS grey and near-black.
const MIN_SATURATION = 0.5;

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

// Two properties decide whether iOS's generated backdrop works, so measure both
// in one pass.
//
// BOTH only mean anything for an output that ships transparent. A flattened
// output already carries BACKDROP, so iOS generates no backdrop for it: the
// transparency figure is 0 by construction and the saturation figure describes
// a mark nothing is derived from. Reporting them anyway produced actively wrong
// advice - "the mark is too solid, remove a filled area" against artwork whose
// backdrop was deliberately baked in - so skip both when the probe is flattened.
//
// An alpha channel alone proves nothing for the first one - `sips -g hasAlpha`
// reports yes for icons that have no transparent pixel at all - so count the
// actual values.
const probeIsTransparent = OUTPUTS.some(
  (output) => output.out === COVERAGE_PROBE && !output.flatten,
);

if (!probeIsTransparent) {
  console.log(
    `\n${COVERAGE_PROBE} is flattened, so it opts out of the iOS Liquid Glass treatment.\n` +
      'Neither the transparency nor the saturation check applies; skipping both.',
  );
  process.exit(0);
}

const { data, info } = await sharp(path.join(publicDir, COVERAGE_PROBE))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

let transparent = 0;
let saturationTotal = 0;
let opaque = 0;

for (let i = 0; i < data.length; i += info.channels) {
  if (data[i + 3] === 0) {
    transparent += 1;
    continue;
  }
  // Ignore edge pixels: antialiasing blends them toward transparent, which
  // drags their saturation down and would understate the mark's real colour.
  if (data[i + 3] < 200) continue;

  const max = Math.max(data[i], data[i + 1], data[i + 2]);
  const min = Math.min(data[i], data[i + 1], data[i + 2]);
  saturationTotal += max === 0 ? 0 : (max - min) / max;
  opaque += 1;
}

const transparentRatio = transparent / (info.width * info.height);
const saturation = opaque === 0 ? 0 : saturationTotal / opaque;

console.log(
  `\n${COVERAGE_PROBE}  ${(transparentRatio * 100).toFixed(1)}% transparent, ` +
    `mean saturation ${saturation.toFixed(2)}`,
);

if (transparentRatio < MIN_TRANSPARENT_RATIO) {
  console.log(
    `WARNING  below the ${(MIN_TRANSPARENT_RATIO * 100).toFixed(1)}% transparency assumed to still get the iOS\n` +
      `         Liquid Glass treatment. The mark is too solid: remove a filled area or thin\n` +
      `         the strokes - shrinking it does not help much.`,
  );
}

if (saturation < MIN_SATURATION) {
  console.log(
    `WARNING  below the ${MIN_SATURATION} mean saturation needed for iOS to generate a DARK\n` +
      `         backdrop. Seen on a home screen: at 0.08 the mark disappeared against a\n` +
      `         light tile. Saturate the stroke\n` +
      `         colours in ${SOURCE}, or set flatten: true to bake BACKDROP in and opt out\n` +
      `         of Liquid Glass entirely.`,
  );
}

if (transparentRatio >= MIN_TRANSPARENT_RATIO && saturation >= MIN_SATURATION) {
  console.log('Both above their thresholds. Neither predicts the backdrop iOS will pick:\nverify new artwork over a light and a dark backdrop before shipping it.');
}
