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
import { fileURLToPath } from 'node:url';
import { pcmFromWav, trimEdges, SAMPLE_RATE } from './wav.js';

const run = promisify(execFile);

export const PIPER_HOME = path.join(homedir(), '.local', 'share', 'commute-cast');
export const KOKORO_HOME = path.join(PIPER_HOME, 'kokoro');
export const kokoroPython = () => path.join(KOKORO_HOME, '.venv', 'bin', 'python');
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

export async function kokoroInstalled() {
  return (await exists(kokoroPython())) && (await exists(path.join(KOKORO_HOME, 'kokoro-v1.0.onnx')));
}

/** Kokoro voices are named by accent: a=American, b=British, and so on. */
function kokoroLang(voice) {
  const map = { a: 'en-us', b: 'en-gb', e: 'es', f: 'fr-fr', h: 'hi', i: 'it', j: 'ja', p: 'pt-br', z: 'cmn' };
  return map[voice[0]] || 'en-us';   // a blend spec starts with its first voice, which is enough
}

/**
 * Kokoro: a much larger, much more natural model than piper, still offline and
 * still free. It runs at 24 kHz where everything else here is 22.05 kHz, so
 * each clip is resampled on the way out — afconvert ships with macOS and does
 * a proper job of it, which a naive stride would not.
 */
export async function kokoroBatch(voice, texts, { speed = 1 } = {}, dir) {
  if (!texts.length) return [];
  const outDir = path.join(dir, `kokoro-${voice}-${Math.abs(hash(texts.join('|')))}`);
  await mkdir(outDir, { recursive: true });
  const inputFile = path.join(outDir, 'lines.txt');
  await writeFile(inputFile, `${texts.map(oneLine).join('\n')}\n`, 'utf8');

  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'kokoro_batch.py');
  const { stdout } = await run(kokoroPython(), [
    script, KOKORO_HOME, voice, String(speed), kokoroLang(voice), inputFile, outDir,
  ], { timeout: 60 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 });

  const written = [...stdout.matchAll(/^WROTE (\d+) (\d+) (.+)$/gm)];
  if (written.length !== texts.length) {
    throw new Error(`kokoro produced ${written.length} clips for ${texts.length} lines`);
  }
  return Promise.all(written.map(async ([, , rate, file]) => {
    let wav = file;
    if (Number(rate) !== SAMPLE_RATE) {
      wav = `${file}.${SAMPLE_RATE}.wav`;
      await run('afconvert', ['-f', 'WAVE', '-d', `LEI16@${SAMPLE_RATE}`, '-c', '1', file, wav]);
    }
    return trimEdges(pcmFromWav(await readFile(wav)));
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
  if (role.engine === 'kokoro') return `kokoro:${role.voice}:${role.speed ?? 1}`;
  if (role.engine === 'piper') return `piper:${role.model}:${role.lengthScale ?? 1}:${role.sentenceSilence ?? 0.15}`;
  return `say:${role.voice}:${role.rate ?? 178}`;
}

export async function synthesize(role, texts, dir) {
  if (role.engine === 'kokoro') return kokoroBatch(role.voice, texts, role, dir);
  if (role.engine === 'piper') return piperBatch(role.model, texts, role, dir);
  return sayBatch(role.voice, texts, role, dir);
}

/** Which configured roles can't actually be rendered right now. */
export async function missingVoices(voices) {
  const problems = [];
  const usingKokoro = Object.values(voices).some((v) => v.engine === 'kokoro');
  if (usingKokoro && !(await kokoroInstalled())) {
    return ['kokoro is not installed — run: pod setup --kokoro'];
  }
  const usingPiper = Object.values(voices).some((v) => v.engine === 'piper');
  if (usingPiper && !(await piperInstalled())) {
    return ['piper is not installed — run: pod setup'];
  }
  const models = new Set(await installedModels());
  const { stdout } = await run('say', ['-v', '?']).catch(() => ({ stdout: '' }));
  const sayVoices = stdout.split('\n').map((l) => l.split(/\s{2,}|\s+(?=[a-z]{2}_)/)[0].trim());

  for (const [name, role] of Object.entries(voices)) {
    if (role.engine === 'kokoro') {
      continue; // the voice pack carries all 54; a bad name fails loudly at render
    } else if (role.engine === 'piper') {
      if (!models.has(role.model)) problems.push(`${name}: piper model "${role.model}" not downloaded`);
    } else if (!sayVoices.includes(role.voice)) {
      problems.push(`${name}: macOS voice "${role.voice}" not installed`);
    }
  }
  return problems;
}
