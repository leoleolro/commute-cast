// Asking iCloud Drive whether a file actually got there.
//
// Copying into the iCloud folder only proves the Mac's disk accepted the file.
// The upload happens later, in the background, and can fail silently — a full
// quota, a name conflict, sync paused. That is exactly how episodes once sat
// "synced" for ten days without ever reaching the phone. These helpers ask the
// system the real questions: is there room, and did the upload finish?

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

export const ICLOUD_ROOT = path.join(homedir(), 'Library', 'Mobile Documents');

export const isInICloud = (p) => path.resolve(p).startsWith(ICLOUD_ROOT);

/** Bytes left in the iCloud account, or null if the system won't say. */
export async function quotaRemaining() {
  try {
    const { stdout, stderr } = await run('brctl', ['quota'], { timeout: 20000 });
    const m = `${stdout}${stderr}`.match(/(\d+)\s+bytes of quota remaining/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * The File Provider's own view of one file. `fileproviderctl evaluate` answers
 * in about 50 ms and reports the flags that matter: uploaded, uploading,
 * conflicted, paused, and any upload error.
 */
export async function uploadState(file) {
  let out;
  try {
    const { stdout, stderr } = await run('fileproviderctl', ['evaluate', file], { timeout: 20000 });
    out = `${stdout}${stderr}`;
  } catch (err) {
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }
  if (!out || /No item for URL/.test(out)) return { known: false };
  const flag = (key) => {
    const m = out.match(new RegExp(`\\b${key} = (\\d)`));
    return m ? m[1] === '1' : null;
  };
  const error = out.match(/uploadingError = ([^;]+);/);
  return {
    known: true,
    uploaded: flag('isUploaded'),
    uploading: flag('isUploading'),
    conflicts: flag('hasUnresolvedConflicts'),
    paused: flag('isSyncPaused'),
    error: error ? error[1].replace(/\s+/g, ' ').trim().slice(0, 160) : null,
  };
}

/** Classify a state into one word the CLI can act on. */
export function verdict(s) {
  if (!s.known) return 'unknown';
  if (s.error) return 'failed';
  if (s.conflicts) return 'conflict';
  if (s.paused) return 'paused';
  if (s.uploaded) return 'uploaded';
  return 'uploading';
}

/** Poll until every file has settled one way or the other, or time runs out. */
export async function waitForUpload(files, { timeoutMs = 60000, intervalMs = 2000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const states = await Promise.all(files.map(async (file) => {
      const s = await uploadState(file);
      return { file, ...s, verdict: verdict(s) };
    }));
    const pending = states.filter((s) => s.verdict === 'uploading');
    onTick?.(states.length - pending.length, states.length);
    if (!pending.length || Date.now() >= deadline) return states;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export const mb = (bytes) => `${(bytes / 1048576).toFixed(bytes < 10 * 1048576 ? 1 : 0)} MB`;
