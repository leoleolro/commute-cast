// The episode manifest: one JSON file listing what has been rendered.

import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EPISODES_DIR = path.join(ROOT, 'episodes');
export const ART_DIR = path.join(ROOT, 'art');
const MANIFEST = path.join(ROOT, 'episodes.json');

/**
 * config.json is gitignored — it holds your own voice and lexicon choices — so
 * a fresh clone has only the example. Fall back to it rather than failing, and
 * let the real file shadow it once there is one.
 */
export async function loadConfig() {
  for (const name of ['config.json', 'config.example.json']) {
    try {
      return JSON.parse(await readFile(path.join(ROOT, name), 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  throw new Error('no config.json or config.example.json found');
}

export async function loadEpisodes() {
  try {
    return JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function saveEpisodes(episodes) {
  await writeFile(MANIFEST, `${JSON.stringify(episodes, null, 2)}\n`);
}

export async function addEpisode(entry) {
  const episodes = await loadEpisodes();
  episodes.unshift(entry);           // newest first, the order feeds want
  await saveEpisodes(episodes);
  return entry;
}

export async function removeEpisode(id) {
  const episodes = await loadEpisodes();
  const found = episodes.find((e) => e.id === id || e.id.startsWith(id));
  if (!found) return null;
  await saveEpisodes(episodes.filter((e) => e !== found));
  await unlink(path.join(EPISODES_DIR, found.file)).catch(() => {});
  return found;
}

/** Stable, sortable, human-readable id: 20260901-1042-korean-cafe */
export function makeId(show, title, date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'episode';
  return `${stamp}-${show}-${slug}`;
}
