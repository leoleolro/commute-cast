// Cover art, drawn with arithmetic and encoded by hand.
//
// Podcast apps look much better with artwork, and every real image tool
// (ffmpeg, ImageMagick, a headless browser) is an install. A PNG is just
// deflated scanlines plus CRC-checked chunks, and Node ships both — so we
// draw a gradient with a waveform across it and encode it ourselves.

import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Deterministic hue per show name, so each feed keeps its own colour. */
function hueFor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

export function coverPng(seed, size = 1400) {
  const hue = hueFor(seed);
  const [br, bg, bb] = hsl(hue, 0.6, 0.07);
  const [tr, tg, tb] = hsl(hue, 0.62, 0.20);
  const [wr, wg, wb] = hsl((hue + 35) % 360, 0.9, 0.66);

  // Bar heights from a seeded generator, so the same show redraws identically.
  let state = hueFor(`${seed}-bars`) || 1;
  const rand = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const BARS = 21;
  const heights = Array.from({ length: BARS }, (_, i) => {
    const envelope = Math.sin((Math.PI * (i + 0.5)) / BARS); // tall in the middle
    return 0.09 + Math.pow(envelope, 0.8) * (0.16 + rand() * 0.34);
  });

  const barWidth = size / (BARS * 2 + 1);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let p = 0;

  for (let y = 0; y < size; y++) {
    raw[p++] = 0;                                    // filter byte: none
    const t = y / size;
    for (let x = 0; x < size; x++) {
      // Diagonal gradient as the ground.
      const d = (t * 0.65) + (x / size) * 0.35;
      let r = br + (tr - br) * d;
      let g = bg + (tg - bg) * d;
      let b = bb + (tb - bb) * d;

      // Then the waveform, centred, with soft edges.
      const slot = Math.floor(x / barWidth);
      if (slot % 2 === 1) {
        const bar = (slot - 1) / 2;
        if (bar < BARS) {
          const half = heights[bar] / 2;
          const dy = Math.abs(t - 0.5);
          if (dy < half) {
            const edge = Math.min(1, (half - dy) * 26);          // vertical fade
            const withinBar = (x % barWidth) / barWidth;
            const side = Math.min(1, Math.min(withinBar, 1 - withinBar) * 8);
            const a = edge * side * 0.92;
            r += (wr - r) * a;
            g += (wg - g) * a;
            b += (wb - b) * a;
          }
        }
      }
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
