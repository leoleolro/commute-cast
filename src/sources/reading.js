// Anything else: a markdown file, a text file, or a line you pasted in.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { proseSegments, speakableParagraphs } from '../speakable.js';

export async function readingEpisode(input, { title, isText = false, code = 'mention', show = 'reading' } = {}) {
  const body = isText ? input : await readFile(input, 'utf8');
  const paragraphs = speakableParagraphs(body, { code });
  if (!paragraphs.length) throw new Error('nothing speakable in that input');

  // A leading `# Heading` is the obvious title; otherwise fall back to the
  // filename, and for pasted text just use the opening words.
  const h1 = body.match(/^\s*#\s+(.+)$/m);
  const derived = title
    || (h1 && h1[1].trim())
    || (isText ? `${paragraphs[0].slice(0, 60)}…` : path.basename(input).replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));

  return {
    show,
    title: derived,
    description: paragraphs.join('\n\n').slice(0, 4000),
    segments: proseSegments(body, { voice: 'narrator', code }),
  };
}
