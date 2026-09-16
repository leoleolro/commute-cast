// Minimal RIFF/WAVE helpers.
//
// Every clip in this project is mono 16-bit little-endian PCM at 22050 Hz —
// the exact format `say --data-format=LEI16@22050` emits for every voice,
// English and Korean alike. Because the format never varies, stitching two
// clips together is just concatenating their sample bytes, so we can build a
// multi-voice episode without ffmpeg, sox, or anything else to install.

export const SAMPLE_RATE = 22050;
export const BYTES_PER_SAMPLE = 2;
const BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_SAMPLE;

/** Pull the raw sample bytes out of a WAV file. */
export function pcmFromWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  // Chunk offsets are not fixed: `say` writes a JUNK padding chunk ahead of
  // fmt, so the data never starts at the textbook offset 44. Walk the chunks.
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') {
      return buf.subarray(off + 8, Math.min(off + 8 + size, buf.length));
    }
    off += 8 + size + (size % 2); // chunks are word-aligned
  }
  throw new Error('no data chunk in WAV');
}

/** A buffer of digital silence. */
export function silence(seconds) {
  return Buffer.alloc(Math.max(0, Math.round(seconds * SAMPLE_RATE)) * BYTES_PER_SAMPLE);
}

/** Wrap raw samples back into a playable WAV file. */
export function wavFromPcm(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);            // fmt chunk size
  header.writeUInt16LE(1, 20);             // PCM
  header.writeUInt16LE(1, 22);             // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(BYTES_PER_SECOND, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);            // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function durationOf(pcm) {
  return pcm.length / BYTES_PER_SECOND;
}

/** Trim leading/trailing near-silence so segments butt up cleanly. */
export function trimEdges(pcm, threshold = 300) {
  const total = Math.floor(pcm.length / BYTES_PER_SAMPLE);
  let first = 0;
  let last = total - 1;
  while (first < total && Math.abs(pcm.readInt16LE(first * 2)) < threshold) first++;
  while (last > first && Math.abs(pcm.readInt16LE(last * 2)) < threshold) last--;
  if (first >= last) return pcm;
  // Leave a sliver of room so words don't sound clipped at the attack.
  const pad = Math.round(SAMPLE_RATE * 0.04);
  const from = Math.max(0, first - pad) * 2;
  const to = Math.min(total - 1, last + pad) * 2;
  return pcm.subarray(from, to);
}
