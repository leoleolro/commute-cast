// Speech engines.
//
// Two are supported. `say` is the macOS built-in: instant, always present, and
// honestly not pleasant to listen to for more than a couple of minutes. `piper`
// is a neural engine that runs entirely offline on this Mac once installed —
// same "costs nothing" property, vastly better voices, and it has a real Korean
// model. Piper is the default; say is the fallback when piper isn't set up.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { pcmFromWav, trimEdges } from './wav.js';

const run = promisify(execFile);

export const PIPER_HOME = path.join(homedir(), '.local', 'share', 'commute-cast');
export const piperPython = () => path.join(PIPER_HOME, 'venv', 'bin', 'python');
export const piperModelDir = () => path.join(PIPER_HOME, 'models');
export const piperModel = (name) => path.join(piperModelDir(), `${name}.onnx`);

const exists = (p) => access(p).then(() => true, () => false);

export async function piperInstalled() {
  return (await exists(piperPython())) && (await exists(piperModelDir()));
}

export async function installedModels() {
  try {
    const { readdir } = await import('node:fs/promises');
    return (await readdir(piperModelDir()))
      .filter((f) => f.endsWith('.onnx'))
      .map((f) => f.replace(/\.onnx$/, ''));
  } catch {
    return [];
  }
}

/** Piper takes one line of input per clip, so newlines must not survive. */
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * Synthesize many texts with one model in a single process.
 *
 * Loading the model costs about a second, so batching a 70-segment lesson into
 * one call rather than seventy is the difference between a minute and an hour.
 * Piper logs "Wrote <path>" per line in input order, which is how the outputs
 * are matched back up — the generated filenames themselves are opaque.
 */
export async function piperBatch(model, texts, { lengthScale = 1, sentenceSilence = 0.15 } = {}, dir) {
  if (!texts.length) return [];
  const outDir = path.join(dir, `piper-${model}-${Math.abs(hash(texts.join('|')))}`);
  await mkdir(outDir, { recursive: true });
  const inputFile = path.join(outDir, 'lines.txt');
  await writeFile(inputFile, `${texts.map(oneLine).join('\n')}\n`, 'utf8');

  const { stderr } = await run(piperPython(), [
    '-m', 'piper',
    '-m', piperModel(model),
    '-i', inputFile,
    '-d', outDir,
    '--output-dir-naming', 'timestamp',
    '--length-scale', String(lengthScale),
    '--sentence-silence', String(sentenceSilence),
  ], { timeout: 30 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 });

  const written = [...stderr.matchAll(/Wrote (.+\.wav)/g)].map((m) => m[1]);
  if (written.length !== texts.length) {
    throw new Error(`piper produced ${written.length} clips for ${texts.length} lines`);
  }
  return Promise.all(written.map(async (f) => {
    const abs = path.isAbsolute(f) ? f : path.join(process.cwd(), f);
    return trimEdges(pcmFromWav(await readFile(abs)));
  }));
}

/** The macOS built-in. One process per clip, but they're cheap. */
export async function sayBatch(voice, texts, { rate = 178 } = {}, dir) {
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    const txt = path.join(dir, `say-${voice.replace(/\W/g, '')}-${i}.txt`);
    const wav = path.join(dir, `say-${voice.replace(/\W/g, '')}-${i}.wav`);
    await writeFile(txt, texts[i], 'utf8');
    await run('say', ['-v', voice, '-r', String(rate), '--data-format=LEI16@22050', '-o', wav, '-f', txt]);
    out.push(trimEdges(pcmFromWav(await readFile(wav))));
  }
  return out;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** A stable key for "these segments can share one synthesis call". */
export function voiceKey(role) {
  return role.engine === 'piper'
    ? `piper:${role.model}:${role.lengthScale ?? 1}:${role.sentenceSilence ?? 0.15}`
    : `say:${role.voice}:${role.rate ?? 178}`;
}

export async function synthesize(role, texts, dir) {
  return role.engine === 'piper'
    ? piperBatch(role.model, texts, role, dir)
    : sayBatch(role.voice, texts, role, dir);
}

/** Which configured roles can't actually be rendered right now. */
export async function missingVoices(voices) {
  const problems = [];
  const usingPiper = Object.values(voices).some((v) => v.engine === 'piper');
  if (usingPiper && !(await piperInstalled())) {
    return ['piper is not installed — run: pod setup'];
  }
  const models = new Set(await installedModels());
  const { stdout } = await run('say', ['-v', '?']).catch(() => ({ stdout: '' }));
  const sayVoices = stdout.split('\n').map((l) => l.split(/\s{2,}|\s+(?=[a-z]{2}_)/)[0].trim());

  for (const [name, role] of Object.entries(voices)) {
    if (role.engine === 'piper') {
      if (!models.has(role.model)) problems.push(`${name}: piper model "${role.model}" not downloaded`);
    } else if (!sayVoices.includes(role.voice)) {
      problems.push(`${name}: macOS voice "${role.voice}" not installed`);
    }
  }
  return problems;
}
