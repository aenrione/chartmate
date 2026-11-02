/**
 * Album art for an exported chart folder.
 *
 * Clone Hero shows a placeholder and scan-chart reports `noAlbumArt` when a
 * folder has none, so generated practice charts get a flat colour tile keyed
 * to their title — enough to tell them apart in a song list of ninety-six.
 *
 * Written as a PNG by hand rather than through a canvas: this runs in the CLI
 * too, where there is no DOM.
 */

import {zlibSync} from 'fflate';

// Encore wants 512x512 exactly; anything else is reported as albumArtSize.
const SIZE = 512;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** A flat RGB square as a PNG. */
export function solidPng(
  red: number,
  green: number,
  blue: number,
  size = SIZE,
): Uint8Array {
  // One filter byte (0 = none) plus RGB per pixel, per scanline.
  const raw = new Uint8Array(size * (1 + size * 3));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      raw[offset++] = red;
      raw[offset++] = green;
      raw[offset++] = blue;
    }
  }

  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, size);
  header.setUint32(4, size);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, {level: 6})),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** A stable, reasonably saturated colour for a title. */
export function colourForTitle(title: string): [number, number, number] {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToRgb(hue / 360, 0.45, 0.42);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

export function albumArtFor(title: string): Uint8Array {
  const [r, g, b] = colourForTitle(title);
  return solidPng(r, g, b);
}
