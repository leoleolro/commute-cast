// One-command setup for the neural voices.
//
// Builds a self-contained python venv under ~/.local/share/commute-cast,
// installs piper, works around a packaging bug in the macOS wheel, and pulls
// down the voice models. Nothing is installed system-wide and nothing here
// costs money. Deleting that one directory undoes all of it.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, cp, access, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { PIPER_HOME, piperPython, piperModelDir, piperModel, KOKORO_HOME, kokoroPython } from './engines.js';

const run = promisify(execFile);
const exists = (p) => access(p).then(() => true, () => false);

const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
const VOICES_INDEX = `${HF}/voices.json`;

export const DEFAULT_MODELS = [
  'en_US-hfc_female-medium',   // narrator / host
  'en_US-ryan-high',           // second voice for dialogue
  'ko_KR-kss-medium',          // Korean
];

// The one string the macOS wheel gets wrong. See patchEspeak below.
const BAD_PATH_PREFIX = '/Users/runner/work/piper1-gpl';

async function sitePackages() {
  const { stdout } = await run(piperPython(), ['-c', 'import piper,os;print(os.path.dirname(piper.__file__))']);
  return stdout.trim();
}

/**
 * The published macOS wheel hardcodes the build machine's espeak-ng-data path
 * into espeakbridge.so and ignores the path passed to initialize(), so
 * phonemization fails on every machine but the CI runner's. There is no
 * environment variable or argument that overrides it.
 *
 * Fix: copy the bundled data somewhere stable, overwrite the baked-in string
 * with that path (padding with NULs, since it must not grow), and re-sign —
 * arm64 refuses to load a library whose signature no longer matches.
 */
async function patchEspeak(log) {
  const pkg = await sitePackages();
  const so = path.join(pkg, 'espeakbridge.so');
  const dataDir = path.join(PIPER_HOME, 'espeak-ng-data');

  if (!(await exists(path.join(dataDir, 'phontab')))) {
    await rm(dataDir, { recursive: true, force: true });
    await cp(path.join(pkg, 'espeak-ng-data'), dataDir, { recursive: true });
    log(`  copied espeak-ng-data`);
  }

  const buf = await readFile(so);
  if (buf.includes(Buffer.from(dataDir, 'ascii')) && !buf.includes(Buffer.from(BAD_PATH_PREFIX, 'ascii'))) {
    log('  espeak path already patched');
    return;
  }

  const start = buf.indexOf(Buffer.from(BAD_PATH_PREFIX, 'ascii'));
  if (start === -1) throw new Error('could not find the espeak data path inside espeakbridge.so');
  let end = start;
  while (end < buf.length && buf[end] !== 0) end++;
  const original = buf.toString('ascii', start, end);

  if (dataDir.length > original.length) {
    throw new Error(`cannot patch: "${dataDir}" is longer than the ${original.length}-byte slot in the binary`);
  }
  buf.fill(0, start, end);
  buf.write(dataDir, start, 'ascii');
  await writeFile(so, buf);
  await run('codesign', ['-f', '-s', '-', so]);
  log(`  patched espeak path → ${dataDir}`);
}

async function verify(log) {
  const { stdout } = await run(piperPython(), ['-c',
    'from piper import espeakbridge as e; e.initialize("x"); e.set_voice("en-us"); print(e.get_phonemes("test")[0][0])',
  ], { timeout: 120000 });
  if (!stdout.trim()) throw new Error('phonemizer returned nothing');
  log(`  phonemizer works (${stdout.trim()})`);
}

async function downloadModel(name, index, log) {
  const target = piperModel(name);
  if (await exists(target)) {
    log(`  ${name} already present`);
    return;
  }
  const record = index[name];
  if (!record) throw new Error(`no piper voice called "${name}"`);
  for (const file of Object.keys(record.files)) {
    if (!file.endsWith('.onnx') && !file.endsWith('.onnx.json')) continue;
    const dest = path.join(piperModelDir(), path.basename(file));
    if (await exists(dest)) continue;
    await run('curl', ['-sL', '--fail', '--max-time', '900', '-o', dest, `${HF}/${file}`], { timeout: 16 * 60 * 1000 });
  }
  const { size } = await stat(target);
  log(`  ${name} downloaded (${(size / 1048576).toFixed(0)} MB)`);
}

const KOKORO_RELEASE = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0';

/**
 * Kokoro: a far more natural voice than piper, still offline and still free.
 *
 * It needs Python 3.10+, which this Mac does not have (system python is 3.9
 * and there is no Homebrew). `uv` solves that without sudo — it fetches a
 * standalone CPython into the user's own directory — so the whole install
 * still touches nothing system-wide and costs nothing.
 */
export async function setupKokoro({ log = console.log } = {}) {
  const uv = path.join(process.env.HOME, '.local', 'bin', 'uv');
  if (!(await exists(uv))) {
    log('Installing uv (fetches a private Python, no sudo)…');
    await run('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], { timeout: 10 * 60 * 1000 });
  } else {
    log('uv already installed');
  }

  await mkdir(KOKORO_HOME, { recursive: true });
  if (!(await exists(kokoroPython()))) {
    log('Creating a Python 3.12 environment…');
    await run(uv, ['venv', '--python', '3.12', path.join(KOKORO_HOME, '.venv')], { timeout: 15 * 60 * 1000 });
  }

  const hasKokoro = await run(kokoroPython(), ['-c', 'import kokoro_onnx']).then(() => true, () => false);
  if (!hasKokoro) {
    log('Installing kokoro-onnx…');
    await run(uv, ['pip', 'install', '--python', kokoroPython(), 'kokoro-onnx', 'soundfile'],
      { timeout: 25 * 60 * 1000 });
  } else {
    log('kokoro-onnx already installed');
  }

  for (const [file, size] of [['kokoro-v1.0.onnx', '310 MB'], ['voices-v1.0.bin', '27 MB']]) {
    const dest = path.join(KOKORO_HOME, file);
    if (await exists(dest)) { log(`  ${file} already downloaded`); continue; }
    log(`  downloading ${file} (${size})…`);
    await run('curl', ['-sL', '--fail', '--max-time', '1800', '-o', dest, `${KOKORO_RELEASE}/${file}`],
      { timeout: 31 * 60 * 1000 });
  }
  log('  kokoro ready');
  return { home: KOKORO_HOME };
}

export async function fetchVoiceIndex() {
  const { stdout } = await run('curl', ['-sL', '--fail', '--max-time', '180', VOICES_INDEX], { maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(stdout);
}

export async function setup({ models = DEFAULT_MODELS, log = console.log } = {}) {
  await mkdir(PIPER_HOME, { recursive: true });
  await mkdir(piperModelDir(), { recursive: true });

  if (!(await exists(piperPython()))) {
    log('Creating python environment…');
    await run('/usr/bin/python3', ['-m', 'venv', path.join(PIPER_HOME, 'venv')], { timeout: 5 * 60 * 1000 });
  } else {
    log('Python environment already exists');
  }

  const hasPiper = await run(piperPython(), ['-c', 'import piper']).then(() => true, () => false);
  if (!hasPiper) {
    log('Installing piper (about 100 MB, one time)…');
    await run(piperPython(), ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip'], { timeout: 10 * 60 * 1000 });
    await run(piperPython(), ['-m', 'pip', 'install', '--quiet', 'piper-tts'], { timeout: 25 * 60 * 1000 });
  } else {
    log('piper already installed');
  }

  log('Checking the espeak packaging bug…');
  await patchEspeak(log);
  await verify(log);

  log(`Fetching voice list…`);
  const index = await fetchVoiceIndex();
  log(`Downloading ${models.length} voice model${models.length === 1 ? '' : 's'}…`);
  for (const m of models) await downloadModel(m, index, log);

  return { home: PIPER_HOME, models };
}
