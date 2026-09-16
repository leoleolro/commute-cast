// Turning a script into a finished episode.
//
// A script is a list of segments; each spoken one is synthesized and the
// resulting PCM is spliced together. Every engine emits mono 16-bit PCM at
// 22050 Hz — that is true of `say --data-format=LEI16@22050` and of every
// piper voice model — so joining clips is just concatenating sample bytes.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { wavFromPcm, silence, durationOf } from './wav.js';
import { synthesize, voiceKey } from './engines.js';

const run = promisify(execFile);

// Synthesis is CPU-bound; a couple of models in flight keeps the cores busy
// without thrashing memory.
const GROUP_CONCURRENCY = 3;

async function pool(items, worker, limit) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

/**
 * Render a script to an m4a file.
 *
 * A segment is either `{ say, voice }` or `{ pause }`. A pause of
 * 'match-previous' stretches to however long the clip before it ran, which is
 * what gives lesson episodes a repeat-after-me gap sized to the actual phrase.
 */
export async function renderScript(script, { outFile, voices, bitrate = 64000, onProgress }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'commute-cast-'));
  try {
    const spoken = script.segments
      .map((seg, i) => ({ seg, i }))
      .filter(({ seg }) => seg.say && seg.say.trim());

    // Loading a voice model costs about a second, so everything sharing a
    // voice is synthesized in one call rather than one call per line.
    const groups = new Map();
    for (const { seg, i } of spoken) {
      const role = voices[seg.voice] || voices.narrator;
      if (!role) throw new Error(`no voice configured for role "${seg.voice}"`);
      const key = voiceKey(role);
      if (!groups.has(key)) groups.set(key, { role, items: [] });
      groups.get(key).items.push({ index: i, text: seg.say });
    }

    const byIndex = new Map();
    let done = 0;
    await pool([...groups.values()], async ({ role, items }) => {
      const clips = await synthesize(role, items.map((x) => x.text), dir);
      items.forEach((item, n) => byIndex.set(item.index, clips[n]));
      done += items.length;
      onProgress?.(done, spoken.length);
    }, GROUP_CONCURRENCY);

    const parts = [];
    let previous = 0;
    for (let i = 0; i < script.segments.length; i++) {
      const seg = script.segments[i];
      if (seg.say) {
        const pcm = byIndex.get(i);
        if (!pcm) continue;
        previous = durationOf(pcm);
        parts.push(pcm);
      } else if (seg.pause !== undefined) {
        parts.push(silence(seg.pause === 'match-previous' ? previous + (seg.extra ?? 0.35) : seg.pause));
      }
    }

    const pcm = Buffer.concat(parts);
    const wavPath = path.join(dir, 'episode.wav');
    await writeFile(wavPath, wavFromPcm(pcm));
    // afconvert ships with macOS. 64 kbps mono AAC is plenty for speech, and
    // is the ceiling this sample rate accepts.
    await run('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(bitrate), wavPath, outFile], {
      timeout: 20 * 60 * 1000,
    });
    return { duration: durationOf(pcm) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export { missingVoices } from './engines.js';
