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
//   false - ship transparent pixels. A web clip cannot declare icon layers the
//           way a native app can, so alpha is the only cue iOS has for inferring
//           them: opaque pixels read as foreground and the system supplies the
//           backdrop and lighting. Baking an opaque background in leaves nothing
//           to separate and the icon renders flat - observed on device at 0%
//           transparency.
//   true  - bake BACKDROP in. Browser tab bars and Android's adaptive-icon mask
//           provide no generated backdrop, so the line art needs its own.
//
// `scale` shrinks the mark inside its canvas before the background is applied.
// icon.svg is drawn to the edge margin iOS needs and overflows the r=204.8 safe
// circle a maskable icon may be cropped to; the maskable output buys that circle
// back here instead, so the two constraints do not have to be reconciled in the
// artwork. Every other output wants the mark at full size.
const OUTPUTS = [
  { out: 'favicon-16x16.png', size: 16, flatten: true },
  { out: 'favicon-32x32.png', size: 32, flatten: true },
  { out: 'apple-touch-icon.png', size: 180, flatten: false },
  { out: 'android-chrome-192x192.png', size: 192, flatten: false },
  { out: 'android-chrome-512x512.png', size: 512, flatten: false },
  { out: 'icon-maskable-512.png', size: 512, flatten: true, scale: 0.92 },
];

// favicon.ico carries several sizes in one file, for the surfaces that still
// request it (bookmarks, some browser chrome).
const ICO_SIZES = [16, 32, 48];

// No threshold guards the property that actually decides this. Across ten
// home-screen observations, ink coverage, cavity count, cavity area, cavity
// perimeter and connected-component count all overlap between the marks iOS
// composited and the marks it pressed onto white - two icons measuring 0.00
// perimeter landed on opposite sides. Four rules built on those numbers were
// each falsified within a day of being written.
//
// What can be checked is whether the artwork is still the one that was tried on
// a device. These are that shape's fingerprint; drifting from them means the
// result is unknown again, not that it got worse.
const VERIFIED_INK_RATIO = 0.241;
const VERIFIED_COMPONENTS = 16;
const VERIFIED_CAVITY_PERIMETER = 0.0;

// Pixels at or above this alpha count as ink. Antialiased edges land either
// side of it, but the value is pinned by a real sample: an icon whose interior
// was filled at 15% opacity failed on a device, and only a threshold in this
// range scores that fill as a cavity rather than as ink.
const INK_ALPHA = 128;

// Mean saturation of the mark's opaque pixels. A legibility guard, not a
// backdrop control: no backdrop is guaranteed on any surface, so the line art
// has to read on a light tile as well as a dark one, and a near-white mark at
// 0.08 did not.
//
// It says nothing about which backdrop iOS picks. Marks at 0.08 and at 0.92 both
// landed on white, while a mark at 0.86 got a dark one.
//
// Passing this is not the real test. Composite new artwork over white, iOS grey
// and near-black and confirm it reads on all three.
const MIN_SATURATION = 0.5;

const COVERAGE_PROBE = 'apple-touch-icon.png';

// Radius of the circle a maskable icon may be cropped to, as a fraction of its
// width. The maskable output's `scale` is tuned to keep the mark inside it, so
// the result gets measured rather than the constant trusted: reshaping icon.svg
// moves the outermost ink and nothing else would catch a scale that no longer
// buys enough back.
const MASKABLE_SAFE_RADIUS = 0.4;

const MASKABLE_PROBE = 'icon-maskable-512.png';

const SOURCE = 'icon.svg';

function render({ size, flatten, scale = 1 }) {
  const inner = Math.round(size * scale);
  const pad = size - inner;
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  // sharp orders its pipeline internally rather than by call order, and flatten
  // runs before extend - so the padding has to carry the final background
  // itself, or a flattened output ends up with a transparent border.
  const surround = flatten ? BACKDROP : clear;

  let pipeline = sharp(path.join(publicDir, SOURCE), { density: RASTER_DENSITY })
    .resize(inner, inner, { fit: 'contain', background: clear });

  if (pad > 0) {
    const before = Math.floor(pad / 2);
    pipeline = pipeline.extend({
      top: before,
      left: before,
      bottom: pad - before,
      right: pad - before,
      background: surround,
    });
  }

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

// Measure the maskable mark from a transparent render of the same geometry.
// The shipped file is flattened, so alpha is the only way to tell ink from
// backdrop without assuming the artwork never uses BACKDROP as a colour.
const maskable = OUTPUTS.find((output) => output.out === MASKABLE_PROBE);

if (maskable) {
  const probe = await render({ ...maskable, flatten: false }).raw().toBuffer({ resolveWithObject: true });
  const { data: bytes, info: shape } = probe;
  const centre = shape.width / 2;
  let inkRadius = 0;

  for (let y = 0; y < shape.height; y += 1) {
    for (let x = 0; x < shape.width; x += 1) {
      if (bytes[(y * shape.width + x) * shape.channels + 3] === 0) continue;
      const radius = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
      if (radius > inkRadius) inkRadius = radius;
    }
  }

  const safeRadius = shape.width * MASKABLE_SAFE_RADIUS;
  console.log(
    `\n${MASKABLE_PROBE}  ink reaches r=${inkRadius.toFixed(0)} of the r=${safeRadius.toFixed(0)} safe circle`,
  );

  if (inkRadius > safeRadius) {
    const fits = (maskable.scale ?? 1) * (safeRadius / inkRadius);
    console.log(
      `WARNING  outside the safe circle, so a circular mask would clip the mark. Set\n` +
        `         scale to ${fits.toFixed(2)} or below for ${MASKABLE_PROBE} in OUTPUTS. Shrink\n` +
        `         this one output, not ${SOURCE} - the shape there is a device-verified sample\n` +
        `         and resizing it invalidates that check.`,
    );
  }
}

// Two properties of the shipped mark decide how it lands on a home screen, so
// measure both in one pass.
//
// BOTH only mean anything for an output that ships transparent. A flattened
// output has no cavities left to trace and no backdrop derived from it, so the
// figures describe nothing. Reporting them anyway produced actively wrong advice
// against artwork whose backdrop was deliberately baked in, so skip both when
// the probe is flattened.
//
// An alpha channel alone proves nothing here - `sips -g hasAlpha` reports yes
// for icons that have no transparent pixel at all - so walk the actual values.
const probeIsTransparent = OUTPUTS.some(
  (output) => output.out === COVERAGE_PROBE && !output.flatten,
);

if (!probeIsTransparent) {
  console.log(
    `\n${COVERAGE_PROBE} is flattened, so it opts out of the iOS Liquid Glass treatment.\n` +
      'Neither the perimeter nor the saturation check applies; skipping both.',
  );
  process.exit(0);
}

const { data, info } = await sharp(path.join(publicDir, COVERAGE_PROBE))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: W, height: H, channels } = info;
const isCavity = (p) => data[p * channels + 3] < INK_ALPHA;

// Flood fill inward from the border. Whatever transparency it cannot reach is
// enclosed by the mark.
const reached = new Uint8Array(W * H);
const queue = [];

for (let x = 0; x < W; x += 1) queue.push(x, x + (H - 1) * W);
for (let y = 0; y < H; y += 1) queue.push(y * W, W - 1 + y * W);

while (queue.length > 0) {
  const p = queue.pop();
  if (reached[p] === 1) continue;
  if (isCavity(p) === false) continue;
  reached[p] = 1;

  const x = p % W;
  const y = (p - x) / W;
  if (x > 0) queue.push(p - 1);
  if (x < W - 1) queue.push(p + 1);
  if (y > 0) queue.push(p - W);
  if (y < H - 1) queue.push(p + W);
}

let boundary = 0;
let saturationTotal = 0;
let opaque = 0;
let inkPixels = 0;

for (let p = 0; p < W * H; p += 1) {
  const alpha = data[p * channels + 3];

  if (isCavity(p)) {
    if (reached[p] === 1) continue;
    const x = p % W;
    const y = (p - x) / W;
    const ink = (q) => isCavity(q) === false;
    if (
      (x > 0 && ink(p - 1)) ||
      (x < W - 1 && ink(p + 1)) ||
      (y > 0 && ink(p - W)) ||
      (y < H - 1 && ink(p + W))
    ) {
      boundary += 1;
    }
    continue;
  }

  inkPixels += 1;

  // Antialiasing blends edge pixels toward transparent, dragging their
  // saturation down, so colour is read from solid interior pixels only.
  if (alpha < 200) continue;

  const i = p * channels;
  const max = Math.max(data[i], data[i + 1], data[i + 2]);
  const min = Math.min(data[i], data[i + 1], data[i + 2]);
  saturationTotal += max === 0 ? 0 : (max - min) / max;
  opaque += 1;
}

// Separate pieces of ink. Reported alongside the rest because it is the axis
// two otherwise identical marks differed on, not because it predicts anything.
const grouped = new Uint8Array(W * H);
let components = 0;

for (let seed = 0; seed < W * H; seed += 1) {
  if (grouped[seed] === 1 || isCavity(seed)) continue;
  components += 1;
  grouped[seed] = 1;
  const walk = [seed];

  while (walk.length > 0) {
    const p = walk.pop();
    const x = p % W;
    const y = (p - x) / W;
    const neighbours = [];
    if (x > 0) neighbours.push(p - 1);
    if (x < W - 1) neighbours.push(p + 1);
    if (y > 0) neighbours.push(p - W);
    if (y < H - 1) neighbours.push(p + W);
    for (const q of neighbours) {
      if (grouped[q] === 0 && isCavity(q) === false) {
        grouped[q] = 1;
        walk.push(q);
      }
    }
  }
}

const inkRatio = inkPixels / (W * H);
const innerPerimeter = boundary / W;
const saturation = opaque === 0 ? 0 : saturationTotal / opaque;

console.log(
  `\n${COVERAGE_PROBE}  ${(inkRatio * 100).toFixed(1)}% ink, ` +
    `${components} component${components === 1 ? '' : 's'}, ` +
    `cavity perimeter ${innerPerimeter.toFixed(2)}, mean saturation ${saturation.toFixed(2)}`,
);

if (saturation < MIN_SATURATION) {
  console.log(
    `WARNING  below the ${MIN_SATURATION} mean saturation the mark needs to read with no\n` +
      `         backdrop behind it. Seen on a home screen: at 0.08 the mark disappeared\n` +
      `         against a light tile. Saturate the colours in ${SOURCE}, or set\n` +
      `         flatten: true to bake BACKDROP in and opt out of Liquid Glass entirely.`,
  );
}

const drifted =
  Math.abs(inkRatio - VERIFIED_INK_RATIO) > 0.005 ||
  components !== VERIFIED_COMPONENTS ||
  Math.abs(innerPerimeter - VERIFIED_CAVITY_PERIMETER) > 0.02;

if (drifted) {
  console.log(
    `WARNING  the mark no longer matches the shape that was checked on a device\n` +
      `         (${(VERIFIED_INK_RATIO * 100).toFixed(1)}% ink, ${VERIFIED_COMPONENTS} components, perimeter ${VERIFIED_CAVITY_PERIMETER.toFixed(2)}), so whether iOS\n` +
      `         composites it is unknown again - no property of the artwork predicts that.\n` +
      `         Add the page to an iPhone home screen: a dark tile means iOS composited the\n` +
      `         mark, a white one means it did not. Then update the VERIFIED_ constants.`,
  );
} else {
  console.log(`Matches the shape a device confirmed iOS composites.`);
}
